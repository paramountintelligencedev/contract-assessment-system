import { useState, useRef } from "react"
import axios from "axios"
import Chat from "../components/Chat"

const API = "http://localhost:8000/api"

const STATUS_MAP = {
  GREEN: { cls: "badge-green", label: "Compliant",     dot: "var(--green)", color: "var(--green)" },
  AMBER: { cls: "badge-amber", label: "Needs Review",  dot: "#e65100",      color: "#e65100"      },
  RED:   { cls: "badge-red",   label: "Non-Compliant", dot: "var(--red)",   color: "var(--red)"   },
}

const RISK_META = {
  GREEN: { label: "Low Risk",    bar: 30,  color: "var(--green)", bg: "#e3fcef", glow: "rgba(0,135,90,.2)"  },
  AMBER: { label: "Medium Risk", bar: 65,  color: "#e65100",      bg: "#fffaf0", glow: "rgba(230,81,0,.2)"  },
  RED:   { label: "High Risk",   bar: 100, color: "var(--red)",   bg: "#fff5f5", glow: "rgba(197,48,48,.2)" },
}

const SORT_ORDER = { RED: 0, AMBER: 1, GREEN: 2 }

// ── helpers ──────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.AMBER
  return (
    <span className={`badge ${s.cls}`}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {s.label}
    </span>
  )
}

function Spin() {
  return <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
}

function truncate(str, n) {
  if (!str) return "—"
  return str.length > n ? str.slice(0, n).trimEnd() + "…" : str
}

function buildChatContext(fileName, r) {
  const clauses = r.clauses.map(c =>
    `• ${c.name}: ${c.extracted_value_full || c.extracted_value} [${c.status}] — ${c.recommendation_full || c.recommendation}`
  ).join("\n")
  const missing = r.missing_clauses?.length ? "\nMissing: " + r.missing_clauses.join(", ") : ""
  const meta = r.metadata
    ? `Vendor: ${r.metadata.vendor_name} | Type: ${r.metadata.contract_type} | Value: ${r.metadata.total_value}`
    : ""
  return `Contract: ${fileName}\n${meta}\nSummary: ${r.summary}\nRisk: ${r.overall_risk}\n\nClauses:\n${clauses}${missing}`
}

// Build contract-specific suggested questions from actual findings
function buildSuggestions(result) {
  const suggestions = []
  const red   = result.clauses.filter(c => c.status === "RED")
  const amber = result.clauses.filter(c => c.status === "AMBER")

  red.slice(0, 2).forEach(c => {
    const val = c.extracted_value ? `"${truncate(c.extracted_value, 40)}"` : c.name
    suggestions.push(`What is the exact risk with the ${c.name} clause (${val})?`)
  })
  amber.slice(0, 1).forEach(c => {
    suggestions.push(`How should Waters negotiate the ${c.name} clause?`)
  })
  if (result.missing_clauses?.length)
    suggestions.push(`What is the legal exposure from a missing ${result.missing_clauses[0]} clause?`)
  if (result.metadata?.total_value && result.metadata.total_value !== "Not specified")
    suggestions.push(`Is the contract value of ${result.metadata.total_value} reasonable for this scope?`)

  return suggestions.slice(0, 4)
}

