"""
Waters Contract Intelligence — FastAPI application.

Local dev:  uvicorn main:app --reload --port 8000
Lambda:     handler = Mangum(app)  ← used by AWS Lambda runtime

On Lambda startup, ANTHROPIC_API_KEY is pulled from Secrets Manager
(secret name stored in the SECRET_NAME env var).  Locally, python-dotenv
loads it from .env as before — no code change needed for local dev.
"""
from __future__ import annotations

import json
import logging
import os

# ── Local dev: load .env (no-op on Lambda where there is no .env file) ──────
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    force=True,   # override any existing handlers (critical on Lambda)
)
logger = logging.getLogger(__name__)


def _bootstrap_secrets() -> None:
    """
    On Lambda, pull ANTHROPIC_API_KEY from Secrets Manager and inject it
    into os.environ so the rest of the app can use os.getenv() unchanged.
    Skipped when running locally (SECRET_NAME not set).
    """
    secret_name = os.getenv("SECRET_NAME")
    if not secret_name:
        return  # local dev — key already in os.environ from .env

    if os.getenv("ANTHROPIC_API_KEY"):
        return  # already set (warm Lambda container)

    try:
        import boto3  # only available on Lambda / when boto3 is installed
        client = boto3.client("secretsmanager", region_name=os.getenv("APP_AWS_REGION", os.getenv("AWS_REGION", "us-east-1")))
        response = client.get_secret_value(SecretId=secret_name)
        secret = json.loads(response["SecretString"])
        os.environ["ANTHROPIC_API_KEY"] = secret["ANTHROPIC_API_KEY"]
        logger.info("Secrets Manager: ANTHROPIC_API_KEY loaded successfully")
    except Exception as exc:
        logger.error(f"Secrets Manager: failed to load secret '{secret_name}': {exc}")
        raise RuntimeError(f"Could not load ANTHROPIC_API_KEY from Secrets Manager: {exc}") from exc


_bootstrap_secrets()

# ── FastAPI app ──────────────────────────────────────────────────────────────
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import validator, comparison, chat, documents

_is_lambda = bool(os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
logger.info(
    f"Starting Waters Contract API | "
    f"mode={'LAMBDA' if _is_lambda else 'LOCAL'} | "
    f"function={os.getenv('AWS_LAMBDA_FUNCTION_NAME','n/a')} | "
    f"region={os.getenv('AWS_REGION','n/a')} | "
    f"bucket={os.getenv('UPLOADS_BUCKET','not-set')}"
)

app = FastAPI(
    title="Waters Contract Intelligence",
    description="AI-powered contract review — powered by Claude",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # CloudFront domain is enforced at the CF layer
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(validator.router, prefix="/api")
app.include_router(comparison.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(documents.router, prefix="/api")


@app.get("/api/health")
@app.get("/health")   # keep old path for direct API GW access
def health():
    return {
        "status": "ok",
        "uploads_bucket": os.getenv("UPLOADS_BUCKET", "not-set"),
    }


# ── Lambda handler (Mangum wraps ASGI → Lambda event/context) ───────────────
# lifespan="off" avoids startup/shutdown event issues in Lambda
from mangum import Mangum  # noqa: E402
handler = Mangum(app, lifespan="off")
