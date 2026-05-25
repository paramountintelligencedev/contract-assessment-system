# Waters Contract PoC — Developer Guide
**Paramount Intelligence | Claude API + FastAPI + React**

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Backend | FastAPI (Python 3.11) |
| AI | Claude API — claude-sonnet-4-20250514 |
| Document parsing | PyPDF2 (PDF), python-docx (DOCX) |
| Local storage | File system + JSON |
| Day 2 storage | AWS S3 (encrypted) |

---

## Project Setup

### 1. Backend setup

```bash
mkdir waters-contract-poc && cd waters-contract-poc
mkdir backend frontend data/contracts

cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

Create `requirements.txt`:
```
fastapi==0.111.0
uvicorn==0.30.0
python-multipart==0.0.9
anthropic==0.28.0
PyPDF2==3.0.1
python-docx==1.1.0
python-dotenv==1.0.1
pydantic==2.7.1
```

```bash
pip install -r requirements.txt
```

Create `.env`:
```
ANTHROPIC_API_KEY=your_key_here
```

---

### 2. Frontend setup

```bash
cd ../frontend
npm create vite@latest . -- --template react
npm install
npm install axios react-dropzone
```

---

## Backend Code

### `backend/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import validator, comparison
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Waters Contract PoC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(validator.router, prefix="/api")
app.include_router(comparison.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok"}
```

---

### `backend/services/document_parser.py`

```python
import PyPDF2
import docx
import io

def parse_document(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from PDF, DOCX, or TXT."""
    ext = filename.lower().split(".")[-1]
    
    if ext == "pdf":
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    
    elif ext == "docx":
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join([para.text for para in doc.paragraphs]).strip()
    
    elif ext == "txt":
        return file_bytes.decode("utf-8").strip()
    
    else:
        raise ValueError(f"Unsupported file type: {ext}")
```

---

### `backend/services/claude_service.py`

```python
import anthropic
import os
import json

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def call_claude(prompt: str, max_tokens: int = 4096) -> dict:
    """
    Send a prompt to Claude and return parsed JSON.
    Claude is instructed to return only valid JSON.
    """
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=max_tokens,
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )
    
    raw_text = message.content[0].text
    
    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    
    return json.loads(raw_text.strip())
```

---

### `backend/services/prompt_builder.py`

```python
import json

VALIDATOR_SCHEMA = {
    "summary": "string — 3-4 sentence plain English summary",
    "overall_risk": "GREEN | AMBER | RED",
    "clauses": [
        {
            "name": "string",
            "extracted_value": "string — what the contract says",
            "status": "GREEN | AMBER | RED",
            "reason": "string — why this status",
            "recommendation": "string — what to do"
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
1. Extract all key metadata and clause information
2. Compare each clause against the Waters enterprise requirements checklist provided
3. Assign a status to each clause: GREEN (meets requirements), AMBER (present but needs negotiation), RED (missing or non-compliant)
4. Write a plain English summary of the contract (3-4 sentences)
5. List any clauses required by Waters that are completely missing
6. Write 3-5 follow-up questions Waters should ask the vendor

Return ONLY valid JSON. No explanation, no markdown, no preamble. Match this exact schema:
{json.dumps(VALIDATOR_SCHEMA, indent=2)}

WATERS ENTERPRISE REQUIREMENTS CHECKLIST:
{json.dumps(checklist, indent=2)}

CONTRACT TEXT:
{contract_text}"""


def build_comparison_prompt(text_a: str, text_b: str, vendor_a_name: str, vendor_b_name: str) -> str:
    return f"""You are a contract review specialist for Waters Corporation, a global life sciences company.

Compare the following two vendor contracts clause by clause.

For each clause type, evaluate:
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
```

---

### `backend/routers/validator.py`

```python
from fastapi import APIRouter, UploadFile, File, Form
from services.document_parser import parse_document
from services.claude_service import call_claude
from services.prompt_builder import build_validator_prompt
import json

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
    file_bytes = await file.read()
    contract_text = parse_document(file_bytes, file.filename)
    prompt = build_validator_prompt(contract_text, DEFAULT_CHECKLIST)
    result = call_claude(prompt, max_tokens=4096)
    return result
```

---

### `backend/routers/comparison.py`

```python
from fastapi import APIRouter, UploadFile, File, Form
from services.document_parser import parse_document
from services.claude_service import call_claude
from services.prompt_builder import build_comparison_prompt

router = APIRouter()

@router.post("/compare")
async def compare_contracts(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
    vendor_a_name: str = Form(default="Vendor A"),
    vendor_b_name: str = Form(default="Vendor B"),
):
    bytes_a = await file_a.read()
    bytes_b = await file_b.read()
    text_a = parse_document(bytes_a, file_a.filename)
    text_b = parse_document(bytes_b, file_b.filename)
    prompt = build_comparison_prompt(text_a, text_b, vendor_a_name, vendor_b_name)
    result = call_claude(prompt, max_tokens=4096)
    return result
```

---

## Frontend Code

### `frontend/src/App.jsx`

```jsx
import { useState } from "react"
import Validator from "./pages/Validator"
import Comparison from "./pages/Comparison"

export default function App() {
  const [tab, setTab] = useState("validator")

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Waters Contract Review</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        AI-powered contract analysis — powered by Claude
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        <button
          onClick={() => setTab("validator")}
          style={{ fontWeight: tab === "validator" ? 600 : 400 }}
        >
          Proposal Validator
        </button>
        <button
          onClick={() => setTab("comparison")}
          style={{ fontWeight: tab === "comparison" ? 600 : 400 }}
        >
          Contract Comparison
        </button>
      </div>

      {tab === "validator" && <Validator />}
      {tab === "comparison" && <Comparison />}
    </div>
  )
}
```

---

### `frontend/src/pages/Validator.jsx`

```jsx
import { useState } from "react"
import axios from "axios"

const API = "http://localhost:8000/api"

const STATUS_COLORS = {
  GREEN: { bg: "#d4edda", color: "#155724" },
  AMBER: { bg: "#fff3cd", color: "#856404" },
  RED:   { bg: "#f8d7da", color: "#721c24" },
}

export default function Validator() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await axios.post(`${API}/validate`, form)
      setResult(res.data)
    } catch (e) {
      setError("Something went wrong. Check the API is running.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Vendor Proposal Validator</h2>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 16 }}>
        Upload a vendor contract, SOW, or proposal. Claude will extract key terms and flag any issues against Waters' enterprise requirements.
      </p>

      <input type="file" accept=".pdf,.docx,.txt" onChange={e => setFile(e.target.files[0])} />
      <button onClick={handleSubmit} disabled={!file || loading} style={{ marginLeft: 12 }}>
        {loading ? "Claude is reviewing..." : "Validate Contract"}
      </button>

      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 32 }}>
          {/* Overall risk badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Overall risk:</span>
            <span style={{ ...STATUS_COLORS[result.overall_risk], padding: "4px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
              {result.overall_risk}
            </span>
          </div>

          {/* Summary */}
          <div style={{ background: "#f8f9fa", padding: 16, borderRadius: 8, marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
            {result.summary}
          </div>

          {/* Clause table */}
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Clause Review</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #dee2e6" }}>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Clause</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Contract says</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {result.clauses.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{c.extracted_value}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ ...STATUS_COLORS[c.status], padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{c.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Missing clauses */}
          {result.missing_clauses?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>Missing Clauses</h3>
              <ul style={{ fontSize: 13, color: "#721c24" }}>
                {result.missing_clauses.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          {/* Follow up questions */}
          {result.follow_up_questions?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>Follow-up Questions for Vendor</h3>
              <ol style={{ fontSize: 13, color: "#555", lineHeight: 1.8 }}>
                {result.follow_up_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ol>
            </div>
          )}

          {/* Download */}
          <button
            style={{ marginTop: 24 }}
            onClick={() => {
              const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
              const a = document.createElement("a")
              a.href = URL.createObjectURL(blob)
              a.download = "contract_review.json"
              a.click()
            }}
          >
            Download JSON
          </button>
        </div>
      )}
    </div>
  )
}
```

---

### `frontend/src/pages/Comparison.jsx`

```jsx
import { useState } from "react"
import axios from "axios"

const API = "http://localhost:8000/api"

const WINNER_COLORS = {
  "Vendor A": { bg: "#cce5ff", color: "#004085" },
  "Vendor B": { bg: "#d4edda", color: "#155724" },
  "Equal":    { bg: "#e2e3e5", color: "#383d41" },
}

const RISK_COLORS = {
  High:   { color: "#721c24" },
  Medium: { color: "#856404" },
  Low:    { color: "#155724" },
}

export default function Comparison() {
  const [fileA, setFileA] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [nameA, setNameA] = useState("Vendor A")
  const [nameB, setNameB] = useState("Vendor B")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!fileA || !fileB) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append("file_a", fileA)
      form.append("file_b", fileB)
      form.append("vendor_a_name", nameA)
      form.append("vendor_b_name", nameB)
      const res = await axios.post(`${API}/compare`, form)
      setResult(res.data)
    } catch (e) {
      setError("Something went wrong. Check the API is running.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Contract Comparison</h2>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 16 }}>
        Upload two vendor contracts. Claude will compare them clause by clause and recommend which terms to negotiate.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Vendor A name</label>
          <input value={nameA} onChange={e => setNameA(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
          <input type="file" accept=".pdf,.docx,.txt" onChange={e => setFileA(e.target.files[0])} />
        </div>
        <div>
          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Vendor B name</label>
          <input value={nameB} onChange={e => setNameB(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
          <input type="file" accept=".pdf,.docx,.txt" onChange={e => setFileB(e.target.files[0])} />
        </div>
      </div>

      <button onClick={handleSubmit} disabled={!fileA || !fileB || loading}>
        {loading ? "Claude is comparing..." : "Compare Contracts"}
      </button>

      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 32 }}>
          {/* Overall recommendation */}
          <div style={{ background: "#f8f9fa", padding: 16, borderRadius: 8, marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
            <strong>Overall recommendation:</strong> {result.overall_recommendation}
          </div>

          {/* Top negotiation priorities */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Top Negotiation Priorities</h3>
            <ol style={{ fontSize: 13, color: "#555", lineHeight: 1.8 }}>
              {result.top_negotiation_priorities.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
          </div>

          {/* Comparison table */}
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Clause by Clause</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #dee2e6" }}>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Clause</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>{nameA}</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>{nameB}</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Winner</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Risk</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Tip</th>
              </tr>
            </thead>
            <tbody>
              {result.clauses.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{c.vendor_a}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{c.vendor_b}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ ...WINNER_COLORS[c.winner], padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                      {c.winner}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", ...RISK_COLORS[c.risk_level], fontWeight: 500 }}>{c.risk_level}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{c.negotiation_tip}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Download */}
          <button
            style={{ marginTop: 24 }}
            onClick={() => {
              const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
              const a = document.createElement("a")
              a.href = URL.createObjectURL(blob)
              a.download = "contract_comparison.json"
              a.click()
            }}
          >
            Download JSON
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## Running Locally

### Start backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Start frontend
```bash
cd frontend
npm run dev
```

Frontend available at: `http://localhost:5173`
API docs available at: `http://localhost:8000/docs`

---

## Common Issues

| Issue | Fix |
|---|---|
| CORS error in browser | Check CORS origin in main.py matches frontend URL |
| JSON parse error from Claude | Claude returned text instead of JSON — check prompt ends with "Return ONLY valid JSON" |
| PDF extraction empty | Some PDFs are image-based — add a note that scanned PDFs need OCR (out of Day 1 scope) |
| File too large | Add file size check in FastAPI before calling Claude |
| API key error | Check .env file is in backend/ directory and loaded correctly |

---

## Day 2 AWS Notes

When deploying to AWS:
- Replace `.env` API key with AWS Secrets Manager lookup
- Replace local file storage with S3 put/get operations
- Add S3 bucket name to environment variables
- Use `boto3` for S3 operations
- Encrypt S3 bucket with AES-256 server-side encryption
- Restrict S3 bucket policy — no public access
- Run FastAPI on EC2 behind nginx
- Serve React build from S3 or EC2 nginx static files
