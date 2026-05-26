import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const API = `${import.meta.env.VITE_API_URL ?? ""}/api`

const DEFAULT_SUGGESTIONS = [
  "What is the liability cap?",
  "Any auto-renewal risks?",
  "Who owns the IP?",
  "Summarise payment terms",
]

export default function Chat({ contractText, contractName, suggestions, height = 520, preFill }) {
  const pills = suggestions?.length ? suggestions : DEFAULT_SUGGESTIONS
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState("")
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (preFill) setInput(preFill)
  }, [preFill])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function send() {
    const q = input.trim()
    if (!q || streaming) return
    setInput("")

    const historyBeforeThisTurn = [...messages]
    const withUser = [...messages, { role: "user", content: q }]
    // Append empty assistant placeholder immediately
    setMessages([...withUser, { role: "assistant", content: "" }])
    setStreaming(true)

    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question:      q,
          contract_text: contractText,
          history:       historyBeforeThisTurn,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer      = ""
      let accumulated = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n")
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.text) {
              accumulated += parsed.text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: "assistant", content: accumulated }
                return updated
              })
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.startsWith("JSON")) throw parseErr
          }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${e.message}` }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: "var(--surface)",
      border: "1px solid var(--border-light)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      overflow: "hidden",
      height,
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, var(--w-navy-dark) 0%, var(--w-navy) 100%)",
        padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 2px 8px rgba(0,13,46,.3)",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: "linear-gradient(135deg, var(--w-teal), var(--w-blue))",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0,178,202,.4)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 16 }}>💬</span>
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>Ask Claude</div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 11, marginTop: 2 }}>
            {contractName ? `Analysing: ${contractName}` : "Contract Q&A"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--w-teal)", boxShadow: "0 0 6px var(--w-teal)" }} />
          <span style={{ color: "rgba(255,255,255,.45)", fontSize: 11 }}>Ready</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "20px 20px 12px",
        display: "flex", flexDirection: "column", gap: 14,
        background: "linear-gradient(180deg, #f8fafd 0%, #fff 100%)",
      }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ fontSize: 32, opacity: .35 }}>📋</div>
            <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
              Ask anything about this contract — clauses, obligations, risks, or specific terms.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
              {pills.map(s => (
                <button key={s} onClick={() => setInput(s)} style={{
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: 20, padding: "5px 14px",
                  fontSize: 12, color: "var(--w-navy)", cursor: "pointer",
                  transition: "all .15s",
                }}
                  onMouseEnter={e => { e.target.style.borderColor = "var(--w-teal)"; e.target.style.color = "var(--w-teal)" }}
                  onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--w-navy)" }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isWaiting = streaming && i === messages.length - 1 && m.role === "assistant" && m.content === ""
          return (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", animation: "fadeUp .25s both" }}>
              {m.role === "assistant" && (
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: "linear-gradient(135deg, var(--w-teal), var(--w-blue))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, marginRight: 8, flexShrink: 0, marginTop: 2,
                  boxShadow: "0 2px 6px rgba(0,178,202,.3)",
                }}>W</div>
              )}
              {isWaiting ? (
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--border-light)",
                  borderRadius: "18px 18px 18px 4px", padding: "12px 16px",
                  display: "flex", gap: 5, alignItems: "center",
                  boxShadow: "var(--shadow-sm)",
                }}>
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              ) : (
                <div
                  className={m.role === "user" ? "bubble-user" : "bubble-ai"}
                  style={m.role === "user" ? { whiteSpace: "pre-wrap" } : {}}
                >
                  {m.role === "assistant"
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    : m.content
                  }
                </div>
              )}
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border-light)",
        background: "var(--surface)",
        display: "flex", gap: 10, alignItems: "flex-end",
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask about this contract… (Enter to send)"
          rows={1}
          style={{
            flex: 1, resize: "none",
            padding: "10px 14px",
            border: "1.5px solid var(--border)",
            borderRadius: 10,
            fontSize: 13.5, lineHeight: 1.5,
            color: "var(--text)",
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color .15s, box-shadow .15s",
            maxHeight: 100, overflowY: "auto",
          }}
          onFocus={e => { e.target.style.borderColor = "var(--w-teal)"; e.target.style.boxShadow = "0 0 0 3px rgba(0,178,202,.12)" }}
          onBlur={e  => { e.target.style.borderColor = "var(--border)";  e.target.style.boxShadow = "none" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || streaming}
          className="btn-primary"
          style={{ padding: "10px 18px", flexShrink: 0 }}
        >
          {streaming
            ? <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          }
        </button>
      </div>
    </div>
  )
}
