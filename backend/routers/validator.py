"""
Validator router — POST /api/validate + GET /api/validate/{job_id}

ARCHITECTURE
────────────
API Gateway HTTP API has a hard 29-second integration timeout that cannot
be raised. Claude on a large document (100k+ chars) takes 40-90 seconds.

Solution: async job pattern
  1. POST /api/validate  → reads file, starts Claude in a background thread,
                           returns {"job_id": "..."} in <1 second
  2. GET  /api/validate/{job_id} → returns job status + result when ready

Job state is stored in S3 (already available) as JSON objects under
  jobs/{job_id}.json  →  {"status": "pending"|"done"|"error", "result": {...}}

Local dev (uvicorn):
  Same async pattern works identically. Background thread runs Claude,
  frontend polls /api/validate/{job_id} every 2 seconds.

SSE event types (for progress updates during polling):
  {"status": "pending", "step": "parsing"|"prompting"|"running", "elapsed": 5.2}
  {"status": "done",    "result": {...}}
  {"status": "error",   "detail": "..."}
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.claude_service import call_claude
from services.document_parser import parse_document
from services.prompt_builder import build_validator_prompt, VALIDATOR_MODEL

logger = logging.getLogger(__name__)
router = APIRouter()

BUCKET  = os.getenv("UPLOADS_BUCKET", "")
REGION  = os.getenv("APP_AWS_REGION", os.getenv("AWS_REGION", "us-east-1"))

# In-memory job store for local dev (no S3 bucket configured)
_local_jobs: dict[str, dict] = {}

# ── Waters enterprise checklist ───────────────────────────────────────────────
DEFAULT_CHECKLIST = [
    {"id": 1,  "name": "Liability cap",               "description": "Must state a maximum liability of at least $1M",         "required": True,  "risk_level": "high"},
    {"id": 2,  "name": "IP ownership",                "description": "All IP created must be assigned to Waters",              "required": True,  "risk_level": "high"},
    {"id": 3,  "name": "Termination for convenience", "description": "Waters must be able to terminate with 30 days notice",   "required": True,  "risk_level": "high"},
    {"id": 4,  "name": "Data security",               "description": "Vendor must comply with Waters data security standards", "required": True,  "risk_level": "high"},
    {"id": 5,  "name": "Payment terms",               "description": "Net 30 payment terms required",                         "required": True,  "risk_level": "medium"},
    {"id": 6,  "name": "Auto-renewal clause",         "description": "Must have explicit opt-out before auto-renewal",        "required": True,  "risk_level": "medium"},
    {"id": 7,  "name": "Governing law",               "description": "Must specify jurisdiction",                             "required": True,  "risk_level": "low"},
    {"id": 8,  "name": "Confidentiality",             "description": "Must include mutual NDA or confidentiality obligations", "required": True,  "risk_level": "high"},
    {"id": 9,  "name": "SLA and penalties",           "description": "Must define response times and remedies",               "required": False, "risk_level": "medium"},
    {"id": 10, "name": "Force majeure",               "description": "Must define force majeure events",                      "required": False, "risk_level": "low"},
]


# ── Job state helpers ─────────────────────────────────────────────────────────
def _s3():
    return boto3.client("s3", region_name=REGION)


def _job_key(job_id: str) -> str:
    return f"jobs/{job_id}.json"


def _write_job(job_id: str, state: dict) -> None:
    """Persist job state. Uses S3 on Lambda, in-memory locally."""
    if BUCKET:
        try:
            _s3().put_object(
                Bucket=BUCKET,
                Key=_job_key(job_id),
                Body=json.dumps(state).encode(),
                ContentType="application/json",
            )
        except Exception as e:
            logger.error(f"  [JOB] S3 write failed | job={job_id} | {e}")
    else:
        _local_jobs[job_id] = state


def _read_job(job_id: str) -> dict | None:
    """Read job state. Returns None if not found."""
    if BUCKET:
        try:
            obj = _s3().get_object(Bucket=BUCKET, Key=_job_key(job_id))
            return json.loads(obj["Body"].read())
        except ClientError as e:
            if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
                return None
            raise
    else:
        return _local_jobs.get(job_id)


# ── Background worker ─────────────────────────────────────────────────────────
def _run_claude_job(job_id: str, file_bytes: bytes, filename: str, t_start: float) -> None:
    """
    Runs in a background thread. Calls Claude synchronously, writes result to S3.
    Lambda keeps the container alive for 300s — plenty of time for Claude to finish.
    """
    logger.info(f"  [JOB] START | job={job_id} | file={filename} | size={len(file_bytes):,}B")

    try:
        # Parse document
        t = time.perf_counter()
        contract_text = parse_document(file_bytes, filename)
        logger.info(
            f"  [JOB] PARSED | job={job_id} | chars={len(contract_text):,} | "
            f"elapsed={time.perf_counter()-t:.3f}s"
        )

        # Build prompt
        t = time.perf_counter()
        prompt = build_validator_prompt(contract_text, DEFAULT_CHECKLIST)
        logger.info(
            f"  [JOB] PROMPT | job={job_id} | prompt_chars={len(prompt):,} | "
            f"elapsed={time.perf_counter()-t:.3f}s"
        )

        # Update status to "running" so frontend shows progress
        _write_job(job_id, {
            "status": "running",
            "step": "claude",
            "filename": filename,
            "started_at": t_start,
        })

        # Call Claude (synchronous — takes 20-90s depending on doc size)
        t = time.perf_counter()
        logger.info(
            f"  [JOB] CLAUDE START | job={job_id} | "
            f"since_request={time.perf_counter()-t_start:.3f}s"
        )
        result = call_claude(prompt, max_tokens=16000, model=VALIDATOR_MODEL)
        claude_elapsed = time.perf_counter() - t
        logger.info(
            f"  [JOB] CLAUDE DONE | job={job_id} | "
            f"claude_elapsed={claude_elapsed:.3f}s | "
            f"total={time.perf_counter()-t_start:.3f}s"
        )

        # Write final result
        _write_job(job_id, {
            "status": "done",
            "filename": filename,
            "result": result,
            "elapsed": round(time.perf_counter() - t_start, 2),
        })
        logger.info(
            f"  [JOB] COMPLETE | job={job_id} | "
            f"total={time.perf_counter()-t_start:.3f}s"
        )

    except Exception as exc:
        logger.error(
            f"  [JOB] FAILED | job={job_id} | "
            f"{type(exc).__name__}: {exc} | "
            f"total={time.perf_counter()-t_start:.3f}s"
        )
        _write_job(job_id, {
            "status": "error",
            "filename": filename,
            "detail": str(exc),
            "elapsed": round(time.perf_counter() - t_start, 2),
        })


# ── POST /api/validate ────────────────────────────────────────────────────────
@router.post("/validate")
async def validate_contract(
    file: UploadFile = File(None),
    s3_key: str = Form(None),
):
    """
    Accepts a file upload or S3 key. Starts Claude in a background thread.
    Returns {"job_id": "..."} immediately (< 1 second).
    """
    t_start = time.perf_counter()

    # Resolve file bytes
    if s3_key and BUCKET:
        t = time.perf_counter()
        s3 = _s3()
        obj = s3.get_object(Bucket=BUCKET, Key=s3_key)
        file_bytes = obj["Body"].read()
        filename = s3_key.split("/")[-1]
        logger.info(
            f"  [VALIDATE] S3 fetch | key={s3_key} | "
            f"size={len(file_bytes):,}B | elapsed={time.perf_counter()-t:.3f}s"
        )
    elif file:
        file_bytes = await file.read()
        filename = file.filename
        logger.info(
            f"  [VALIDATE] File read | name={filename} | "
            f"size={len(file_bytes):,}B | elapsed={time.perf_counter()-t_start:.3f}s"
        )
    else:
        raise HTTPException(status_code=400, detail="Provide either a file upload or an s3_key")

    # Create job
    job_id = str(uuid.uuid4())
    _write_job(job_id, {
        "status": "pending",
        "filename": filename,
        "started_at": t_start,
    })

    # Start background thread — Lambda keeps container alive for 300s
    thread = threading.Thread(
        target=_run_claude_job,
        args=(job_id, file_bytes, filename, t_start),
        daemon=True,
        name=f"claude-{job_id[:8]}",
    )
    thread.start()

    logger.info(
        f"══ VALIDATE QUEUED | job={job_id} | file={filename} | "
        f"elapsed={time.perf_counter()-t_start:.3f}s"
    )

    return {"job_id": job_id, "status": "pending", "filename": filename}


# ── GET /api/validate/{job_id} ────────────────────────────────────────────────
@router.get("/validate/{job_id}")
async def get_validate_result(job_id: str):
    """
    Poll for job result. Returns:
      {"status": "pending", "elapsed": 5.2}
      {"status": "running", "step": "claude", "elapsed": 12.1}
      {"status": "done",    "result": {...}, "elapsed": 34.7}
      {"status": "error",   "detail": "...", "elapsed": 5.1}
    """
    state = _read_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Add live elapsed time for pending/running states
    if state["status"] in ("pending", "running"):
        state["elapsed"] = round(time.perf_counter() - state.get("started_at", 0), 1)

    logger.info(
        f"  [POLL] job={job_id} | status={state['status']} | "
        f"elapsed={state.get('elapsed', '?')}s"
    )
    return state
