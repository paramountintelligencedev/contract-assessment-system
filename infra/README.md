# Waters Contract Intelligence — AWS Infrastructure

AWS CDK stack (Python) that deploys the full serverless architecture.

## Architecture

```
Browser
  │
  ▼
CloudFront (HTTPS)
  ├── /* ──────────────────► S3 (React SPA, private + OAC)
  └── /api/* ──────────────► HTTP API Gateway
                                  │
                                  ▼
                             Lambda (Python 3.11)
                             FastAPI + Mangum
                             512 MB / 60 s timeout
                                  │
                          ┌───────┴────────┐
                          ▼                ▼
                   Secrets Manager    S3 Uploads Bucket
                   (ANTHROPIC_API_KEY) (private, SSE-S3)
```

## Resources Created

| Resource | Details |
|---|---|
| CloudFront distribution | HTTPS, price class 100, SPA error handling |
| S3 frontend bucket | Private, OAC access, auto-delete on stack destroy |
| S3 uploads bucket | Private, SSE-S3, 90-day lifecycle, RETAIN on destroy |
| HTTP API Gateway | `ANY /{proxy+}`, CORS enabled |
| Lambda function | `waters-contract-api`, Python 3.11, 512 MB, 60 s |
| Lambda layer | All pip dependencies (built by deploy script) |
| Secrets Manager | `waters/contract/ANTHROPIC_API_KEY` |
| IAM role | S3 r/w, Secrets Manager read, CloudWatch Logs |
| CloudWatch log group | `/aws/lambda/waters-contract-api`, 30-day retention |

## Prerequisites

```bash
# AWS CLI
aws configure   # set access key, secret, region=us-east-1

# CDK CLI
npm install -g aws-cdk

# Python 3.11
python3 --version   # must be 3.11.x

# Node 18+
node --version
```

## Deploy (Windows PowerShell)

```powershell
# From project root
.\deploy.ps1
```

## Deploy (macOS / Linux)

```bash
chmod +x deploy.sh
./deploy.sh
```

## After Deployment — Set API Key

The Secrets Manager secret is created with a placeholder value.
**You must update it before the app will work:**

```bash
aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id waters/contract/ANTHROPIC_API_KEY \
  --secret-string '{"ANTHROPIC_API_KEY":"sk-ant-YOUR_REAL_KEY_HERE"}'
```

## Manual CDK Commands

```bash
cd infra
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

cdk synth          # synthesise CloudFormation template
cdk diff           # show what will change
cdk deploy         # deploy
cdk destroy        # tear down (uploads bucket is RETAINED)
```

## CI/CD — Auto-deploy on every push

The workflow at `.github/workflows/deploy.yml` runs automatically on every push to `main`.

**One-time setup — add two secrets to GitHub:**

1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret** and add:

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |

After that — push to `main` and it deploys itself. Done.

---

## Tear Down

```bash
cdk destroy WatersContractStack
```

> The uploads S3 bucket has `RemovalPolicy.RETAIN` — it will **not** be deleted.
> Delete it manually if needed: `aws s3 rb s3://BUCKET_NAME --force`
