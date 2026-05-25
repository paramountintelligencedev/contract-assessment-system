import json

VALIDATOR_SCHEMA = {
    "metadata": {
        "vendor_name": "string — vendor/supplier company name, or 'Unknown' if not found",
        "contract_type": "string — e.g. 'Master Services Agreement', 'SOW', 'SaaS Subscription', etc.",
        "total_value": "string — total contract value or 'Not specified'",
        "effective_date": "string — contract start date or 'Not specified'",
        "expiry_date": "string — contract end/expiry date or 'Not specified'",
        "contract_duration": "string — e.g. '12 months', '3 years', or 'Not specified'"
    },
    "summary": "string — 3-4 sentence plain English summary",
    "overall_risk": "GREEN | AMBER | RED",
    "clauses": [
        {
            "name": "string",
            "extracted_value": "string — exact short quote or one-line summary of what the contract says (max 120 chars)",
            "extracted_value_full": "string — full extracted text for this clause",
            "status": "GREEN | AMBER | RED",
            "reason": "string — why this status",
            "recommendation": "string — one-line action (max 100 chars)",
            "recommendation_full": "string — full recommendation detail"
        }
    ],
    "missing_clauses": ["string — clause names not found"],
    "follow_up_questions": ["string — questions to ask the vendor"]
}

COMPARISON_SCHEMA = {
    "overall_recommendation": "string — which vendor is stronger overall and why",
    "top_negotiation_priorities": ["string — top 3 things to negotiate"],
    "clauses": [
        {
            "name": "string",
            "vendor_a": "string — what vendor A says",
            "vendor_b": "string — what vendor B says",
            "winner": "Vendor A | Vendor B | Equal",
            "risk_level": "High | Medium | Low",
            "negotiation_tip": "string"
        }
    ]
}

def build_validator_prompt(contract_text: str, checklist: list) -> str:
    return f"""You are a contract review specialist for Waters Corporation, a global life sciences company.

Review the following contract document carefully.

Your tasks:
1. Extract key metadata: vendor name, contract type, total value, effective date, expiry date, duration
2. Compare each clause against the Waters enterprise requirements checklist provided
3. Assign a status to each clause: GREEN (meets requirements), AMBER (present but needs negotiation), RED (missing or non-compliant)
4. For each clause provide: a short one-line extract (max 120 chars) AND the full extracted text; a short one-line recommendation (max 100 chars) AND the full recommendation
5. Write a plain English summary of the contract (3-4 sentences)
6. List any clauses required by Waters that are completely missing
7. Write 3-5 specific, targeted follow-up questions Waters should ask the vendor — reference actual clause language or values found

Return ONLY valid JSON. No explanation, no markdown, no preamble. Match this exact schema:
{json.dumps(VALIDATOR_SCHEMA, indent=2)}

WATERS ENTERPRISE REQUIREMENTS CHECKLIST:
{json.dumps(checklist, indent=2)}

CONTRACT TEXT:
{contract_text}"""


def build_comparison_prompt(text_a: str, text_b: str, vendor_a_name: str, vendor_b_name: str, focus_areas: list = None) -> str:
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
