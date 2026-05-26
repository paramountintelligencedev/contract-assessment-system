/**
 * DocumentLibrary — left sidebar panel
 *
 * New features:
 *  - Search bar: filters the S3 file list by name in real time
 *  - Drag from panel: each doc row is draggable (HTML5 drag API)
 *    → drop onto Validator upload zone  → pre-fills as the contract
 *    → drop onto Comparison slot A or B → pre-fills that slot
 *  - Click to select (existing behaviour kept)
 *  - Upload new files via drop zone or click
 *  - Delete from S3
 *  - Collapse to icon rail
 */
import { useState, useRef, useCallback, useEffect } from "react"
import axios from "axios"
import { API as API_BASE } from "../api"

const API = `${API_BASE}/api`

const EXT_META = {
  pdf:  { color: "#c53030", bg: "#fff5f5", label: "PDF"  },
  docx: { color: "#003087", bg: "#e8eef8", label: "DOCX" },
  doc:  { color: "#003087", bg: "#e8eef8", label: "DOC"  },
  txt:  { color: "#00875a", bg: "#e3fcef", label: "TXT"  },
}

function extOf(name) { return (name || "").split(".").pop().toLowerCase() }

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ ext, size = 32 }) {
  const m = EXT_META[ext] || { color: "var(--muted)", bg: "var(--bg)", label: (ext || "?").toUpperCase().slice(0, 4) }
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: m.bg, border: `1px solid ${m.color}22`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.28, fontWeight: 800, color: m.color, letterSpacing: "-.02em" }}>
        {m.label}
      </span>
    </div>
  )
}

function ProgressBar({ pct }) {
  return (
    <div style={{ height: 3, background: "var(--border-light)", borderRadius: 2, overflow: "hidden", marginTop: 5 }}>
      <div style={{
        height: "100%", borderRadius: 2,
        background: "linear-gradient(90deg, var(--w-teal), var(--w-blue))",
        width: `${pct}%`, transition: "width .2s",
      }} />
    </div>
  )
}

// ── Drag ghost label shown while dragging ─────────────────────────────────────
function setDragImage(e, name) {
  const ghost = document.createElement("div")
  ghost.textContent = `📄 ${name}`
  ghost.style.cssText = [
    "position:fixed", "top:-999px", "left:-999px",
    "background:#003087", "color:#fff",
    "padding:6px 14px", "border-radius:8px",
    "font:600 12px/1 Inter,sans-serif",
    "white-space:nowrap", "pointer-events:none",
    "box-shadow:0 4px 16px rgba(0,48,135,.4)",
  ].join(";")
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, 0, 0)
  setTimeout(() => document.body.removeChild(ghost), 0)
}

