"""
WatersContractStack - full serverless infrastructure.

Key design decisions for SSE streaming:
  - Lambda invoke mode: RESPONSE_STREAM (required for true streaming through API GW)
  - Lambda timeout: 300s (Claude can take 60-90s on large docs; 60s was too tight)
  - HTTP API Gateway: payload format v2.0 with streaming integration
  - CloudFront /api/* behavior:
      · compress=False          - gzip breaks SSE chunked transfer
      · cache disabled          - streaming responses must never be cached
      · response timeout: 60s   - CloudFront default is 30s; raised to survive long streams
      · ALL_VIEWER origin policy - passes Accept-Encoding, Content-Type etc. through
  - Uploads bucket CORS: PUT + GET for presigned URL direct uploads
  - Frontend bucket: OAC (Origin Access Control) - no public access
"""
from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import (
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_lambda as lambda_,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations as integrations,
    aws_iam as iam,
    aws_secretsmanager as secretsmanager,
    aws_logs as logs,
)
from constructs import Construct
import os


class WatersContractStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── 1. Secrets Manager - ANTHROPIC_API_KEY ──────────────────────────
        anthropic_secret = secretsmanager.Secret(
            self,
            "AnthropicApiKey",
            secret_name="waters/contract/ANTHROPIC_API_KEY",
            description="Anthropic API key for Waters Contract Intelligence",
            # Update after first deploy:
            # aws secretsmanager put-secret-value \
            #   --secret-id waters/contract/ANTHROPIC_API_KEY \
            #   --secret-string '{"ANTHROPIC_API_KEY":"sk-ant-..."}'
            generate_secret_string=secretsmanager.SecretStringGenerator(
                secret_string_template='{"ANTHROPIC_API_KEY": "REPLACE_ME"}',
                generate_string_key="placeholder",
                exclude_punctuation=True,
            ),
        )

        # ── 2. S3 - uploads bucket (private, SSE-S3, 90-day lifecycle) ──────
        uploads_bucket = s3.Bucket(
            self,
            "UploadsBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            versioned=False,
            removal_policy=RemovalPolicy.RETAIN,   # keep contracts on stack destroy
            lifecycle_rules=[
                s3.LifecycleRule(
                    id="expire-uploads-90-days",
                    enabled=True,
                    expiration=Duration.days(90),
                )
            ],
            cors=[
                s3.CorsRule(
                    # Browser uploads directly to S3 via presigned PUT URL
                    allowed_methods=[s3.HttpMethods.PUT, s3.HttpMethods.GET],
                    allowed_origins=["*"],   # tighten to CloudFront domain post-deploy
                    allowed_headers=["*"],
                    max_age=3000,
                )
            ],
        )

        # ── 3. IAM role for Lambda ───────────────────────────────────────────
        lambda_role = iam.Role(
            self,
            "LambdaExecutionRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Waters Contract Lambda - S3 r/w, Secrets Manager read, CloudWatch",
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                )
            ],
        )

        uploads_bucket.grant_read_write(lambda_role)
        anthropic_secret.grant_read(lambda_role)

        # CloudWatch log group - 30-day retention
        log_group = logs.LogGroup(
            self,
            "LambdaLogGroup",
            log_group_name="/aws/lambda/waters-contract-api",
            retention=logs.RetentionDays.ONE_MONTH,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # ── 4. Lambda function ───────────────────────────────────────────────
        deps_layer = lambda_.LayerVersion(
            self,
            "DepsLayer",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "..", "..", "backend", "lambda_layer")
            ),
            compatible_runtimes=[lambda_.Runtime.PYTHON_3_11],
            description="Waters Contract - Python deps (FastAPI, Mangum, Anthropic, boto3…)",
        )

        api_lambda = lambda_.Function(
            self,
            "ApiFunction",
            function_name="waters-contract-api",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="main.handler",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "..", "..", "backend"),
                exclude=[
                    "lambda_layer/**",
                    "__pycache__/**",
                    "*.pyc",
                    "venv/**",
                    ".env",
                    "env",           # also exclude the misnamed env file
                    "*.egg-info/**",
                ],
            ),
            layers=[deps_layer],
            role=lambda_role,
            memory_size=512,
            # ↑ 300s: Claude streaming on a 150-page doc can take 60-90s.
            #   API GW HTTP API has no hard timeout on streaming responses,
            #   but Lambda itself must not time out mid-stream.
            timeout=Duration.seconds(300),
            log_group=log_group,
            environment={
                "UPLOADS_BUCKET":           uploads_bucket.bucket_name,
                "SECRET_NAME":              anthropic_secret.secret_name,
                "APP_AWS_REGION":           self.region,   # AWS_REGION is reserved by Lambda runtime
                "POWERTOOLS_SERVICE_NAME":  "waters-contract",
                "LOG_LEVEL":                "INFO",
            },
            tracing=lambda_.Tracing.ACTIVE,
        )

        # ── 5. HTTP API Gateway (v2) ─────────────────────────────────────────
        # HTTP API supports streaming responses natively via chunked transfer.
        # Payload format v2.0 is required for Mangum + streaming.
        http_api = apigwv2.HttpApi(
            self,
            "HttpApi",
            api_name="waters-contract-api",
            description="Waters Contract Intelligence API",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_origins=["*"],
                allow_methods=[
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.PUT,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allow_headers=[
                    "Content-Type",
                    "Authorization",
                    "X-Requested-With",
                    "Cache-Control",
                    "Accept",
                ],
                max_age=Duration.seconds(300),
            ),
        )

        lambda_integration = integrations.HttpLambdaIntegration(
            "LambdaIntegration",
            api_lambda,
            payload_format_version=apigwv2.PayloadFormatVersion.VERSION_2_0,
        )

        http_api.add_routes(
            path="/{proxy+}",
            methods=[apigwv2.HttpMethod.ANY],
            integration=lambda_integration,
        )
        http_api.add_routes(
            path="/",
            methods=[apigwv2.HttpMethod.ANY],
            integration=lambda_integration,
        )

        # ── 6. S3 - frontend hosting bucket ─────────────────────────────────
        frontend_bucket = s3.Bucket(
            self,
            "FrontendBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        # ── 7. CloudFront OAC ────────────────────────────────────────────────
        oac = cloudfront.S3OriginAccessControl(
            self,
            "FrontendOAC",
            description="OAC for Waters Contract frontend bucket",
            signing=cloudfront.Signing.SIGV4_NO_OVERRIDE,
        )

        # ── 8. CloudFront cache policies ─────────────────────────────────────

        # API behavior: no caching, no compression, long response timeout for SSE
        # When TTL=0 (caching disabled), CachePolicy must NOT set HeaderBehavior -
        # CloudFront rejects it. Headers are forwarded via OriginRequestPolicy instead.
        api_cache_policy = cloudfront.CachePolicy(
            self,
            "ApiCachePolicy",
            cache_policy_name="WatersApiNoCache",
            comment="No-cache policy for API Gateway SSE streaming",
            default_ttl=Duration.seconds(0),
            min_ttl=Duration.seconds(0),
            max_ttl=Duration.seconds(0),
            cookie_behavior=cloudfront.CacheCookieBehavior.none(),
            header_behavior=cloudfront.CacheHeaderBehavior.none(),
            query_string_behavior=cloudfront.CacheQueryStringBehavior.none(),
            enable_accept_encoding_gzip=False,    # ← CRITICAL: gzip breaks SSE
            enable_accept_encoding_brotli=False,  # ← CRITICAL: brotli breaks SSE
        )

        # Origin request policy: forward all headers (except Host) to API Gateway.
        # Use ALL_VIEWER_EXCEPT_HOST_HEADER - the managed policy that forwards
        # everything CloudFront receives, which is exactly what we need for SSE.
        api_origin_request_policy = cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER

        # API Gateway origin - no origin_path so CloudFront forwards the full
        # /api/* path unchanged. FastAPI routes are registered as /api/validate,
        # /api/documents etc., so Lambda must receive the full path.
        # read_timeout raised to 60s (default 30s) to survive long SSE streams.
        api_origin = origins.HttpOrigin(
            f"{http_api.api_id}.execute-api.{self.region}.amazonaws.com",
            protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            read_timeout=Duration.seconds(60),
            keepalive_timeout=Duration.seconds(60),
        )

        # ── 9. CloudFront distribution ───────────────────────────────────────
        distribution = cloudfront.Distribution(
            self,
            "CloudFrontDistribution",
            comment="Waters Contract Intelligence",
            default_root_object="index.html",

            # Default behavior: serve React SPA from S3
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(
                    frontend_bucket,
                    origin_access_control=oac,
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress=True,
            ),

            additional_behaviors={
                # /api/* → API Gateway (streaming-safe)
                "/api/*": cloudfront.BehaviorOptions(
                    origin=api_origin,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cache_policy=api_cache_policy,
                    origin_request_policy=api_origin_request_policy,
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                    cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                    compress=False,   # ← CRITICAL: must be False for SSE to work
                ),
            },

            # SPA fallback - React Router handles 404s client-side
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
            ],
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
            minimum_protocol_version=cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        )

        # Grant CloudFront OAC read access to frontend bucket
        frontend_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                sid="AllowCloudFrontOAC",
                effect=iam.Effect.ALLOW,
                principals=[iam.ServicePrincipal("cloudfront.amazonaws.com")],
                actions=["s3:GetObject"],
                resources=[frontend_bucket.arn_for_objects("*")],
                conditions={
                    "StringEquals": {
                        "AWS:SourceArn": (
                            f"arn:aws:cloudfront::{self.account}:"
                            f"distribution/{distribution.distribution_id}"
                        )
                    }
                },
            )
        )

        # ── 10. Frontend S3 bucket is created above ───────────────────────────
        # Files are deployed by the CI/CD workflow using `aws s3 sync`
        # AFTER the frontend is built. BucketDeployment is intentionally NOT
        # used here because it requires frontend/dist/ to exist at CDK synth
        # time, which breaks CI pipelines where the build happens after CDK.

        # ── 11. Stack outputs ─────────────────────────────────────────────────
        CfnOutput(self, "CloudFrontURL",
            value=f"https://{distribution.distribution_domain_name}",
            description="Waters Contract Intelligence - public URL",
            export_name="WatersCloudFrontURL",
        )
        CfnOutput(self, "ApiGatewayURL",
            value=http_api.api_endpoint,
            description="HTTP API Gateway endpoint (use CloudFront /api/* in production)",
            export_name="WatersApiGatewayURL",
        )
        CfnOutput(self, "UploadsBucketName",
            value=uploads_bucket.bucket_name,
            description="S3 bucket for contract file uploads",
            export_name="WatersUploadsBucket",
        )
        CfnOutput(self, "FrontendBucketName",
            value=frontend_bucket.bucket_name,
            description="S3 bucket for React frontend assets",
            export_name="WatersFrontendBucket",
        )
        CfnOutput(self, "SecretArn",
            value=anthropic_secret.secret_arn,
            description="Secrets Manager ARN - update ANTHROPIC_API_KEY after deploy",
            export_name="WatersSecretArn",
        )
        CfnOutput(self, "LambdaFunctionName",
            value=api_lambda.function_name,
            description="Lambda function name",
            export_name="WatersLambdaFunction",
        )
        CfnOutput(self, "CloudFrontDistributionId",
            value=distribution.distribution_id,
            description="CloudFront distribution ID (for cache invalidation)",
            export_name="WatersDistributionId",
        )
