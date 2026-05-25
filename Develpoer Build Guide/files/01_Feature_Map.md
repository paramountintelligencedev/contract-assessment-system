# Waters Contract PoC — Feature Map
**Paramount Intelligence | Built for Catalant | May 2026**

---

## Prototype Scope

Two workflows. One prototype. Built locally in Day 1. Deployed to AWS on Day 2.

---

## Workflow 1 — Vendor Proposal Validator

### What it does
A user uploads a vendor contract, SOW, or proposal (e.g. the Deloitte 150-page document). Claude reads it, extracts all key terms, compares against Waters' standard enterprise requirements checklist, and produces a decision-ready risk report.

### Input
- Single document: PDF, DOCX, or TXT
- Supported size: up to ~200 pages (Claude long-context window handles this natively)

### What Claude extracts
| Field | Description |
|---|---|
| Contract type | MSA, SOW, NDA, Amendment |
| Vendor name | Auto-detected |
| Effective date | Start date of agreement |
| Expiration / renewal date | End date and auto-renewal terms |
| Payment terms | Net 30, milestone-based, etc. |
| Total contract value | If stated |
| Key obligations | What Waters must do |
| Vendor obligations | What vendor must deliver |
| Milestones | Delivery dates and deliverables |
| Termination clauses | Conditions and notice period |
| Liability cap | Maximum liability stated |
| IP ownership | Who owns what |
| Security / data clauses | Data handling, confidentiality |
| Governing law | Jurisdiction |
| Missing clauses | Required clauses not found |

### What the risk report shows
- **Green** — clause present and meets Waters' standard
- **Amber** — clause present but needs negotiation
- **Red** — clause missing or non-compliant
- Summary paragraph written by Claude
- Recommended follow-up questions for vendor

### Output
- On-screen risk report with colour-coded status per clause
- Downloadable JSON of extracted metadata
- Plain English summary

---

## Workflow 2 — Contract Comparison

### What it does
A user uploads two vendor contracts for the same type of engagement. Claude reads both, compares them clause by clause, highlights differences, flags which vendor's terms are stronger, and recommends what to negotiate.

### Input
- Two documents: PDF, DOCX, or TXT
- Both documents processed in the same Claude call using long context

### What Claude compares
| Clause | Compared |
|---|---|
| Pricing and payment terms | Side by side |
| Termination rights | Which is more favourable |
| Liability cap | Which is higher / lower |
| IP ownership | Any differences |
| Security obligations | Gaps between vendors |
| SLA and penalties | Response times, remedies |
| Renewal terms | Auto-renewal, notice periods |
| Governing law | Jurisdiction differences |
| Missing clauses | What one has that the other doesn't |

### What the comparison output shows
- Side-by-side clause comparison table
- Winner per clause (Vendor A / Vendor B / Neutral)
- Recommended negotiation points
- Overall recommendation

### Output
- On-screen comparison table
- Recommended negotiation letter draft (optional, Claude-generated)
- Downloadable JSON

---

## Shared Features (Both Workflows)

| Feature | Detail |
|---|---|
| Human in the loop | Nothing leaves the system without user review |
| Audit log | Every upload and result timestamped locally |
| No CLM required | Works entirely on documents — email, uploads, shared drive files |
| No Ariba integration | Day 1 scope intentionally excludes Ariba |
| Ariba-ready | Architecture designed so Ariba API can be added in a future sprint |
| Synthetic contracts | Demo uses realistic synthetic contracts — no real Waters data required |
| Claude-native | Hard requirement met — Claude API only, no other LLM |

---

## Out of Scope for Day 1 Prototype

- Ariba integration
- ServiceNow integration
- User authentication / login
- AWS deployment (Day 2)
- Multi-user access
- Contract database / storage beyond local JSON files
- Email ingestion (future sprint)

---

## What Waters Should Expect to See in the Demo

1. Upload a contract (or two) via the browser
2. Watch extraction happen in real time (streaming Claude response)
3. See the risk report or comparison table appear on screen
4. Review the output — Green / Amber / Red per clause
5. See a plain English summary written by Claude
6. Download the JSON output

**Total demo time: under 3 minutes per workflow**
