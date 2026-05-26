import { useState } from "react"
import Validator from "./pages/Validator"
import Comparison from "./pages/Comparison"
import DocumentLibrary from "./components/DocumentLibrary"

const HEADER_H = 71  // 3px teal bar + 68px header

export default function App() {
  const [tab, setTab]               = useState("validator")
  const [selectedDoc, setSelectedDoc] = useState(null)  // doc from DocumentLibrary

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* ── Top accent bar ── */}
      <div style={{ height: 3, background: "linear-gradient(90deg, var(--w-teal) 0%, var(--w-cyan) 50%, var(--w-blue) 100%)" }} />

      {/* ── Header ── */}
      <header style={{
        background: "linear-gradient(135deg, var(--w-navy-deep) 0%, var(--w-navy-dark) 50%, var(--w-navy) 100%)",
        boxShadow: "0 4px 24px rgba(0,13,46,.4), 0 1px 0 rgba(0,178,202,.3)",
        position: "sticky", top: 3, zIndex: 100,
        height: 68,
      }}>
        <div style={{
          maxWidth: "100%", margin: "0 auto", padding: "0 2rem",
          display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%",
        }}>

          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: "linear-gradient(135deg, var(--w-teal) 0%, var(--w-blue) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,178,202,.4), inset 0 1px 0 rgba(255,255,255,.2)",
              flexShrink: 0,
            }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 20, fontFamily: "Georgia, serif", letterSpacing: "-1px" }}>W</span>
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", lineHeight: 1.2 }}>
                Waters <span style={{ color: "var(--w-teal)", fontWeight: 300 }}>|</span> Contract Intelligence
              </div>
              <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 2 }}>
                AI-powered contract review
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          <nav style={{ display: "flex", height: "100%", alignItems: "stretch", gap: 2 }}>
            {[
              { key: "validator",  label: "Proposal Validator" },
              { key: "comparison", label: "Contract Comparison" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  background: "none", border: "none",
                  borderBottom: tab === key ? "3px solid var(--w-teal)" : "3px solid transparent",
                  color: tab === key ? "#fff" : "rgba(255,255,255,.5)",
                  fontSize: 13, fontWeight: tab === key ? 600 : 400,
                  letterSpacing: ".02em", cursor: "pointer",
                  padding: "0 22px", marginBottom: -3,
                  transition: "all .15s", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (tab !== key) e.target.style.color = "rgba(255,255,255,.8)" }}
                onMouseLeave={e => { if (tab !== key) e.target.style.color = "rgba(255,255,255,.5)" }}
              >{label}</button>
            ))}
          </nav>

          {/* S3 status pill */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--w-teal)", boxShadow: "0 0 6px var(--w-teal)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)", fontWeight: 500 }}>S3 · us-east-1</span>
          </div>
        </div>
      </header>

      {/* ── Body: left panel + main content ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", overflow: "hidden" }}>

        {/* Left panel — Document Library */}
        <DocumentLibrary
          onSelect={setSelectedDoc}
          selectedFile={selectedDoc}
        />

        {/* Main content area */}
        <main style={{ flex: 1, overflowY: "auto", padding: "2.5rem", minWidth: 0 }}>
          {tab === "validator"  && (
            <Validator preloadedDoc={selectedDoc} />
          )}
          {tab === "comparison" && (
            <Comparison preloadedDoc={selectedDoc} />
          )}
        </main>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: "1px solid var(--border-light)",
        background: "var(--surface)",
        padding: "1rem 2rem",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        zIndex: 10,
      }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>© 2025 Waters Corporation · Internal Tool · Confidential</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Powered by <span style={{ color: "var(--w-teal)", fontWeight: 600 }}>Claude</span></span>
      </footer>
    </div>
  )
}
