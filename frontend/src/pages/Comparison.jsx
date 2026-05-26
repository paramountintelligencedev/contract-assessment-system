import { useState, useRef, useEffect } from "react"
import axios from "axios"
import Chat from "../components/Chat"
import { nameFromFile } from "../utils/nameFromFile"

const PANEL_W  = 420
const HEADER_H = 71

const FOCUS_OPTIONS = [
  "Liability cap", "IP ownership", "Termination rights", "Payment terms",
  "Data security", "SLA & penalties", "Auto-renewal", "Governing law",
  "Subcontracting", "Insurance", "Confidentiality", "Dispute resolution",
]

const API = `${import.meta.env.VITE_API_URL ?? ""}/api`

const RISK_MAP = {
  High:   { color: "var(--red)",   bg: "var(--red-bg)",   dot: "#c53030", sort: 0 },
  Medium: { color: "#c05621",      bg: "var(--amber-bg)", dot: "#c05621", sort: 1 },
  Low:    { color: "var(--green)", bg: "var(--green-bg)", dot: "#00875a", sort: 2 },
}

function normalizeWinner(winner, nameA, nameB) {
  if (winner === nameA || winner === "Vendor A") return nameA
  if (winner === nameB || winner === "Vendor B") return nameB
  return "Equal"
}

function truncate(str, n) {
  if (!str) return "—"
  return str.length > n ? str.slice(0, n).trimEnd() + "…" : str
}

function WinnerBadge({ winner, nameA, nameB }) {
  const n = normalizeWinner(winner, nameA, nameB)
  const s = n === nameA
    ? { bg: "#eef0fb", color: "#283593", border: "rgba(40,53,147,.2)" }
    : n === nameB
    ? { bg: "#e8f5e9", color: "#1b5e20", border: "rgba(27,94,32,.2)" }
    : { bg: "#f3f4f6", color: "#374151", border: "rgba(55,65,81,.15)" }
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {n}
    </span>
  )
}

function RiskPill({ level }) {
  const s = RISK_MAP[level] || RISK_MAP.Medium
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.color, padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: ".04em", whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />{level} risk
    </span>
  )
}

