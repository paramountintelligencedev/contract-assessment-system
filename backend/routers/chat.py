from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.claude_service import client, async_client
import logging
import time
import json

logger = logging.getLogger(__name__)
router = APIRouter()

SYSTEM_PROMPT = (
    "You are a senior legal analyst at Waters Corporation. "
    "You have deep expertise in contract law, vendor agreements, SOWs, and enterprise procurement. "
    "Answer questions about the contract concisely and precisely. "
    "Use markdown formatting for clarity: **bold** for key terms, bullet lists for multiple points, "
    "and `inline code` for exact clause references. "
    "Reference specific clause language when relevant. "
    "If something is not in the contract, say so clearly."
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    contract_text: str
    history: list[Message] = []


def _build_messages(req: ChatRequest) -> list[dict]:
    if not req.history:
        return [
            {
                "role": "user",
                "content": (
                    "I am going to share a contract with you. "
                    "Please read it carefully. I will then ask you questions about it.\n\n"
                    f"CONTRACT:\n{req.contract_text}\n\n"
                    f"My first question: {req.question}"
                ),
            }
        ]
    first = req.history[0]
    rest = req.history[1:]
    return [
        {"role": first.role, "content": first.content},
        *[{"role": m.role, "content": m.content} for m in rest],
        {"role": "user", "content": req.question},
    ]


@router.post("/chat")
async def chat_about_contract(req: ChatRequest):
    t_total = time.perf_counter()
    logger.info(f"── CHAT START | question_chars={len(req.question)} | history_turns={len(req.history)}")
    try:
        t = time.perf_counter()
        messages = _build_messages(req)
        logger.info(f"  [1/2] Messages built | count={len(messages)} | elapsed={time.perf_counter()-t:.3f}s")

        t = time.perf_counter()
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
        answer = response.content[0].text
        logger.info(
            f"  [2/2] Claude call    | response_chars={len(answer)} | "
            f"input_tokens={response.usage.input_tokens} | output_tokens={response.usage.output_tokens} | "
            f"elapsed={time.perf_counter()-t:.3f}s"
        )

        logger.info(f"── CHAT DONE | total={time.perf_counter()-t_total:.3f}s")
        return {"answer": answer}
    except Exception as e:
        logger.error(f"── CHAT FAILED | {type(e).__name__}: {e} | elapsed={time.perf_counter()-t_total:.3f}s")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    t_total = time.perf_counter()
    logger.info(f"── STREAM START | question_chars={len(req.question)} | history_turns={len(req.history)}")
    messages = _build_messages(req)

    async def generate():
        t_first = None
        char_count = 0
        try:
            async with async_client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    if t_first is None:
                        t_first = time.perf_counter()
                        logger.info(f"  First token      | ttfb={t_first-t_total:.3f}s")
                    char_count += len(text)
                    yield f"data: {json.dumps({'text': text})}\n\n"
            yield "data: [DONE]\n\n"
            logger.info(
                f"── STREAM DONE | chars={char_count} | "
                f"ttfb={( t_first - t_total):.3f}s | total={time.perf_counter()-t_total:.3f}s"
            )
        except Exception as e:
            logger.error(f"── STREAM FAILED | {type(e).__name__}: {e} | elapsed={time.perf_counter()-t_total:.3f}s")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
