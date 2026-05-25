from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from services.document_parser import parse_document
from services.claude_service import call_claude
from services.prompt_builder import build_comparison_prompt
import logging
import time
import json

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/compare")
async def compare_contracts(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
    vendor_a_name: str = Form(default="Vendor A"),
    vendor_b_name: str = Form(default="Vendor B"),
    focus_areas: str = Form(default="[]"),
):
    t_total = time.perf_counter()
    areas = json.loads(focus_areas) if focus_areas else []
    logger.info(
        f"── COMPARE START | file_a={file_a.filename} | file_b={file_b.filename} | "
        f"vendor_a={vendor_a_name} | vendor_b={vendor_b_name} | focus={areas or 'all'}"
    )
    try:
        t = time.perf_counter()
        bytes_a = await file_a.read()
        bytes_b = await file_b.read()
        logger.info(f"  [1/4] Files read     | size_a={len(bytes_a):,}B | size_b={len(bytes_b):,}B | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        text_a = parse_document(bytes_a, file_a.filename)
        logger.info(f"  [2/4] Parse A        | chars={len(text_a):,} | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        text_b = parse_document(bytes_b, file_b.filename)
        logger.info(f"  [2/4] Parse B        | chars={len(text_b):,} | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        prompt = build_comparison_prompt(text_a, text_b, vendor_a_name, vendor_b_name, focus_areas=areas)
        logger.info(f"  [3/4] Prompt build   | prompt_chars={len(prompt):,} | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        result = call_claude(prompt, max_tokens=16000)
        logger.info(f"  [4/4] Claude call    | elapsed={time.perf_counter()-t:.3f}s")

        logger.info(f"── COMPARE DONE | total={time.perf_counter()-t_total:.3f}s")
        return result
    except Exception as e:
        logger.error(f"── COMPARE FAILED | {type(e).__name__}: {e} | elapsed={time.perf_counter()-t_total:.3f}s")
        raise HTTPException(status_code=500, detail=str(e))
