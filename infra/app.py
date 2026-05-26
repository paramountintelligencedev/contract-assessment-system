#!/usr/bin/env python3
"""
Waters Contract Intelligence — AWS CDK entry point.
"""
import aws_cdk as cdk
from stacks.waters_stack import WatersContractStack

app = cdk.App()

WatersContractStack(
    app,
    "WatersContractStack",
    env=cdk.Environment(region="us-east-1"),
    description="Waters Contract Intelligence — serverless full-stack (Lambda + API GW + S3 + CloudFront)",
)

app.synth()