function ClauseTableRow({ clause, nameA, nameB }) {
  const [expanded, setExpanded] = useState(false)
  const risk = RISK_MAP[clause.risk_level] || RISK_MAP.Medium
  const norm = normalizeWinner(clause.winner, nameA, nameB)
  const winnerA = norm === nameA
  const winnerB = norm === nameB

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 36px 1fr 130px" }}>

        {/* CLAUSE */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: 7, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: risk.dot, flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--w-navy)", lineHeight: 1.35 }}>{clause.name}</span>
          </div>
          <div style={{ paddingLeft: 15 }}>
            <RiskPill level={clause.risk_level} />
          </div>
        </div>

        {/* VENDOR A */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border-light)", background: winnerA ? "rgba(57,73,171,.025)" : "transparent" }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: winnerA ? "#283593" : "var(--muted)", marginBottom: 5 }}>
            ● {nameA}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {expanded ? (clause.vendor_a || "—") : truncate(clause.vendor_a, 100)}
          </p>
        </div>

        {/* EXPAND TOGGLE */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--border-light)" }}>
          <button
            onClick={() => setExpanded(e => !e)}
            title={expanded ? "Collapse" : "Expand"}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 6, borderRadius: 6, lineHeight: 1 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {expanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
            </svg>
          </button>
        </div>

        {/* VENDOR B */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid var(--border-light)", background: winnerB ? "rgba(46,125,50,.025)" : "transparent" }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: winnerB ? "#1b5e20" : "var(--muted)", marginBottom: 5 }}>
            ● {nameB}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {expanded ? (clause.vendor_b || "—") : truncate(clause.vendor_b, 100)}
          </p>
        </div>

        {/* RESULT */}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <WinnerBadge winner={clause.winner} nameA={nameA} nameB={nameB} />
        </div>
      </div>

      {expanded && clause.negotiation_tip && (
        <div style={{ padding: "10px 16px 12px 32px", background: "#fffdf5", borderTop: "1px dashed var(--border-light)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 12, flexShrink: 0 }}>💡</span>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.65, fontStyle: "italic" }}>{clause.negotiation_tip}</p>
        </div>
      )}
    </div>
  )
}

function LetterModal({ chatContext, nameA, nameB, onClose }) {
  const [content, setContent] = useState("")
  const [streaming, setStreaming] = useState(true)
  const [copied, setCopied]   = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function generate() {
      const question = `Draft a formal negotiation letter from Waters Corporation's Procurement team to the vendors.
Based on the contract comparison provided, write a professional letter that:
- Addresses the key clause differences and top negotiation priorities
- States Waters' specific position on each priority item
- References actual clause findings where relevant
- Is firm, professional, and specific — not generic
- Ends with a clear request for contract amendments before signing
Format it as a proper business letter.`

      try {
        const res = await fetch(`${API}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, contract_text: chatContext, history: [] }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = "", accumulated = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n"); buffer = lines.pop()
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue
            try {
              const p = JSON.parse(data)
              if (p.text) { accumulated += p.text; setContent(accumulated) }
            } catch {}
          }
        }
      } catch (e) {
        if (!cancelled) setContent(`Error generating letter: ${e.message}`)
      } finally {
        if (!cancelled) setStreaming(false)
      }
    }

    generate()
    return () => { cancelled = true }
  }, [chatContext])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [content])

  function copy() {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function download() {
    const blob = new Blob([content], { type: "text/plain" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `negotiation-letter-${nameA.replace(/\s+/g, "-")}-vs-${nameB.replace(/\s+/g, "-")}.txt`
    a.click()
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,13,46,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,13,46,.3)" }}>

        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: "var(--w-navy)" }}>Negotiation Letter Draft</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{nameA} vs {nameB} · {streaming ? "Generating…" : "Ready"}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, borderRadius: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {content
            ? <pre style={{ fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.8, color: "var(--text)", whiteSpace: "pre-wrap", margin: 0 }}>{content}</pre>
            : <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}>
                <span style={{ width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: "var(--w-teal)", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                Drafting your negotiation letter…
              </div>
          }
          {streaming && content && (
            <span style={{ display: "inline-block", width: 2, height: 14, background: "var(--w-navy)", marginLeft: 2, animation: "pulse 1s ease-in-out infinite", verticalAlign: "middle" }} />
          )}
        </div>

        {!streaming && content && (
          <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-light)", display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn-ghost" onClick={copy} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button className="btn-ghost" onClick={download} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Download .txt
            </button>
            <button className="btn-ghost" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

function buildComparisonContext(r, nameA, nameB) {
  const clauseLines = r.clauses.map(c =>
    `• ${c.name} [${c.risk_level}] — ${nameA}: ${c.vendor_a || "—"} | ${nameB}: ${c.vendor_b || "—"} | Winner: ${c.winner}`
  ).join("\n")
  const priorities = r.top_negotiation_priorities?.map((p, i) => `${i + 1}. ${p}`).join("\n") || ""
  return (
    `Comparison: ${nameA} vs ${nameB}\n` +
    `Overall recommendation: ${r.overall_recommendation}\n\n` +
    `Top negotiation priorities:\n${priorities}\n\n` +
    `Clause breakdown:\n${clauseLines}`
  )
}

function UploadCard({ label, accentColor, file, onFile, onDropDoc }) {
  const ref = useRef()
  const [dropHl, setDropHl] = useState(false)

  function onDragOver(e) {
    if (e.dataTransfer.types.includes("application/x-waters-doc")) {
      e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropHl(true)
    }
  }
  function onDrop(e) {
    e.preventDefault(); setDropHl(false)
    const raw = e.dataTransfer.getData("application/x-waters-doc")
    if (!raw) return
    try { onDropDoc(JSON.parse(raw)) } catch {}
  }

  return (
    <div className="card" style={{ padding: "1.5rem", borderTop: `3px solid ${accentColor}`, outline: dropHl ? `2px solid ${accentColor}` : "none", outlineOffset: 3, transition: "outline .15s" }}
      onDragOver={onDragOver} onDragLeave={() => setDropHl(false)} onDrop={onDrop}
    >
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>{label}</p>
      <div className={`upload-zone${file ? " active" : ""}${dropHl ? " active" : ""}`}
        onClick={() => ref.current?.click()}
        style={{ borderColor: dropHl ? accentColor : file ? accentColor : undefined, background: dropHl ? `${accentColor}0d` : undefined }}
      >
        <input ref={ref} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={e => onFile(e.target.files[0])} />
        <div style={{ fontSize: 28, opacity: file ? 1 : .45, marginBottom: 8 }}>{dropHl ? "🎯" : "📄"}</div>
        {dropHl
          ? <p style={{ fontWeight: 600, color: accentColor, fontSize: 13 }}>Drop to assign</p>
          : file
            ? <><p style={{ fontWeight: 600, color: "var(--w-navy)", fontSize: 13 }}>{file.name}</p><p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{((file.size || 0) / 1024).toFixed(1)} KB · Click to change</p></>
            : <><p style={{ fontWeight: 500, color: "var(--w-navy)", fontSize: 13 }}>Click to upload or drag from panel</p><p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>PDF, DOCX, or TXT</p></>
        }
      </div>
    </div>
  )
}

export default function Comparison({ preloadedDoc }) {
  const [phase, setPhase]               = useState("upload")
  const [fileA, setFileA]               = useState(null)
  const [fileB, setFileB]               = useState(null)
  const [nameA, setNameA]               = useState("Vendor A")
  const [nameB, setNameB]               = useState("Vendor B")
  const [result, setResult]             = useState(null)
  const [error, setError]               = useState(null)
  const [chatContext, setChatContext]   = useState("")
  const [chatSuggestions, setChatSuggestions] = useState([])
  const [focusAreas, setFocusAreas]     = useState([])
  const [clauseWinnerFilter, setClauseWinnerFilter] = useState("all")
  const [letterModal, setLetterModal]   = useState(false)
  const [chatPreFill, setChatPreFill]   = useState("")

  // When user selects a doc from the left panel, pre-fill Vendor A slot
  const prevDocId = useRef(null)
  if (preloadedDoc && preloadedDoc.id !== prevDocId.current) {
    prevDocId.current = preloadedDoc.id
    if (preloadedDoc.file && phase !== "loading") {
      setFileA(preloadedDoc.file)
      setNameA(nameFromFile(preloadedDoc.name))
    }
  }

  const showChat = chatContext !== ""

  function toggleFocus(opt) {
    setFocusAreas(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])
  }

  function reset() {
    setPhase("upload"); setFileA(null); setFileB(null)
    setResult(null); setError(null); setFocusAreas([])
    setClauseWinnerFilter("all"); setLetterModal(false)
  }

  async function handleSubmit() {
    if (!fileA || !fileB) return
    setPhase("loading"); setError(null)

    const form = new FormData()
    if (fileA._s3Key) { form.append("s3_key_a", fileA._s3Key) } else { form.append("file_a", fileA) }
    if (fileB._s3Key) { form.append("s3_key_b", fileB._s3Key) } else { form.append("file_b", fileB) }
    form.append("vendor_a_name", nameA)
    form.append("vendor_b_name", nameB)
    form.append("focus_areas", JSON.stringify(focusAreas))

    try {
      // ── Step 1: submit job (returns job_id immediately) ───────────────────
      const submitRes = await fetch(`${API}/compare`, { method: "POST", body: form })
      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${submitRes.status}`)
      }
      const { job_id } = await submitRes.json()

      // ── Step 2: poll until done ───────────────────────────────────────────
      const MAX_ATTEMPTS = 90   // 90 × 2s = 3 minutes
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await new Promise(r => setTimeout(r, 2000))

        const pollRes = await fetch(`${API}/compare/${job_id}`)
        if (!pollRes.ok) {
          const err = await pollRes.json().catch(() => ({}))
          throw new Error(err.detail || `Poll failed: HTTP ${pollRes.status}`)
        }

        const state = await pollRes.json()

        if (state.status === "done") {
          setResult(state.result)
          setChatContext(buildComparisonContext(state.result, nameA, nameB))
          setChatSuggestions([
            `Which vendor has better payment terms?`,
            `What are the key risks in ${nameA}'s contract?`,
            `Compare liability caps — which is more favourable?`,
            `Summarise the most important differences`,
          ])
          setClauseWinnerFilter("all")
          setPhase("results")
          return
        }

        if (state.status === "error") {
          throw new Error(state.detail || "Comparison failed")
        }
        // pending / running — keep polling
      }

      throw new Error("Timed out waiting for comparison result. Please try again.")

    } catch (e) {
      setError(e.message || "Unknown error")
      setPhase("upload")
    }
  }

  // Results computed values
  const winsA     = result ? result.clauses.filter(c => normalizeWinner(c.winner, nameA, nameB) === nameA).length : 0
  const winsB     = result ? result.clauses.filter(c => normalizeWinner(c.winner, nameA, nameB) === nameB).length : 0
  const winsEqual = result ? result.clauses.filter(c => normalizeWinner(c.winner, nameA, nameB) === "Equal").length : 0
  const recommended = winsA > winsB ? nameA : winsB > winsA ? nameB : "Tied"
  const sorted    = result ? [...result.clauses].sort((a, b) => (RISK_MAP[a.risk_level]?.sort ?? 1) - (RISK_MAP[b.risk_level]?.sort ?? 1)) : []
  const filteredClauses = clauseWinnerFilter === "all"
    ? sorted
    : sorted.filter(c => normalizeWinner(c.winner, nameA, nameB) === clauseWinnerFilter)

  return (
    <>
      {letterModal && (
        <LetterModal
          chatContext={chatContext}
          nameA={nameA}
          nameB={nameB}
          onClose={() => setLetterModal(false)}
        />
      )}

      {showChat && (
        <div style={{
          position: "fixed", right: 0, top: HEADER_H,
          width: PANEL_W, height: `calc(100vh - ${HEADER_H}px)`,
          zIndex: 50, display: "flex", flexDirection: "column",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border-light)",
          boxShadow: "-4px 0 24px rgba(0,48,135,.1)",
        }}>
          <Chat
            contractText={chatContext}
            contractName={`${nameA} vs ${nameB}`}
            suggestions={chatSuggestions}
            height="100%"
            preFill={chatPreFill}
          />
        </div>
      )}

      <div style={{ paddingRight: showChat ? PANEL_W - 4 : 0, transition: "padding-right .3s cubic-bezier(.22,1,.36,1)" }}>

        {/* ── UPLOAD ──────────────────────────────────────────────────────── */}
        {phase === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <div className="fade-up">
              <div className="teal-bar" />
              <h2 style={{ fontSize: 26, fontWeight: 700, color: "var(--w-navy)", letterSpacing: "-.02em", marginBottom: 6 }}>Contract Comparison</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 600 }}>
                Upload two vendor contracts. Claude compares them clause by clause and surfaces what to negotiate.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="fade-up-2">
              {[
                { label: "Vendor A name", value: nameA, onChange: setNameA, accent: "#3949ab" },
                { label: "Vendor B name", value: nameB, onChange: setNameB, accent: "#2e7d32" },
              ].map(({ label, value, onChange, accent }) => (
                <div key={label}>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 6 }}>{label}</label>
                  <input className="w-input" value={value} onChange={e => onChange(e.target.value)}
                    onFocus={e => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 3px ${accent}22` }}
                    onBlur={e  => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none" }}
                  />
                </div>
              ))}
            </div>

            {/* Comparison focus */}
            <div className="fade-up-2" style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", padding: "1.1rem 1.4rem", background: "var(--surface)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>
                Comparison focus
                {focusAreas.length === 0 && <span style={{ marginLeft: 8, fontWeight: 500, letterSpacing: 0, textTransform: "none", fontSize: 11 }}>— all clauses (select to narrow)</span>}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FOCUS_OPTIONS.map(opt => {
                  const active = focusAreas.includes(opt)
                  return (
                    <button key={opt} onClick={() => toggleFocus(opt)} style={{
                      padding: "5px 14px", borderRadius: 20, cursor: "pointer",
                      fontSize: 13, fontWeight: active ? 600 : 400,
                      border: active ? "none" : "1px solid var(--border)",
                      background: active ? "var(--w-navy)" : "var(--surface)",
                      color: active ? "#fff" : "var(--text-secondary)",
                      transition: "all .15s",
                    }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = "var(--w-navy)"; e.currentTarget.style.color = "var(--w-navy)" } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)" } }}
                    >{opt}</button>
                  )
                })}
              </div>
              {focusAreas.length > 0 && (
                <button onClick={() => setFocusAreas([])} style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--muted)", padding: 0 }}>
                  Clear selection
                </button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="fade-up-2">
              <UploadCard label={`${nameA} Contract`} accentColor="#3949ab" file={fileA}
                onFile={f => { setFileA(f); setNameA(nameFromFile(f.name)) }}
                onDropDoc={doc => { setFileA({ name: doc.name, size: doc.size, _s3Key: doc.s3Key }); setNameA(nameFromFile(doc.name)) }} />
              <UploadCard label={`${nameB} Contract`} accentColor="#2e7d32" file={fileB}
                onFile={f => { setFileB(f); setNameB(nameFromFile(f.name)) }}
                onDropDoc={doc => { setFileB({ name: doc.name, size: doc.size, _s3Key: doc.s3Key }); setNameB(nameFromFile(doc.name)) }} />
            </div>

            <div style={{ display: "flex", gap: 12 }} className="fade-up-2">
              <button className="btn-primary" onClick={handleSubmit} disabled={!fileA || !fileB}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                Compare Contracts
              </button>
              {(fileA || fileB) && <button className="btn-ghost" onClick={() => { setFileA(null); setFileB(null) }}>Clear</button>}
            </div>

            {error && <div style={{ padding: "12px 16px", background: "var(--red-bg)", border: "1px solid rgba(197,48,48,.2)", borderRadius: "var(--radius-sm)", color: "var(--red)", fontSize: 13 }}>⚠️ {error}</div>}
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
              <p style={{ fontWeight: 700, color: "var(--w-navy)", fontSize: 16, marginBottom: 6 }}>Claude is comparing your contracts</p>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>{nameA} vs {nameB}</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["Parsing documents", "Comparing clauses", "Scoring terms"].map((step, i) => (
                <span key={step} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)", fontWeight: 500, animation: `pulse 1.5s ${i * .3}s ease-in-out infinite` }}>{step}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ─────────────────────────────────────────────────────── */}
        {phase === "results" && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* Top nav bar */}
            <div className="fade-up" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, padding: 0, fontWeight: 500 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                New comparison
              </button>
              <span style={{ color: "var(--border-light)", fontSize: 16, userSelect: "none" }}>|</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Analysed just now · Vendor comparison</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <button className="btn-ghost" onClick={() => {
                  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "comparison.json"; a.click()
                }} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Export report
                </button>
                <button className="btn-primary" onClick={() => setLetterModal(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  Draft negotiation letter
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </button>
              </div>
            </div>

            {/* H1 */}
            <div className="fade-up">
              <h1 style={{ fontSize: 30, fontWeight: 800, color: "var(--w-navy)", letterSpacing: "-.03em", lineHeight: 1.15 }}>
                {nameA} <span style={{ color: "var(--muted)", fontWeight: 300, fontSize: 24 }}>vs</span> {nameB}
              </h1>
            </div>

            {/* 4 stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 14 }} className="fade-up-2">
              <div style={{ background: "linear-gradient(135deg, #e8eef8 0%, #dce7f5 100%)", borderRadius: "var(--radius-lg)", padding: "1.25rem 1.5rem", border: "1px solid rgba(0,99,190,.15)", boxShadow: "0 2px 12px rgba(0,99,190,.07)" }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--w-blue)", textTransform: "uppercase", marginBottom: 10 }}>RECOMMENDED</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: "var(--w-navy)", marginBottom: 5, letterSpacing: "-.02em" }}>{recommended}</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Stronger on {Math.max(winsA, winsB)} of {result.clauses.length} clause{result.clauses.length !== 1 ? "s" : ""}
                </p>
              </div>

              {[
                { label: `${nameA} WINS`, count: winsA, color: "#283593", sub: "clauses favour Waters more" },
                { label: `${nameB} WINS`, count: winsB, color: "#1b5e20", sub: "clauses favour Waters more" },
                { label: "EQUAL",         count: winsEqual, color: "var(--text)", sub: "clauses are comparable" },
              ].map(({ label, count, color, sub }) => (
                <div key={label} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: "1.25rem 1.5rem", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-xs)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>{label}</p>
                  <p style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }}>{count}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</p>
                </div>
              ))}
            </div>

            {/* Two-column: priorities + assessment */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="fade-up-2">

              {/* Negotiation priorities */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", padding: "1.5rem", boxShadow: "var(--shadow-xs)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 18 }}>TOP NEGOTIATION PRIORITIES</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {result.top_negotiation_priorities.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: "#ef4444",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0, marginTop: 1,
                      }}>{i + 1}</span>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65 }}>
                        <strong style={{ color: "var(--w-navy)" }}>{p.split(":")[0]}</strong>
                        {p.includes(":") ? ":" + p.split(":").slice(1).join(":") : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Overall assessment */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", padding: "1.5rem", boxShadow: "var(--shadow-xs)", display: "flex", flexDirection: "column" }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>CLAUDE'S OVERALL ASSESSMENT</p>
                <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.8, flex: 1 }}>{result.overall_recommendation}</p>
                <button
                  onClick={() => setChatPreFill("Compare the overall risk profiles of both contracts and explain which poses less long-term risk for Waters Corporation, referencing specific clauses.")}
                  style={{ marginTop: 18, background: "none", border: "none", cursor: "pointer", color: "var(--w-teal)", fontSize: 13, fontWeight: 600, padding: 0, textAlign: "left", display: "flex", alignItems: "center", gap: 5 }}
                >
                  Get deeper analysis
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </button>
              </div>
            </div>

            {/* Clause by clause */}
            <div className="fade-up" style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>

              {/* Section header + filter tabs */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--w-navy)" }}>Clause by clause</span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                  {[
                    { key: "all",   label: "All",             count: result.clauses.length },
                    { key: nameA,   label: `${nameA} wins`,   count: winsA },
                    { key: nameB,   label: `${nameB} wins`,   count: winsB },
                    { key: "Equal", label: "Equal",           count: winsEqual },
                  ].map(tab => {
                    const active = clauseWinnerFilter === tab.key
                    return (
                      <button key={tab.key} onClick={() => setClauseWinnerFilter(tab.key)} style={{
                        padding: "5px 12px", borderRadius: 20, cursor: "pointer",
                        fontSize: 12, fontWeight: 600,
                        border: `1px solid ${active ? "var(--w-navy)" : "var(--border-light)"}`,
                        background: active ? "var(--w-navy)" : "transparent",
                        color: active ? "#fff" : "var(--text-secondary)",
                        transition: "all .15s",
                      }}>
                        {tab.label} <span style={{ opacity: .7 }}>({tab.count})</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Table column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 36px 1fr 130px", background: "var(--bg)", borderBottom: "1px solid var(--border-light)" }}>
                {[
                  { label: "CLAUSE", style: {} },
                  { label: nameA.toUpperCase(), style: { color: "#283593" } },
                  { label: "", style: {} },
                  { label: nameB.toUpperCase(), style: { color: "#1b5e20" } },
                  { label: "RESULT", style: { textAlign: "center" } },
                ].map((col, i) => (
                  <div key={i} style={{
                    padding: "9px 16px", fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
                    color: col.style.color || "var(--muted)",
                    borderRight: i < 4 ? "1px solid var(--border-light)" : "none",
                    ...col.style,
                  }}>
                    {col.label}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {filteredClauses.length > 0
                ? filteredClauses.map((c, i) => <ClauseTableRow key={i} clause={c} nameA={nameA} nameB={nameB} />)
                : <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No clauses match this filter.</div>
              }
            </div>

          </div>
        )}

      </div>
    </>
  )
}
