# Waters Contract PoC — Step by Step Build Plan
**Day 1: Local Build | Day 2: AWS Deployment**

---

## Pre-Build Checklist (Before You Start)

- [ ] Anthropic API key ready
- [ ] Python 3.11+ installed
- [ ] Node.js 18+ installed
- [ ] pip and npm available
- [ ] VS Code or preferred editor open
- [ ] Synthetic contracts ready (see Data section below)

---

## Synthetic Contracts Needed

You need four synthetic contracts to demonstrate both workflows convincingly.

### For Workflow 1 (Proposal Validator)
- `deloitte_sow_150page.pdf` — A realistic 150-page SOW with some intentionally missing or weak clauses (no liability cap stated, vague IP ownership, auto-renewal buried in fine print)
- `waters_enterprise_checklist.json` — Waters' standard requirements (you define this — 15 to 20 criteria)

### For Workflow 2 (Contract Comparison)
- `vendor_a_msa.pdf` — MSA from Vendor A (strong on liability, weak on termination)
- `vendor_b_msa.pdf` — MSA from Vendor B (weak on liability, strong on termination and IP)

### How to generate them
Use Claude directly in claude.ai to generate all four. Prompts:

**For the SOW:**
> "Generate a realistic 8-10 page IT professional services Statement of Work from a large consulting firm to a life sciences company. Include sections on scope, deliverables, milestones, payment terms, IP ownership, termination, liability, and security. Intentionally make the liability cap vague, omit an auto-renewal clause, and make the IP ownership clause ambiguous. Format as a professional document."

**For the MSA x2:**
> "Generate two different Master Services Agreements for IT vendor services. Vendor A should have a strong liability cap ($2M), weak termination rights (90 days notice), and clear IP assignment to client. Vendor B should have a weak liability cap ($500K), strong termination rights (30 days for cause), and shared IP ownership. Both should be realistic and professional."

**For the checklist:**
> "Generate a JSON array of 15 enterprise contract requirements for a life sciences company reviewing IT vendor contracts. Each item should have: id, name, description, required (boolean), risk_level (high/medium/low)."

Save all as files in `/data/contracts/` in your project.

---

## Day 1 Build Plan — Local

### Hour 1: Project setup and backend skeleton

```
waters-contract-poc/
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── validator.py
│   │   └── comparison.py
│   ├── services/
│   │   ├── document_parser.py
│   │   ├── claude_service.py
│   │   └── prompt_builder.py
│   ├── models/
│   │   └── schemas.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Validator.jsx
│   │   │   └── Comparison.jsx
│   │   └── components/
│   │       ├── UploadZone.jsx
│   │       ├── RiskReport.jsx
│   │       └── ComparisonTable.jsx
│   └── package.json
└── data/
    └── contracts/
```

**Tasks:**
- Create folder structure
- Set up FastAPI with uvicorn
- Create requirements.txt
- Set up React with Vite
- Verify both run locally

**requirements.txt:**
```
fastapi==0.111.0
uvicorn==0.30.0
python-multipart==0.0.9
anthropic==0.28.0
pypdf2==3.0.1
python-docx==1.1.0
python-dotenv==1.0.1
pydantic==2.7.1
```

---

### Hour 2: Document parser and Claude service

**document_parser.py** — handles PDF, DOCX, TXT extraction to plain text.

**claude_service.py** — single function that calls Claude API and returns structured JSON. Uses `claude-sonnet-4-20250514`. Streams the response back to the frontend.

**Key principle:** Send the full document text to Claude in one call. Claude's long context window handles 150-page documents natively. No chunking needed for Day 1.

---

### Hour 3: Workflow 1 — Validator backend route

**validator.py router:**
- POST `/api/validate` — accepts file upload + checklist
- Calls document parser → gets text
- Calls prompt builder → builds extraction + validation prompt
- Calls Claude service → gets structured JSON back
- Returns risk report JSON to frontend

