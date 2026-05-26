# =============================================================================
# Waters Contract Intelligence — AWS Deployment Script (PowerShell / Windows)
# =============================================================================
# Usage (from project root):
#   .\deploy.ps1
#
# Prerequisites:
#   - AWS CLI configured (aws configure) with credentials for us-east-1
#   - AWS CDK CLI: npm install -g aws-cdk
#   - Python 3.11 available on PATH
#   - Node.js 18+ and npm installed
# =============================================================================

$ErrorActionPreference = "Stop"

$REGION      = "us-east-1"
$STACK_NAME  = "WatersContractStack"
$ROOT        = $PSScriptRoot
$BACKEND_DIR = Join-Path $ROOT "backend"
$FRONTEND_DIR= Join-Path $ROOT "frontend"
$INFRA_DIR   = Join-Path $ROOT "infra"
$LAYER_DIR   = Join-Path $BACKEND_DIR "lambda_layer\python"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Waters Contract Intelligence — AWS Deployment              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: CDK Python dependencies ─────────────────────────────────────────
Write-Host "▶ [1/8] Installing CDK Python dependencies..." -ForegroundColor Yellow
Set-Location $INFRA_DIR
python -m venv .venv 2>$null
& ".venv\Scripts\Activate.ps1"
pip install -q -r requirements.txt
Write-Host "   ✓ CDK dependencies installed" -ForegroundColor Green

# ── Step 2: Build Lambda layer ───────────────────────────────────────────────
Write-Host ""
Write-Host "▶ [2/8] Building Lambda dependency layer..." -ForegroundColor Yellow

if (Test-Path $LAYER_DIR) { Remove-Item -Recurse -Force $LAYER_DIR }
New-Item -ItemType Directory -Path $LAYER_DIR -Force | Out-Null

pip install -q `
  --platform manylinux2014_x86_64 `
  --implementation cp `
  --python-version 3.11 `
  --only-binary=:all: `
  --upgrade `
  --target $LAYER_DIR `
  -r (Join-Path $BACKEND_DIR "requirements.txt")

Write-Host "   ✓ Lambda layer built" -ForegroundColor Green

# ── Step 3: CDK bootstrap ────────────────────────────────────────────────────
Write-Host ""
Write-Host "▶ [3/8] CDK bootstrap..." -ForegroundColor Yellow
$AWS_ACCOUNT = (aws sts get-caller-identity --query Account --output text)
cdk bootstrap "aws://$AWS_ACCOUNT/$REGION" --quiet
Write-Host "   ✓ CDK bootstrapped (account: $AWS_ACCOUNT, region: $REGION)" -ForegroundColor Green

# ── Step 4: CDK synth ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "▶ [4/8] CDK synth..." -ForegroundColor Yellow
cdk synth --quiet
Write-Host "   ✓ Stack synthesised" -ForegroundColor Green

# ── Step 5: Initial CDK deploy ───────────────────────────────────────────────
Write-Host ""
Write-Host "▶ [5/8] Deploying AWS infrastructure..." -ForegroundColor Yellow

$distDir = Join-Path $FRONTEND_DIR "dist"
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir -Force | Out-Null }
Set-Content -Path (Join-Path $distDir "index.html") -Value "<html><body>Deploying...</body></html>"

$outputsFile = Join-Path $INFRA_DIR "cdk-outputs.json"
cdk deploy $STACK_NAME --require-approval never --outputs-file $outputsFile
Write-Host "   ✓ Infrastructure deployed" -ForegroundColor Green

# ── Step 6: Read CloudFront URL ──────────────────────────────────────────────
Write-Host ""
Write-Host "▶ [6/8] Reading CloudFront URL..." -ForegroundColor Yellow
$outputs       = Get-Content $outputsFile | ConvertFrom-Json
$CLOUDFRONT_URL = $outputs.$STACK_NAME.CloudFrontURL

if (-not $CLOUDFRONT_URL) {
    Write-Host "   ✗ Could not read CloudFrontURL from cdk-outputs.json" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ CloudFront URL: $CLOUDFRONT_URL" -ForegroundColor Green

# ── Step 7: Build React frontend ─────────────────────────────────────────────
Write-Host ""
Write-Host "▶ [7/8] Building React frontend..." -ForegroundColor Yellow
Set-Location $FRONTEND_DIR
npm install --silent
$env:VITE_API_URL = $CLOUDFRONT_URL
npm run build
Write-Host "   ✓ Frontend built" -ForegroundColor Green

# ── Step 8: Re-deploy with real frontend ─────────────────────────────────────
Write-Host ""
Write-Host "▶ [8/8] Syncing frontend to S3..." -ForegroundColor Yellow
Set-Location $INFRA_DIR
cdk deploy $STACK_NAME --require-approval never --outputs-file $outputsFile
Write-Host "   ✓ Frontend deployed" -ForegroundColor Green

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   ✅  Deployment complete!                                   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  🌐  Live URL:  $CLOUDFRONT_URL" -ForegroundColor White
Write-Host ""
Write-Host "  ⚠️  Set your Anthropic API key:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  aws secretsmanager put-secret-value ``" -ForegroundColor Gray
Write-Host "    --region $REGION ``" -ForegroundColor Gray
Write-Host "    --secret-id waters/contract/ANTHROPIC_API_KEY ``" -ForegroundColor Gray
Write-Host "    --secret-string '{""ANTHROPIC_API_KEY"":""sk-ant-YOUR_KEY_HERE""}'" -ForegroundColor Gray
Write-Host ""
Write-Host "  Then test: curl $CLOUDFRONT_URL/api/health" -ForegroundColor Gray
Write-Host ""

Set-Location $ROOT
