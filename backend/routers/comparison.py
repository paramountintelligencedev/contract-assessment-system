"""
Comparison router — POST /api/compare + GET /api/compare/{job_id}

Same async job pattern as validator:
  POST /api/compare  → reads both files, starts Claude in background thread,
                       returns {"job_id": "..."} in <2s
  GET  /api/compare/{job_id} → polls for result
                       {"status": "pending"|"running"|"done"|"error", ...}

Job state stored in S3 under jobs/compare_{job_id}.json
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
from services.prompt_builder import build_comparison_prompt, COMPARISON_MODEL

logger = logging.getLogger(__name__)
router = APIRouter()

BUCKET = os.getenv("UPLOADS_BUCKET", "")
REGION = os.getenv("APP_AWS_REGION", os.getenv("AWS_REGION", "us-east-1"))

# In-memory fallback for local dev
_local_jobs: dict[str, dict] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _s3():
    return boto3.client("s3", region_name=REGION)


def _job_key(job_id: str) -> str:
    return f"jobs/compare_{job_id}.json"


def _write_job(job_id: str, state: dict) -> None:
    if BUCKET:
        try:
            _s3().put_object(
                Bucket=BUCKET, Key=_job_key(job_id),
                Body=json.dumps(state).encode(),
                ContentType="application/json",
            )
        except Exception as e:
            logger.error(f"  [COMPARE-JOB] S3 write failed | {e}")
    else:
        _local_jobs[job_id] = state


def _read_job(job_id: str) -> dict | None:
    if BUCKET:
        try:
            obj = _s3().get_object(Bucket=BUCKET, Key=_job_key(job_id))
            return json.loads(obj["Body"].read())
        except ClientError as e:
            if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
                return None
            raise
    return _local_jobs.get(job_id)


def _fetch_s3(key: str) -> tuple[bytes, str]:
    t = time.perf_counter()
    obj = _s3().get_object(Bucket=BUCKET, Key=key)
    data = obj["Body"].read()
    filename = key.split("/")[-1]
    logger.info(f"  [COMPARE] S3 fetch | key={key} | size={len(data):,}B | elapsed={time.perf_counter()-t:.3f}s")
    return data, filename


# ── Background worker ─────────────────────────────────────────────────────────
def _run_compare_job(
    job_id: str,
    bytes_a: bytes, fname_a: str,
    bytes_b: bytes, fname_b: str,
    vendor_a: str, vendor_b: str,
    focus_areas: list,
    t_start: float,
) -> None:
    logger.info(
        f"  [COMPARE-JOB] START | job={job_id} | "
        f"a={fname_a}({len(bytes_a):,}B) | b={fname_b}({len(bytes_b):,}B)"
    )
    try:
        # Parse both documents
        t = time.perf_counter()
        text_a = parse_document(bytes_a, fname_a)
        text_b = parse_document(bytes_b, fname_b)
        logger.info(
            f"  [COMPARE-JOB] PARSED | job={job_id} | "
            f"chars_a={len(text_a):,} | chars_b={len(text_b):,} | "
            f"elapsed={time.perf_counter()-t:.3f}s"
        )

        # Build prompt
        t = time.perf_counter()
        prompt = build_comparison_prompt(text_a, text_b, vendor_a, vendor_b, focus_areas=focus_areas)
        logger.info(
            f"  [COMPARE-JOB] PROMPT | job={job_id} | "
            f"prompt_chars={len(prompt):,} | elapsed={time.perf_counter()-t:.3f}s"
        )

        # Update status
        _write_job(job_id, {
            "status": "running", "step": "claude",
            "vendor_a": vendor_a, "vendor_b": vendor_b,
            "started_at": t_start,
        })

        # Call Claude
        t = time.perf_counter()
        logger.info(
            f"  [COMPARE-JOB] CLAUDE START | job={job_id} | model={COMPARISON_MODEL} | "
            f"since_request={time.perf_counter()-t_start:.3f}s"
        )
        result = call_claude(prompt, max_tokens=16000, model=COMPARISON_MODEL)
        logger.info(
            f"  [COMPARE-JOB] CLAUDE DONE | job={job_id} | "
            f"claude_elapsed={time.perf_counter()-t:.3f}s | "
            f"total={time.perf_counter()-t_start:.3f}s"
        )

        _write_job(job_id, {
            "status": "done",
            "vendor_a": vendor_a, "vendor_b": vendor_b,
            "result": result,
            "elapsed": round(time.perf_counter() - t_start, 2),
        })
        logger.info(f"  [COMPARE-JOB] COMPLETE | job={job_id} | total={time.perf_counter()-t_start:.3f}s")

    except Exception as exc:
        logger.error(
            f"  [COMPARE-JOB] FAILED | job={job_id} | "
            f"{type(exc).__name__}: {exc} | total={time.perf_counter()-t_start:.3f}s"
        )
        _write_job(job_id, {
            "status": "error",
            "vendor_a": vendor_a, "vendor_b": vendor_b,
            "detail": str(exc),
            "elapsed": round(time.perf_counter() - t_start, 2),
        })


# ── POST /api/compare ─────────────────────────────────────────────────────────
@router.post("/compare")
async def compare_contracts(
    file_a: UploadFile = File(None),
    file_b: UploadFile = File(None),
    s3_key_a: str = Form(None),
    s3_key_b: str = Form(None),
    vendor_a_name: str = Form(default="Vendor A"),
    vendor_b_name: str = Form(default="Vendor B"),
    focus_areas: str = Form(default="[]"),
):
    t_start = time.perf_counter()
    areas = json.loads(focus_areas) if focus_areas else []

    # Resolve file A
    if s3_key_a and BUCKET:
        bytes_a, fname_a = _fetch_s3(s3_key_a)
    elif file_a:
        bytes_a = await file_a.read()
        fname_a = file_a.filename
        logger.info(f"  [COMPARE] File A read | name={fname_a} | size={len(bytes_a):,}B")
    else:
        raise HTTPException(status_code=400, detail="Provide file_a or s3_key_a")

    # Resolve file B
    if s3_key_b and BUCKET:
        bytes_b, fname_b = _fetch_s3(s3_key_b)
    elif file_b:
        bytes_b = await file_b.read()
        fname_b = file_b.filename
        logger.info(f"  [COMPARE] File B read | name={fname_b} | size={len(bytes_b):,}B")
    else:
        raise HTTPException(status_code=400, detail="Provide file_b or s3_key_b")

    # Create job
    job_id = str(uuid.uuid4())
    _write_job(job_id, {
        "status": "pending",
        "vendor_a": vendor_a_name, "vendor_b": vendor_b_name,
        "started_at": t_start,
    })

    # Start background thread
    thread = threading.Thread(
        target=_run_compare_job,
        args=(job_id, bytes_a, fname_a, bytes_b, fname_b,
              vendor_a_name, vendor_b_name, areas, t_start),
        daemon=True,
        name=f"compare-{job_id[:8]}",
    )
    thread.start()

    logger.info(
        f"══ COMPARE QUEUED | job={job_id} | "
        f"a={fname_a} | b={fname_b} | "
        f"elapsed={time.perf_counter()-t_start:.3f}s"
    )
    return {
        "job_id": job_id, "status": "pending",
        "vendor_a": vendor_a_name, "vendor_b": vendor_b_name,
    }


# ── GET /api/compare/{job_id} ─────────────────────────────────────────────────
@router.get("/compare/{job_id}")
async def get_compare_result(job_id: str):
    state = _read_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if state["status"] in ("pending", "running"):
        state["elapsed"] = round(time.perf_counter() - state.get("started_at", 0), 1)

    logger.info(
        f"  [COMPARE-POLL] job={job_id} | status={state['status']} | "
        f"elapsed={state.get('elapsed', '?')}s"
    )
    return state
