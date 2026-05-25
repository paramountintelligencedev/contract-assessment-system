from fastapi import APIRouter, UploadFile, File, HTTPException
from services.document_parser import parse_document
from services.claude_service import call_claude
from services.prompt_builder import build_validator_prompt
import json
import time
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Default Waters checklist — replace with real one
DEFAULT_CHECKLIST = [
    {"id": 1, "name": "Liability cap", "description": "Must state a maximum liability of at least $1M", "required": True, "risk_level": "high"},
    {"id": 2, "name": "IP ownership", "description": "All IP created must be assigned to Waters", "required": True, "risk_level": "high"},
    {"id": 3, "name": "Termination for convenience", "description": "Waters must be able to terminate with 30 days notice", "required": True, "risk_level": "high"},
    {"id": 4, "name": "Data security", "description": "Vendor must comply with Waters data security standards", "required": True, "risk_level": "high"},
    {"id": 5, "name": "Payment terms", "description": "Net 30 payment terms required", "required": True, "risk_level": "medium"},
    {"id": 6, "name": "Auto-renewal clause", "description": "Must have explicit opt-out before auto-renewal", "required": True, "risk_level": "medium"},
    {"id": 7, "name": "Governing law", "description": "Must specify jurisdiction", "required": True, "risk_level": "low"},
    {"id": 8, "name": "Confidentiality", "description": "Must include mutual NDA or confidentiality obligations", "required": True, "risk_level": "high"},
    {"id": 9, "name": "SLA and penalties", "description": "Must define response times and remedies", "required": False, "risk_level": "medium"},
    {"id": 10, "name": "Force majeure", "description": "Must define force majeure events", "required": False, "risk_level": "low"},
]

@router.post("/validate")
async def validate_contract(file: UploadFile = File(...)):
    t_total = time.perf_counter()
    logger.info(f"── VALIDATE START | filename={file.filename} | content_type={file.content_type}")
    try:
        t = time.perf_counter()
        file_bytes = await file.read()
        logger.info(f"  [1/4] File read      | size={len(file_bytes):,} bytes | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        contract_text = parse_document(file_bytes, file.filename)
        logger.info(f"  [2/4] Doc parse      | chars={len(contract_text):,} | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        prompt = build_validator_prompt(contract_text, DEFAULT_CHECKLIST)
        logger.info(f"  [3/4] Prompt build   | prompt_chars={len(prompt):,} | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        result = call_claude(prompt, max_tokens=16000)
        logger.info(f"  [4/4] Claude call    | elapsed={time.perf_counter()-t:.3f}s")

        logger.info(f"── VALIDATE DONE | total={time.perf_counter()-t_total:.3f}s")
        return result
    except Exception as e:
        logger.error(f"── VALIDATE FAILED | {type(e).__name__}: {e} | elapsed={time.perf_counter()-t_total:.3f}s")
        raise HTTPException(status_code=500, detail=str(e))
