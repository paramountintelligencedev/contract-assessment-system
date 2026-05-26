"""
Claude API service — sync client (call_claude) + async client (async_client).

call_claude() is used on Lambda (synchronous, no streaming).
async_client is used locally for SSE streaming.

Timing is logged at every stage so CloudWatch shows exactly where time goes:
  [CLAUDE] connect → first-byte → full-response → json-parse
"""
from __future__ import annotations

import json
import logging
import os
import time

import anthropic

logger = logging.getLogger(__name__)

# Clients are module-level singletons — created once per Lambda container.
# ANTHROPIC_API_KEY is injected by main._bootstrap_secrets() before this runs.
client       = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
async_client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

MODEL = "claude-haiku-4-5"   # default — validator overrides per call


def call_claude(prompt: str, max_tokens: int = 4096, model: str = MODEL) -> dict:
    """
    Synchronous Claude call. Returns parsed JSON dict.
    Used on Lambda where streaming is not viable through Mangum + API GW.

    Timing logged:
      [CLAUDE] api_call_start
      [CLAUDE] api_call_done   — full response received
      [CLAUDE] json_parse_done — JSON parsed
    """
    t0 = time.perf_counter()
    logger.info(
        f"  [CLAUDE] START | model={model} | max_tokens={max_tokens} | "
        f"prompt_chars={len(prompt):,}"
    )

    try:
        message = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        logger.error(
            f"  [CLAUDE] API ERROR | {type(exc).__name__}: {exc} | "
            f"elapsed={time.perf_counter()-t0:.3f}s"
        )
        raise

    t_api = time.perf_counter() - t0
    raw_text = message.content[0].text

    logger.info(
        f"  [CLAUDE] RESPONSE | stop_reason={message.stop_reason} | "
        f"input_tokens={message.usage.input_tokens} | "
        f"output_tokens={message.usage.output_tokens} | "
        f"response_chars={len(raw_text):,} | "
        f"api_elapsed={t_api:.3f}s"
    )

    # Strip markdown code fences if Claude wrapped the JSON
    clean = raw_text.strip()
    if clean.startswith("```"):
        clean = clean.split("```")[1]
        if clean.startswith("json"):
            clean = clean[4:]
    clean = clean.strip()

    t_parse = time.perf_counter()
    try:
        parsed = json.loads(clean)
        logger.info(
            f"  [CLAUDE] JSON_PARSE OK | "
            f"parse_elapsed={time.perf_counter()-t_parse:.3f}s | "
            f"total_elapsed={time.perf_counter()-t0:.3f}s"
        )
        return parsed
    except json.JSONDecodeError as exc:
        logger.error(
            f"  [CLAUDE] JSON_PARSE FAILED | {exc} | "
            f"raw_preview={raw_text[:300]!r}"
        )
        raise