**Prompt structure for Workflow 1:**
```
You are a contract review specialist for Waters Corporation.

Review the following contract document and:
1. Extract all key metadata fields listed below
2. Compare each field against the Waters enterprise requirements checklist
3. Assign a status: GREEN (meets requirements), AMBER (partial / needs negotiation), RED (missing or non-compliant)
4. Write a plain English summary (3-4 sentences)
5. List 3-5 recommended follow-up questions for the vendor

Return ONLY valid JSON matching this exact schema: [schema here]

CONTRACT TEXT:
[full document text]

WATERS CHECKLIST:
[checklist JSON]
```

---

### Hour 4: Workflow 2 — Comparison backend route

**comparison.py router:**
- POST `/api/compare` — accepts two file uploads
- Parses both documents
- Builds comparison prompt with both texts
- Claude compares side by side and returns structured JSON
- Returns comparison table JSON

**Prompt structure for Workflow 2:**
```
You are a contract review specialist for Waters Corporation.

Compare the following two vendor contracts clause by clause.

For each clause type listed below:
1. Summarise what Vendor A says
2. Summarise what Vendor B says
3. State which is more favourable to Waters (A / B / Equal)
4. State the risk level of the difference (High / Medium / Low)
5. Give a one-line negotiation recommendation

At the end, give an overall recommendation on which contract is stronger and list the top 3 negotiation priorities.

Return ONLY valid JSON matching this schema: [schema here]

CONTRACT A (Vendor A):
[document A text]

CONTRACT B (Vendor B):
[document B text]
```

---

### Hour 5: Frontend — Upload UI and Validator page

**Validator.jsx:**
- Drag and drop upload zone for one document
- Submit button
- Loading state (show "Claude is reviewing..." while API call runs)
- Results panel below showing:
  - Clause-by-clause table with Green / Amber / Red badges
  - Plain English summary
  - Follow-up questions
  - Download JSON button

**Comparison.jsx:**
- Two upload zones side by side (Vendor A / Vendor B)
- Submit button
- Results panel showing:
  - Side-by-side comparison table
  - Winner badge per row
  - Overall recommendation
  - Top negotiation priorities

---

### Hour 6: Polish, test, and run through demo

- Test with all four synthetic contracts
- Verify JSON parsing doesn't break on edge cases
- Add basic error handling (file too large, wrong format, API error)
- Add loading spinners
- Run full demo end to end — time it
- Fix any broken UI elements
- Prepare two demo scenarios:
  1. Upload the Deloitte SOW → show the risk report
  2. Upload Vendor A + B MSAs → show the comparison

---

## Day 2 Build Plan — AWS Deployment

### Hour 1: AWS setup
- Create S3 bucket with encryption (AES-256, server-side)
- Create EC2 instance (t3.medium, Amazon Linux 2023)
- Set up security groups (port 8000 for API, port 3000 for frontend)
- Store API key in AWS Secrets Manager (not in .env)

### Hour 2: Backend deployment
- SSH into EC2
- Install Python, pip, dependencies
- Upload backend code
- Run with uvicorn behind nginx
- Test API endpoints

### Hour 3: Frontend deployment
- Build React app (`npm run build`)
- Upload dist folder to S3 or serve from EC2
- Configure nginx to serve frontend and proxy API calls

### Hour 4: End to end test on AWS
- Upload contracts through the live URL
- Verify Claude API calls work from EC2
- Verify S3 storage is working
- Run full demo on live URL
- Share URL with Megan / Catalant team

---

## Definition of Done — Day 1

- [ ] Both workflows work locally
- [ ] Validator produces Green/Amber/Red risk report
- [ ] Comparison produces side-by-side table with recommendations
- [ ] Demo runs end to end in under 3 minutes per workflow
- [ ] No crashes on the four synthetic contracts
- [ ] JSON output downloadable

## Definition of Done — Day 2

- [ ] Prototype accessible via public URL
- [ ] Contracts stored in encrypted S3 bucket
- [ ] API key not exposed anywhere in code or frontend
- [ ] Full demo runs on live URL
- [ ] URL shared with Catalant team by EOD Tuesday
