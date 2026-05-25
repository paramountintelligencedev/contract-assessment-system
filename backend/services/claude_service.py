import anthropic
import os
import json
import time
import logging

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
async_client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def call_claude(prompt: str, max_tokens: int = 4096) -> dict:
    logger.info(f"Claude request | model=claude-sonnet-4-6 | max_tokens={max_tokens} | prompt_chars={len(prompt)}")
    t_api = time.perf_counter()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}]
    )
    api_elapsed = time.perf_counter() - t_api

    raw_text = message.content[0].text
    logger.info(
        f"Claude response | stop_reason={message.stop_reason} | "
        f"response_chars={len(raw_text)} | input_tokens={message.usage.input_tokens} | "
        f"output_tokens={message.usage.output_tokens} | api_time={api_elapsed:.3f}s"
    )

    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]

    t_parse = time.perf_counter()
    try:
        parsed = json.loads(raw_text.strip())
        logger.info(f"JSON parsed | elapsed={time.perf_counter()-t_parse:.3f}s")
        return parsed
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse failed: {e} | raw_text_preview={raw_text[:200]}")
        raise