// ── PDF export ────────────────────────────────────────────────────────────────
function exportPDF(result, file) {
  const m   = result.metadata || {}
  const risk = RISK_META[result.overall_risk]

  const clauseRows = [...result.clauses]
    .sort((a, b) => (SORT_ORDER[a.status] ?? 1) - (SORT_ORDER[b.status] ?? 1))
    .map(c => `
      <tr>
        <td style="font-weight:600;color:#003087">${c.name}</td>
        <td>${c.extracted_value_full || c.extracted_value || "—"}</td>
        <td><span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${c.status === "GREEN" ? "#e3fcef" : c.status === "RED" ? "#fff5f5" : "#fffaf0"};color:${c.status === "GREEN" ? "#00875a" : c.status === "RED" ? "#c53030" : "#c05621"}">${c.status}</span></td>
        <td>${c.recommendation_full || c.recommendation || "—"}</td>
      </tr>`).join("")

  const missing = result.missing_clauses?.length
    ? `<h3>Missing Clauses</h3><ul>${result.missing_clauses.map(m => `<li>${m}</li>`).join("")}</ul>`
    : ""

  const followUp = result.follow_up_questions?.length
    ? `<h3>Follow-up Questions for Vendor</h3><ol>${result.follow_up_questions.map(q => `<li>${q}</li>`).join("")}</ol>`
    : ""

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Waters Contract Review — ${file.name}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a2e; padding: 40px; }
      .header { background: #003087; color: #fff; padding: 24px 32px; margin: -40px -40px 32px; display: flex; justify-content: space-between; align-items: center; }
      .header h1 { font-size: 20px; font-weight: 700; }
      .header .sub { font-size: 12px; opacity: .6; margin-top: 4px; }
      .risk-badge { padding: 6px 18px; border-radius: 20px; font-weight: 800; font-size: 14px; background: ${risk.bg}; color: ${risk.color}; }
      .meta { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 28px; }
      .meta-item { background: #f0f4f8; border-radius: 8px; padding: 14px 18px; }
      .meta-item .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #718096; margin-bottom: 4px; }
      .meta-item .val   { font-size: 14px; font-weight: 600; color: #003087; }
      .summary { background: #f8fafd; border-left: 4px solid ${risk.color}; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 28px; line-height: 1.7; }
      h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #003087; margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e2ddd6; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #003087; color: rgba(255,255,255,.8); padding: 10px 14px; text-align: left; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
      td { padding: 10px 14px; border-bottom: 1px solid #f0f4f8; vertical-align: top; line-height: 1.5; }
      tr:nth-child(even) td { background: #f8fafd; }
      ul, ol { padding-left: 20px; line-height: 2; }
      .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2ddd6; font-size: 11px; color: #718096; display: flex; justify-content: space-between; }
      @media print { body { padding: 20px; } .header { margin: -20px -20px 24px; } }
    </style>
  </head><body>
    <div class="header">
      <div><div class="sub">WATERS CORPORATION · CONFIDENTIAL</div><h1>Contract Review Report</h1><div class="sub">${file.name}</div></div>
      <span class="risk-badge">● ${result.overall_risk} — ${risk.label}</span>
    </div>

    <div class="meta">
      <div class="meta-item"><div class="label">Vendor</div><div class="val">${m.vendor_name || "—"}</div></div>
      <div class="meta-item"><div class="label">Contract Type</div><div class="val">${m.contract_type || "—"}</div></div>
      <div class="meta-item"><div class="label">Total Value</div><div class="val">${m.total_value || "—"}</div></div>
      <div class="meta-item"><div class="label">Effective Date</div><div class="val">${m.effective_date || "—"}</div></div>
      <div class="meta-item"><div class="label">Expiry Date</div><div class="val">${m.expiry_date || "—"}</div></div>
      <div class="meta-item"><div class="label">Duration</div><div class="val">${m.contract_duration || "—"}</div></div>
    </div>

    <div class="summary">${result.summary}</div>

    <h3>Clause Review</h3>
    <table><thead><tr><th>Clause</th><th>Contract Language</th><th>Status</th><th>Recommendation</th></tr></thead>
    <tbody>${clauseRows}</tbody></table>

    ${missing}
    ${followUp}

    <div class="footer">
      <span>Generated by Waters Contract Intelligence · Powered by Claude</span>
      <span>${new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</span>
    </div>
  </body></html>`

  const win = window.open("", "_blank")
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 400)
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ title, count, defaultOpen = true, children, accent = "var(--w-teal)" }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="fade-up" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "15px 20px",
        background: open ? "linear-gradient(135deg, var(--w-navy-dark), var(--w-navy))" : "var(--surface)",
        border: "none", cursor: "pointer", transition: "background .2s",
      }}>
        <span style={{ width: 4, height: 18, borderRadius: 2, background: open ? "var(--w-teal)" : accent, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: open ? "#fff" : "var(--w-navy)", flex: 1, textAlign: "left" }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: open ? "rgba(255,255,255,.15)" : "var(--bg)", color: open ? "#fff" : "var(--muted)" }}>{count}</span>
        )}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={open ? "#fff" : "var(--muted)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div style={{ background: "var(--surface)", padding: "1.5rem 1.75rem", animation: "fadeUp .2s both" }}>{children}</div>}
    </div>
  )
}

// ── Clause card — scannable 3-col ─────────────────────────────────────────────
function ClauseCard({ clause, flat = false }) {
  const [expanded, setExpanded] = useState(false)
  const s = STATUS_MAP[clause.status] || STATUS_MAP.AMBER
  const borderColor = s.color

  const shortExtract = truncate(clause.extracted_value || clause.extracted_value_full, 90)
  const shortRec     = truncate(clause.recommendation  || clause.recommendation_full,  80)
  const hasMore = (clause.extracted_value_full && clause.extracted_value_full.length > 90) ||
                  (clause.recommendation_full  && clause.recommendation_full.length  > 80)

  const wrapStyle = flat
    ? { borderLeft: `4px solid ${borderColor}`, background: "var(--surface)", overflow: "hidden", transition: "background .15s" }
    : {
        borderRadius: "var(--radius)", border: "1px solid var(--border-light)",
        borderLeft: `4px solid ${borderColor}`,
        background: "var(--surface)", overflow: "hidden",
        boxShadow: "var(--shadow-xs)", transition: "box-shadow .18s, transform .18s",
      }

  return (
    <div style={wrapStyle}
      onMouseEnter={e => { flat ? e.currentTarget.style.background = "var(--bg)" : (e.currentTarget.style.boxShadow = "var(--shadow-md)", e.currentTarget.style.transform = "translateY(-2px)") }}
      onMouseLeave={e => { flat ? e.currentTarget.style.background = "var(--surface)" : (e.currentTarget.style.boxShadow = "var(--shadow-xs)", e.currentTarget.style.transform = "translateY(0)") }}
    >
      {/* Main row — 3 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: 0 }}>
        {/* Col 1: name + badge */}
        <div style={{ padding: "13px 16px", borderRight: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: 7, justifyContent: "center", background: `${borderColor}08` }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--w-navy)", lineHeight: 1.3 }}>{clause.name}</span>
          <Badge status={clause.status} />
        </div>

        {/* Col 2: extract */}
        <div style={{ padding: "13px 16px", borderRight: "1px solid var(--border-light)" }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {expanded ? (clause.extracted_value_full || clause.extracted_value || "—") : shortExtract}
          </p>
        </div>

        {/* Col 3: recommendation */}
        <div style={{ padding: "13px 16px" }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {expanded ? (clause.recommendation_full || clause.recommendation || "—") : shortRec}
          </p>
        </div>
      </div>

      {/* Expand row */}
      {hasMore && (
        <div style={{ borderTop: "1px solid var(--border-light)", padding: "5px 16px", background: "var(--bg)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setExpanded(e => !e)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, fontWeight: 600, color: "var(--w-teal)",
            letterSpacing: ".03em", display: "flex", alignItems: "center", gap: 4,
          }}>
            {expanded ? "Show less ▲" : "Show full detail ▼"}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Contract info card ────────────────────────────────────────────────────────
function ContractCard({ meta, file, onExport }) {
  const fields = [
    { label: "Vendor",          value: meta?.vendor_name },
    { label: "Contract value",  value: meta?.total_value },
    { label: "Duration",        value: meta?.contract_duration },
    { label: "Effective date",  value: meta?.effective_date },
    { label: "Expiry date",     value: meta?.expiry_date },
  ].filter(f => f.value && f.value !== "Not specified").slice(0, 5)

  const subtitle = [meta?.contract_type, "Analysed just now"].filter(Boolean).join(" · ")

  return (
    <div className="card fade-up" style={{ padding: "1.25rem 1.5rem" }}>
      {/* Top row: icon + name + export */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: fields.length ? 14 : 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--w-navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--w-navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file?.name}</p>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{subtitle}</p>
        </div>
        <button onClick={onExport} style={{
          display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
          background: "var(--surface)", border: "1.5px solid var(--border)",
          borderRadius: "var(--radius-sm)", padding: "7px 16px",
          color: "var(--w-navy)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--w-navy)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)" }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
      </div>
      {/* Metadata chips */}
      {fields.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {fields.map(({ label, value }) => (
            <div key={label} title={value} style={{ background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: 8, padding: "8px 14px", maxWidth: 260 }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--w-navy)", lineHeight: 1.3 }}>{truncate(value, 38)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Fixed chat panel ─────────────────────────────────────────────────────────
const PANEL_W  = 420
const HEADER_H = 71   // 3px teal bar + 68px header

function FixedChatPanel({ contractText, contractName, suggestions }) {
  return (
    <div style={{
      position: "fixed", right: 0, top: HEADER_H,
      width: PANEL_W, height: `calc(100vh - ${HEADER_H}px)`,
      zIndex: 50, display: "flex", flexDirection: "column",
      background: "var(--surface)",
      borderLeft: "1px solid var(--border-light)",
      boxShadow: "-4px 0 24px rgba(0,48,135,.1)",
    }}>
      <Chat contractText={contractText} contractName={contractName} suggestions={suggestions} height="100%" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Validator() {
  const [phase, setPhase]             = useState("upload")
  const [file, setFile]               = useState(null)
  const [result, setResult]           = useState(null)
  const [chatContext, setChatContext]  = useState("")
  const [chatSuggestions, setChatSuggestions] = useState([])
  const [clauseFilter, setClauseFilter] = useState("all")
  const [error, setError]             = useState(null)
  const inputRef = useRef()

  const showChat = chatContext !== ""

  // chatContext/chatSuggestions intentionally not cleared — panel stays visible
  function reset() { setPhase("upload"); setFile(null); setResult(null); setClauseFilter("all"); setError(null) }

  async function handleValidate() {
    if (!file) return
    setPhase("loading"); setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await axios.post(`${API}/validate`, form)
      setResult(res.data)
      setChatContext(buildChatContext(file.name, res.data))
      setChatSuggestions(buildSuggestions(res.data))
      setPhase("results")
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Unknown error")
      setPhase("upload")
    }
  }

  // Results prep (safe — only evaluated when result is non-null)
  const risk       = result ? RISK_META[result.overall_risk] : null
  const sorted     = result ? [...result.clauses].sort((a, b) => (SORT_ORDER[a.status] ?? 1) - (SORT_ORDER[b.status] ?? 1)) : []
  const statCounts = result ? {
    GREEN: result.clauses.filter(c => c.status === "GREEN").length,
    AMBER: result.clauses.filter(c => c.status === "AMBER").length,
    RED:   result.clauses.filter(c => c.status === "RED").length,
  } : { GREEN: 0, AMBER: 0, RED: 0 }
  const filteredClauses = clauseFilter === "all" ? sorted : sorted.filter(c => c.status === clauseFilter)

  return (
    <>
      {/* Fixed chat panel — visible once any workflow has run */}
      {showChat && (
        <FixedChatPanel contractText={chatContext} contractName={file?.name} suggestions={chatSuggestions} />
      )}

      {/* Main content — shifts left to clear the fixed panel */}
      <div style={{ paddingRight: showChat ? PANEL_W - 4 : 0, transition: "padding-right .3s cubic-bezier(.22,1,.36,1)" }}>

        {/* ── UPLOAD ─────────────────────────────────────────────────────── */}
        {phase === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "2rem" }}>
            <div className="fade-up" style={{ textAlign: "center" }}>
              <div className="teal-bar" style={{ margin: "0 auto 10px" }} />
              <h2 style={{ fontSize: 28, fontWeight: 700, color: "var(--w-navy)", letterSpacing: "-.02em", marginBottom: 8 }}>Vendor Proposal Validator</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 480 }}>
                Upload a vendor contract, SOW, or proposal. Claude will extract key terms and flag issues against Waters' enterprise requirements.
              </p>
            </div>
            <div className="card fade-up-2" style={{ padding: "2.5rem", width: "100%", maxWidth: 520 }}>
              <div className={`upload-zone${file ? " active" : ""}`} onClick={() => inputRef.current?.click()} style={{ marginBottom: "1.75rem", padding: "3rem 2rem" }}>
                <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
                <div style={{ fontSize: 44, marginBottom: 12, opacity: file ? 1 : .4 }}>📄</div>
                {file
                  ? <><p style={{ fontWeight: 700, color: "var(--w-navy)", fontSize: 16 }}>{file.name}</p><p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</p></>
                  : <><p style={{ fontWeight: 600, color: "var(--w-navy)", fontSize: 15 }}>Click to upload contract</p><p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>PDF, DOCX, or TXT · Up to 10 MB</p></>
                }
              </div>
              <button className="btn-primary" onClick={handleValidate} disabled={!file} style={{ width: "100%", justifyContent: "center", padding: "13px 28px", fontSize: 14 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                Validate Contract
              </button>
              {error && <div style={{ marginTop: "1rem", padding: "12px 16px", background: "var(--red-bg)", border: "1px solid rgba(197,48,48,.2)", borderRadius: "var(--radius-sm)", color: "var(--red)", fontSize: 13 }}>⚠️ {error}</div>}
            </div>
          </div>
        )}

        {/* ── LOADING ─────────────────────────────────────────────────────── */}
        {phase === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 24 }}>
            <div style={{ position: "relative", width: 80, height: 80 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid var(--border)" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--w-teal)", animation: "spin 1s linear infinite" }} />
              <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--w-blue)", animation: "spin 1.4s linear infinite reverse" }} />
              <div style={{ position: "absolute", inset: 16, borderRadius: "50%", background: "linear-gradient(135deg, var(--w-teal), var(--w-blue))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Georgia, serif" }}>W</span>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontWeight: 700, color: "var(--w-navy)", fontSize: 16, marginBottom: 6 }}>Claude is reviewing your contract</p>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>{file?.name}</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["Parsing document", "Extracting clauses", "Assessing risk"].map((step, i) => (
                <span key={step} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)", fontWeight: 500, animation: `pulse 1.5s ${i * .3}s ease-in-out infinite` }}>{step}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ─────────────────────────────────────────────────────── */}
        {phase === "results" && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Contract info card */}
            <ContractCard meta={result.metadata} file={file} onExport={() => exportPDF(result, file)} />

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }} className="fade-up">
              {[
                { label: "Overall Risk",  value: result.overall_risk, color: risk.color,     bg: risk.bg,           isRag: true },
                { label: "Compliant",     value: statCounts.GREEN,    color: "var(--green)", bg: "var(--green-bg)", icon: "✓"  },
                { label: "Needs Review",  value: statCounts.AMBER,    color: "#e65100",      bg: "var(--amber-bg)", icon: "⚠"  },
                { label: "Non-Compliant", value: statCounts.RED,      color: "var(--red)",   bg: "var(--red-bg)",   icon: "✕"  },
              ].map(({ label, value, color, bg, isRag, icon }) => (
                <div key={label} style={{
                  background: bg, border: `1px solid ${color}22`,
                  borderRadius: "var(--radius-lg)", padding: "1.25rem 1rem",
                  boxShadow: "var(--shadow-sm)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  textAlign: "center", gap: 5, position: "relative", overflow: "hidden",
                }}>
                  {isRag
                    ? <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-.02em" }}>{value}</div>
                    : <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                  }
                  <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: ".05em", textTransform: "uppercase" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Clause Review with filter tabs */}
            <div className="fade-up" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
              {/* Header */}
              <div style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", borderBottom: "1px solid var(--border-light)", flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--w-navy)", letterSpacing: ".01em" }}>Clause review</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { key: "all",   label: "All",           count: sorted.length },
                    { key: "RED",   label: "Non-compliant", count: statCounts.RED },
                    { key: "AMBER", label: "Needs review",  count: statCounts.AMBER },
                    { key: "GREEN", label: "Compliant",     count: statCounts.GREEN },
                  ].map(({ key, label, count }) => (
                    <button key={key} onClick={() => setClauseFilter(key)} style={{
                      padding: "4px 13px", borderRadius: 20, cursor: "pointer", transition: "all .15s",
                      border: clauseFilter === key ? "none" : "1px solid var(--border)",
                      background: clauseFilter === key ? "var(--w-navy)" : "transparent",
                      color: clauseFilter === key ? "#fff" : "var(--text-secondary)",
                      fontSize: 12, fontWeight: 600,
                    }}>
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", background: "var(--bg)", borderBottom: "1px solid var(--border-light)" }}>
                {["Clause", "Contract says", "Recommendation"].map(h => (
                  <div key={h} style={{ padding: "7px 16px", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>{h}</div>
                ))}
              </div>
              {/* Clause rows */}
              <div style={{ background: "var(--surface)", display: "flex", flexDirection: "column", gap: 0 }}>
                {filteredClauses.map((c, i) => (
                  <div key={i} style={{ borderBottom: i < filteredClauses.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                    <ClauseCard clause={c} flat />
                  </div>
                ))}
                {filteredClauses.length === 0 && (
                  <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "2rem 0" }}>No clauses in this category.</p>
                )}
              </div>
            </div>

            {result.missing_clauses?.length > 0 && (
              <Section title="Missing Clauses" count={result.missing_clauses.length} accent="var(--red)" defaultOpen={true}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.missing_clauses.map((m, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 16px", background: "var(--red-bg)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(197,48,48,.15)" }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>✕</span>
                      <span style={{ fontSize: 13.5, color: "var(--red)", fontWeight: 500 }}>{m}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {result.follow_up_questions?.length > 0 && (
              <Section title="Follow-up Questions for Vendor" count={result.follow_up_questions.length} defaultOpen={false}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {result.follow_up_questions.map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg, var(--w-teal), var(--w-blue))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{i + 1}</span>
                      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.7, paddingTop: 3 }}>{q}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <div className="fade-up" style={{ marginTop: "0.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Done reviewing <strong style={{ color: "var(--w-navy)" }}>{file?.name}</strong></p>
              <button className="btn-ghost" onClick={reset} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
                Validate Another Contract
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
