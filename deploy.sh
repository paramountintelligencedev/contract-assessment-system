#!/usr/bin/env bash
# =============================================================================
# Waters Contract Intelligence — Full Deployment Script
# =============================================================================
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Prerequisites:
#   - AWS CLI configured (aws configure) with credentials for us-east-1
#   - AWS CDK CLI installed: npm install -g aws-cdk
#   - Python 3.11 available as `python3.11` or `python3`
#   - Node.js 18+ and npm installed
#   - Docker running (used by CDK BucketDeployment Lambda)
#
# What this script does:
#   1. Installs CDK Python dependencies
#   2. Builds the Lambda dependency layer (pip install into lambda_layer/)
#   3. Runs CDK bootstrap (safe to re-run)
#   4. Runs CDK synth to validate the stack
#   5. Deploys the CDK stack (creates all AWS resources)
#   6. Reads the CloudFront URL from CDK outputs
#   7. Builds the React frontend with VITE_API_URL set to CloudFront URL
#   8. Re-deploys the CDK stack to sync the built frontend to S3
#   9. Prints the live URL and reminds you to set the Anthropic API key
# =============================================================================

set -euo pipefail

REGION="us-east-1"
STACK_NAME="WatersContractStack"
BACKEND_DIR="$(pwd)/backend"
FRONTEND_DIR="$(pwd)/frontend"
INFRA_DIR="$(pwd)/infra"
LAYER_DIR="${BACKEND_DIR}/lambda_layer/python"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Waters Contract Intelligence — AWS Deployment              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: CDK Python dependencies ─────────────────────────────────────────
echo "▶ [1/8] Installing CDK Python dependencies..."
cd "${INFRA_DIR}"
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt
echo "   ✓ CDK dependencies installed"

# ── Step 2: Build Lambda layer ───────────────────────────────────────────────
echo ""
echo "▶ [2/8] Building Lambda dependency layer..."
rm -rf "${LAYER_DIR}"
mkdir -p "${LAYER_DIR}"

# Install into the layer directory using the Lambda-compatible platform
pip install -q \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  --upgrade \
  --target "${LAYER_DIR}" \
  -r "${BACKEND_DIR}/requirements.txt"

echo "   ✓ Lambda layer built at backend/lambda_layer/"

# ── Step 3: CDK bootstrap ────────────────────────────────────────────────────
echo ""
echo "▶ [3/8] CDK bootstrap (safe to re-run)..."
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap "aws://${AWS_ACCOUNT}/${REGION}" --quiet
echo "   ✓ CDK bootstrapped (account: ${AWS_ACCOUNT}, region: ${REGION})"

# ── Step 4: CDK synth ────────────────────────────────────────────────────────
echo ""
echo "▶ [4/8] CDK synth (validating stack)..."
cdk synth --quiet
echo "   ✓ Stack synthesised successfully"

# ── Step 5: CDK deploy (infrastructure only — frontend dist may not exist yet) ─
echo ""
echo "▶ [5/8] Deploying AWS infrastructure..."
# Deploy with a placeholder frontend (empty dist) — we'll re-deploy with real build
mkdir -p "${FRONTEND_DIR}/dist"
echo "<html><body>Deploying...</body></html>" > "${FRONTEND_DIR}/dist/index.html"

cdk deploy "${STACK_NAME}" \
  --require-approval never \
  --outputs-file "${INFRA_DIR}/cdk-outputs.json"

echo "   ✓ Infrastructure deployed"

# ── Step 6: Read CloudFront URL from outputs ─────────────────────────────────
echo ""
echo "▶ [6/8] Reading CloudFront URL from CDK outputs..."
CLOUDFRONT_URL=$(python3 -c "
import json
with open('${INFRA_DIR}/cdk-outputs.json') as f:
    outputs = json.load(f)
stack = outputs.get('${STACK_NAME}', {})
url = stack.get('CloudFrontURL', '')
print(url)
")

if [ -z "${CLOUDFRONT_URL}" ]; then
  echo "   ✗ Could not read CloudFrontURL from cdk-outputs.json"
  exit 1
fi

echo "   ✓ CloudFront URL: ${CLOUDFRONT_URL}"

# ── Step 7: Build React frontend ─────────────────────────────────────────────
echo ""
echo "▶ [7/8] Building React frontend..."
cd "${FRONTEND_DIR}"
npm install --silent
VITE_API_URL="${CLOUDFRONT_URL}" npm run build
echo "   ✓ Frontend built (dist/ ready)"

# ── Step 8: Re-deploy to sync frontend to S3 ─────────────────────────────────
echo ""
echo "▶ [8/8] Syncing frontend to S3 + invalidating CloudFront cache..."
cd "${INFRA_DIR}"
cdk deploy "${STACK_NAME}" \
  --require-approval never \
  --outputs-file "${INFRA_DIR}/cdk-outputs.json"

echo "   ✓ Frontend deployed and CloudFront cache invalidated"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅  Deployment complete!                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  🌐  Live URL:  ${CLOUDFRONT_URL}"
echo ""
echo "  ⚠️  IMPORTANT: Set your Anthropic API key in Secrets Manager:"
echo ""
echo "  aws secretsmanager put-secret-value \\"
echo "    --region ${REGION} \\"
echo "    --secret-id waters/contract/ANTHROPIC_API_KEY \\"
echo "    --secret-string '{\"ANTHROPIC_API_KEY\":\"sk-ant-YOUR_KEY_HERE\"}'"
echo ""
echo "  Then test the health endpoint:"
echo "  curl ${CLOUDFRONT_URL}/api/health"
echo ""