export default function DocumentLibrary({ onSelect, selectedFile }) {
  const [docs, setDocs]         = useState([])
  const [draggingIn, setDraggingIn] = useState(false)   // file dragged INTO the panel
  const [uploads, setUploads]   = useState({})
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch]     = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const inputRef    = useRef()
  const dragCounter = useRef(0)

  // ── Load docs from S3 ────────────────────────────────────────────────────
  const loadDocs = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const r = await axios.get(`${API}/documents`)
      setDocs(r.data?.documents || [])
    } catch {}
    setRefreshing(false)
  }, [])

  useEffect(() => { loadDocs(true) }, [loadDocs])

  // ── Upload a file to S3 ──────────────────────────────────────────────────
  const uploadFile = useCallback(async (file) => {
    const id  = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const ext = extOf(file.name)
    setDocs(prev => [{ id, name: file.name, size: file.size, date: new Date().toISOString(), ext, file, uploading: true }, ...prev])
    setUploads(prev => ({ ...prev, [id]: { pct: 0 } }))

    try {
      const { data } = await axios.post(`${API}/upload/presign`, {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
      })
      await axios.put(data.upload_url, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
        onUploadProgress: e => {
          const pct = Math.round((e.loaded / e.total) * 100)
          setUploads(prev => ({ ...prev, [id]: { pct } }))
        },
      })
      setDocs(prev => prev.map(d => d.id === id ? { ...d, uploading: false, s3Key: data.s3_key } : d))
    } catch {
      setDocs(prev => prev.map(d => d.id === id ? { ...d, uploading: false, localOnly: true } : d))
    }
    setUploads(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [])

  const handleFiles = useCallback((fileList) => {
    const allowed = ["pdf", "docx", "doc", "txt"]
    Array.from(fileList).forEach(f => { if (allowed.includes(extOf(f.name))) uploadFile(f) })
  }, [uploadFile])

  // ── Panel drop zone (uploading new files) ────────────────────────────────
  const onDragEnter = e => { e.preventDefault(); dragCounter.current++; setDraggingIn(true) }
  const onDragLeave = e => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDraggingIn(false) }
  const onDragOver  = e => { e.preventDefault() }
  const onDrop      = e => {
    e.preventDefault(); dragCounter.current = 0; setDraggingIn(false)
    handleFiles(e.dataTransfer.files)
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteDoc = async doc => {
    if (doc.s3Key) {
      try { await axios.delete(`${API}/documents/${encodeURIComponent(doc.s3Key)}`) } catch {}
    }
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    if (selectedFile?.id === doc.id) onSelect(null)
  }

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = search.trim()
    ? docs.filter(d => d.name.toLowerCase().includes(search.trim().toLowerCase()))
    : docs

  const PANEL_W = collapsed ? 52 : 290

  return (
    <div style={{
      width: PANEL_W, flexShrink: 0,
      height: "calc(100vh - 71px)",
      position: "sticky", top: 71,
      display: "flex", flexDirection: "column",
      background: "var(--surface)",
      borderRight: "1px solid var(--border-light)",
      boxShadow: "2px 0 16px rgba(0,48,135,.06)",
      transition: "width .25s cubic-bezier(.22,1,.36,1)",
      overflow: "hidden",
      zIndex: 40,
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: collapsed ? "16px 10px" : "12px 14px",
        borderBottom: "1px solid var(--border-light)",
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        background: "linear-gradient(135deg, var(--w-navy-dark), var(--w-navy))",
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: "linear-gradient(135deg, var(--w-teal), var(--w-blue))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Documents</p>
              <p style={{ color: "rgba(255,255,255,.4)", fontSize: 10, marginTop: 1 }}>
                {docs.length} file{docs.length !== 1 ? "s" : ""} · S3
              </p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Refresh */}
          {!collapsed && (
            <button onClick={() => loadDocs()} title="Refresh from S3"
              style={{ background: "rgba(255,255,255,.1)", border: "none", cursor: "pointer", width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.7)" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.2)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.1)"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: refreshing ? "spin .8s linear infinite" : "none" }}>
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
              </svg>
            </button>
          )}
          {/* Collapse */}
          <button onClick={() => setCollapsed(c => !c)} title={collapsed ? "Expand" : "Collapse"}
            style={{ background: "rgba(255,255,255,.1)", border: "none", cursor: "pointer", width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.7)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.1)"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
            </svg>
          </button>
        </div>
      </div>

      {/* ── Collapsed: icon rail ── */}
      {collapsed && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: 10, overflowY: "auto" }}>
          <button onClick={() => { setCollapsed(false); setTimeout(() => inputRef.current?.click(), 300) }}
            title="Upload" style={{ width: 34, height: 34, borderRadius: 8, background: "var(--bg)", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--w-teal)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          {docs.slice(0, 10).map(doc => (
            <button key={doc.id} onClick={() => { setCollapsed(false); onSelect(doc) }} title={doc.name}
              style={{ width: 34, height: 34, borderRadius: 8, background: selectedFile?.id === doc.id ? "var(--w-teal-light)" : "var(--bg)", border: `1.5px solid ${selectedFile?.id === doc.id ? "var(--w-teal)" : "var(--border-light)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <FileIcon ext={extOf(doc.name)} size={20} />
            </button>
          ))}
        </div>
      )}

      {/* ── Expanded ── */}
      {!collapsed && (
        <>
          {/* ── Search bar ── */}
          <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search documents…"
                style={{
                  width: "100%", padding: "7px 28px 7px 28px",
                  border: "1.5px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12, color: "var(--text)",
                  background: "var(--bg)", outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color .15s",
                }}
                onFocus={e => e.target.style.borderColor = "var(--w-teal)"}
                onBlur={e  => e.target.style.borderColor = "var(--border)"}
              />
              {search && (
                <button onClick={() => setSearch("")}
                  style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 2, lineHeight: 1 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* ── Upload drop zone ── */}
          <div
            onDragEnter={onDragEnter} onDragLeave={onDragLeave}
            onDragOver={onDragOver}  onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              margin: "10px 12px 0",
              border: `2px dashed ${draggingIn ? "var(--w-teal)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              padding: "14px 10px",
              textAlign: "center", cursor: "pointer",
              background: draggingIn ? "rgba(0,178,202,.06)" : "var(--bg)",
              transition: "all .2s", flexShrink: 0,
            }}
          >
            <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.txt" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
            <div style={{ width: 30, height: 30, borderRadius: 8, background: draggingIn ? "var(--w-teal)" : "var(--surface)", border: `1.5px solid ${draggingIn ? "var(--w-teal)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", transition: "all .2s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={draggingIn ? "#fff" : "var(--w-teal)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: draggingIn ? "var(--w-teal)" : "var(--w-navy)", marginBottom: 2 }}>
              {draggingIn ? "Drop to upload" : "Drop files here"}
            </p>
            <p style={{ fontSize: 10, color: "var(--muted)" }}>or click · PDF, DOCX, TXT</p>
          </div>

          {/* S3 badge + drag hint */}
          <div style={{ margin: "7px 12px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)" }} />
              <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 500 }}>S3 · AES-256</span>
            </div>
            <span style={{ fontSize: 9, color: "var(--muted)", fontStyle: "italic" }}>
              Drag a file to the centre →
            </span>
          </div>

          {/* ── Document list ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0 12px" }}>

            {/* Search result count */}
            {search && (
              <p style={{ fontSize: 10, color: "var(--muted)", padding: "4px 14px 6px", fontWeight: 500 }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "{search}"
              </p>
            )}

            {filtered.length === 0 && !search && (
              <div style={{ padding: "28px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 28, opacity: .2, marginBottom: 8 }}>📁</div>
                <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                  No documents yet.<br />Upload a contract to get started.
                </p>
              </div>
            )}

            {filtered.length === 0 && search && (
              <div style={{ padding: "20px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>No files match "{search}"</p>
              </div>
            )}

            {filtered.map(doc => {
              const ext        = extOf(doc.name)
              const isSelected = selectedFile?.id === doc.id
              const uploadState = uploads[doc.id]

              return (
                <div
                  key={doc.id}
                  /* ── Click to select ── */
                  onClick={() => !doc.uploading && onSelect(isSelected ? null : doc)}
                  /* ── Drag from panel to centre ── */
                  draggable={!doc.uploading}
                  onDragStart={e => {
                    // Store doc data in dataTransfer so drop targets can read it
                    e.dataTransfer.effectAllowed = "copy"
                    e.dataTransfer.setData("application/x-waters-doc", JSON.stringify({
                      id: doc.id, name: doc.name, size: doc.size,
                      s3Key: doc.s3Key || null, localOnly: doc.localOnly || false,
                    }))
                    setDragImage(e, doc.name)
                    // Also select it so pages know which doc is active
                    onSelect(doc)
                  }}
                  style={{
                    margin: "0 8px 2px",
                    padding: "9px 10px",
                    borderRadius: "var(--radius-sm)",
                    cursor: doc.uploading ? "default" : "grab",
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(0,48,135,.08), rgba(0,178,202,.06))"
                      : "transparent",
                    border: `1px solid ${isSelected ? "rgba(0,178,202,.3)" : "transparent"}`,
                    transition: "all .15s",
                    position: "relative",
                    userSelect: "none",
                  }}
                  onMouseEnter={e => { if (!isSelected && !doc.uploading) e.currentTarget.style.background = "var(--bg)" }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>

                    {/* Drag handle */}
                    {!doc.uploading && (
                      <div style={{ color: "var(--border)", paddingTop: 8, flexShrink: 0, cursor: "grab" }}>
                        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                          <circle cx="3" cy="2"  r="1.2"/><circle cx="7" cy="2"  r="1.2"/>
                          <circle cx="3" cy="7"  r="1.2"/><circle cx="7" cy="7"  r="1.2"/>
                          <circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>
                        </svg>
                      </div>
                    )}

                    <FileIcon ext={ext} size={30} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 11.5, fontWeight: 600,
                        color: isSelected ? "var(--w-navy)" : "var(--text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        lineHeight: 1.3, marginBottom: 3,
                      }} title={doc.name}>{doc.name}</p>

                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        {doc.uploading ? (
                          <span style={{ fontSize: 10, color: "var(--w-teal)", fontWeight: 500 }}>
                            Uploading{uploadState ? ` ${uploadState.pct}%` : "…"}
                          </span>
                        ) : (
                          <>
                            <span style={{ fontSize: 10, color: "var(--muted)" }}>{fmtSize(doc.size)}</span>
                            {doc.localOnly && <span style={{ fontSize: 9, color: "#c05621", fontWeight: 600, background: "#fffaf0", padding: "1px 5px", borderRadius: 4 }}>LOCAL</span>}
                            {doc.s3Key    && <span style={{ fontSize: 9, color: "var(--green)", fontWeight: 600, background: "var(--green-bg)", padding: "1px 5px", borderRadius: 4 }}>S3</span>}
                          </>
                        )}
                      </div>

                      {doc.uploading && uploadState && <ProgressBar pct={uploadState.pct} />}
                    </div>

                    {/* Delete */}
                    {!doc.uploading && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteDoc(doc) }}
                        title="Remove"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 3, borderRadius: 4, opacity: 0, transition: "opacity .15s", flexShrink: 0 }}
                        className="doc-delete-btn"
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.opacity = 1 }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.opacity = 0 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Selected indicator bar */}
                  {isSelected && (
                    <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: "60%", borderRadius: "0 2px 2px 0", background: "var(--w-teal)" }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {docs.filter(d => d.s3Key).length} in S3
            </span>
            <button onClick={() => inputRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--w-navy)", cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--w-teal)"; e.currentTarget.style.color = "var(--w-teal)" }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--w-navy)" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add more
            </button>
          </div>
        </>
      )}
    </div>
  )
}
