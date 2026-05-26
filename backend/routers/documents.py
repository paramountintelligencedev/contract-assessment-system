"""
Document management routes — S3 presigned upload, list, delete.

POST /api/upload/presign   → returns a presigned PUT URL for direct S3 upload
GET  /api/documents        → lists all documents in the uploads bucket
DELETE /api/documents/{key} → deletes a document from S3

In local dev (no UPLOADS_BUCKET env var), all routes return graceful fallbacks
so the frontend can still work with local File objects.
"""
from __future__ import annotations

import os
import time
import logging
import urllib.parse
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

BUCKET = os.getenv("UPLOADS_BUCKET", "")
REGION = os.getenv("APP_AWS_REGION", os.getenv("AWS_REGION", "us-east-1"))
PRESIGN_EXPIRY = 300  # seconds — 5 minutes to complete the upload


def _s3():
    return boto3.client("s3", region_name=REGION)


# ── Presign request/response models ─────────────────────────────────────────
class PresignRequest(BaseModel):
    filename: str
    content_type: Optional[str] = "application/octet-stream"


class PresignResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int


# ── POST /api/upload/presign ─────────────────────────────────────────────────
@router.post("/upload/presign", response_model=PresignResponse)
async def presign_upload(req: PresignRequest):
    """
    Generate a presigned S3 PUT URL so the browser can upload directly to S3
    without routing the file bytes through Lambda.
    """
    if not BUCKET:
        raise HTTPException(
            status_code=503,
            detail="S3 uploads bucket not configured (UPLOADS_BUCKET env var missing). "
                   "Running in local mode — upload the file directly to the API instead.",
        )

    # Sanitise filename and build a unique key
    safe_name = urllib.parse.quote(req.filename.replace("/", "_"), safe=".-_")
    s3_key = f"contracts/{int(time.time() * 1000)}/{safe_name}"

    try:
        url = _s3().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET,
                "Key": s3_key,
                "ContentType": req.content_type,
            },
            ExpiresIn=PRESIGN_EXPIRY,
        )
        logger.info(f"Presigned URL generated | key={s3_key} | expires={PRESIGN_EXPIRY}s")
        return PresignResponse(upload_url=url, s3_key=s3_key, expires_in=PRESIGN_EXPIRY)

    except ClientError as e:
        logger.error(f"Presign failed: {e}")
        raise HTTPException(status_code=500, detail=f"Could not generate upload URL: {e}")


# ── GET /api/documents ───────────────────────────────────────────────────────
@router.get("/documents")
async def list_documents():
    """
    List all documents stored in the uploads bucket under the contracts/ prefix.
    Returns a flat list sorted by last-modified descending.
    """
    if not BUCKET:
        return {"documents": [], "bucket": None}

    try:
        s3 = _s3()
        paginator = s3.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=BUCKET, Prefix="contracts/")

        docs = []
        for page in pages:
            for obj in page.get("Contents", []):
                key = obj["Key"]
                name = key.split("/")[-1]
                if not name:
                    continue
                docs.append({
                    "id": key,
                    "name": urllib.parse.unquote(name),
                    "s3Key": key,
                    "size": obj["Size"],
                    "date": obj["LastModified"].isoformat(),
                })

        docs.sort(key=lambda d: d["date"], reverse=True)
        logger.info(f"Listed {len(docs)} documents from s3://{BUCKET}/contracts/")
        return {"documents": docs, "bucket": BUCKET}

    except ClientError as e:
        logger.error(f"List documents failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── DELETE /api/documents/{key} ──────────────────────────────────────────────
@router.delete("/documents/{s3_key:path}")
async def delete_document(s3_key: str):
    """
    Delete a document from S3 by its key.
    """
    if not BUCKET:
        return {"deleted": True, "key": s3_key, "note": "local mode — nothing to delete"}

    try:
        _s3().delete_object(Bucket=BUCKET, Key=s3_key)
        logger.info(f"Deleted s3://{BUCKET}/{s3_key}")
        return {"deleted": True, "key": s3_key}

    except ClientError as e:
        logger.error(f"Delete failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
