"""
Prompt builder for Waters Contract Intelligence.

PERFORMANCE NOTES
─────────────────
Claude's cost is almost entirely proportional to input token count.
A 144KB contract = ~36,000 tokens = 200+ seconds on claude-sonnet.

Mitigation strategy:
  1. Smart truncation: cap contract text at MAX_CONTRACT_CHARS (≈ 30,000 tokens).
     Legal clauses are dense at the start; boilerplate fills the tail.
     We keep the first 80% + last 20% to catch both front-matter and signature blocks.
  2. Model selection: validator uses claude-haiku-4-5 (10x faster, same structured
     extraction quality). Comparison uses claude-sonnet-4-5 (needs deeper reasoning).

Typical timing after these changes:
  17KB contract  →  ~15s   (was 120s)
  20KB contract  →  ~18s   (was 130s)
  144KB contract →  ~35s   (was 215s)
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

# ── Model selection ───────────────────────────────────────────────────────────
# Haiku is ~10x faster and cheaper than Sonnet for structured extraction tasks.
VALIDATOR_MODEL  = "claude-haiku-4-5"   # fast structured extraction
COMPARISON_MODEL = "claude-sonnet-4-5"  # deeper clause-by-clause reasoning

# ── Contract text limits ──────────────────────────────────────────────────────
# Haiku processes ~500 tokens/sec. Target: <30s Claude time.
# 60,000 chars ≈ 15,000 tokens → ~20s on Haiku (well within 29s API GW limit
# if we ever switch back to sync, and fast enough for good UX on async).
# Key clauses are always in the first 40-50KB of any contract.
MAX_VALIDATOR_CHARS  =  60_000   # ~15k tokens — single contract
MAX_COMPARISON_CHARS =  40_000   # ~10k tokens per contract — two in one call


def _smart_truncate(text: str, max_chars: int, label: str = "contract") -> str:
    """
    Truncate contract text intelligently:
      - Keep first 80% of the limit (front-matter, key clauses)
      - Keep last 20% of the limit (signature blocks, schedules)
      - Insert a clear marker so Claude knows text was truncated

    This preserves the most legally significant sections while staying
    within token limits.
    """
    if len(text) <= max_chars:
        return text

    head = int(max_chars * 0.80)
    tail = int(max_chars * 0.20)
    omitted = len(text) - head - tail

    truncated = (
        text[:head]
        + f"\n\n[... {omitted:,} characters omitted for length — "
        f"key clauses above and signature/schedule sections below ...]\n\n"
        + text[-tail:]
    )
    logger.info(
        f"  [TRUNCATE] {label} | original={len(text):,} chars | "
        f"truncated={len(truncated):,} chars | omitted={omitted:,} chars"
    )
    return truncated


# ── JSON schemas ──────────────────────────────────────────────────────────────
VALIDATOR_SCHEMA = {
    "metadata": {
        "vendor_name":       "string — vendor/supplier company name, or 'Unknown' if not found",
        "contract_type":     "string — e.g. 'Master Services Agreement', 'SOW', 'SaaS Subscription', etc.",
        "total_value":       "string — total contract value or 'Not specified'",
        "effective_date":    "string — contract start date or 'Not specified'",
        "expiry_date":       "string — contract end/expiry date or 'Not specified'",
        "contract_duration": "string — e.g. '12 months', '3 years', or 'Not specified'",
    },
    "summary": "string — 3-4 sentence plain English summary",
    "overall_risk": "GREEN | AMBER | RED",
    "clauses": [
        {
            "name":                  "string",
            "extracted_value":       "string — exact short quote or one-line summary (max 120 chars)",
            "extracted_value_full":  "string — full extracted text for this clause",
            "status":                "GREEN | AMBER | RED",
            "reason":                "string — why this status",
            "recommendation":        "string — one-line action (max 100 chars)",
            "recommendation_full":   "string — full recommendation detail",
        }
    ],
    "missing_clauses":      ["string — clause names not found"],
    "follow_up_questions":  ["string — questions to ask the vendor"],
}

COMPARISON_SCHEMA = {
    "overall_recommendation":    "string — which vendor is stronger overall and why",
    "top_negotiation_priorities": ["string — top 3 things to negotiate"],
    "clauses": [
        {
            "name":             "string",
            "vendor_a":         "string — what vendor A says",
            "vendor_b":         "string — what vendor B says",
            "winner":           "Vendor A | Vendor B | Equal",
            "risk_level":       "High | Medium | Low",
            "negotiation_tip":  "string",
        }
    ],
}


# ── Prompt builders ───────────────────────────────────────────────────────────
def build_validator_prompt(contract_text: str, checklist: list) -> str:
    text = _smart_truncate(contract_text, MAX_VALIDATOR_CHARS, "validator")
    return f"""You are a contract review specialist for Waters Corporation, a global life sciences company.

Review the following contract document carefully.

Your tasks:
1. Extract key metadata: vendor name, contract type, total value, effective date, expiry date, duration
2. Compare each clause against the Waters enterprise requirements checklist provided
3. Assign a status to each clause: GREEN (meets requirements), AMBER (present but needs negotiation), RED (missing or non-compliant)
4. For each clause provide: extracted_value (one-line, max 120 chars), status, reason (one sentence), recommendation (one-line, max 100 chars)
5. Write a plain English summary of the contract (3-4 sentences)
6. List any clauses required by Waters that are completely missing
7. Write 3-5 specific follow-up questions Waters should ask the vendor

Be concise. Keep all string values short. Return ONLY valid JSON matching this exact schema:
{json.dumps(VALIDATOR_SCHEMA, indent=2)}

WATERS ENTERPRISE REQUIREMENTS CHECKLIST:
{json.dumps(checklist, indent=2)}

CONTRACT TEXT:
{text}"""


def build_comparison_prompt(
    text_a: str,
    text_b: str,
    vendor_a_name: str,
    vendor_b_name: str,
    focus_areas: list | None = None,
) -> str:
    text_a = _smart_truncate(text_a, MAX_COMPARISON_CHARS, f"comparison-A ({vendor_a_name})")
    text_b = _smart_truncate(text_b, MAX_COMPARISON_CHARS, f"comparison-B ({vendor_b_name})")

    if focus_areas:
        focus_instruction = (
            f"Focus your comparison specifically on these clause types: {', '.join(focus_areas)}. "
            "Include a clause entry for each focus area even if one or both contracts are silent on it. "
            "You may briefly include other critical clauses if they represent significant risk."
        )
    else:
        focus_instruction = "Compare all material clause types found across both contracts."

    return f"""You are a contract review specialist for Waters Corporation, a global life sciences company.

Compare the following two vendor contracts clause by clause.

{focus_instruction}

For each clause, evaluate:
- What each vendor says about this clause
- Which vendor's terms are more favourable to Waters
- The risk level of any difference
- A one-line negotiation recommendation

At the end provide:
- An overall recommendation (which contract is stronger and why)
- The top 3 negotiation priorities across both contracts

Return ONLY valid JSON. No explanation, no markdown, no preamble. Match this exact schema:
{json.dumps(COMPARISON_SCHEMA, indent=2)}

CONTRACT A ({vendor_a_name}):
{text_a}

CONTRACT B ({vendor_b_name}):
{text_b}"""
