import { useEffect, useRef, useState } from "react";
import { X, Send, Home } from "lucide-react";
import { sendChat, type ChatMessage } from "../lib/ai";
import { useAuth } from "../auth/AuthContext";
import { checkAndUseCredit } from "../lib/credits";
import { supabase } from "../lib/supabase";
import LogoMark from "./LogoMark";

const SUGGESTIONS = [
  "How do I create a decision?",
  "How does the approval flow work?",
  "What do the AI ratings mean?",
  "How are conflicts handled?"
];

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your Chroma Sync assistant. I can guide you through creating decisions, the approval flow, AI ratings, conflicts and reports. What would you like to do?"
};

export default function ChatAssistant() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  
  const goHome = () => {
    setMessages([GREETING]);
  };
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [criticalContext, setCriticalContext] = useState("");

  useEffect(() => {
    async function loadCriticalContext() {
      const { data } = await supabase
        .from("decisions")
        .select("id, component_name, ai_rating, status")
        .eq("ai_rating", "red")
        .limit(3);
      
      if (data && data.length > 0) {
        const desc = data.map(d => `- [${d.id.slice(0,6)}] ${d.component_name} (Status: ${d.status})`).join("\n");
        setCriticalContext(`\nTop Critical Decisions (AI Rating Red):\n${desc}`);
      }
    }
    loadCriticalContext();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    // Check credits
    const { allowed } = await checkAndUseCredit("ask_ai");
    if (!allowed) {
      setMessages((m) => [...m, { role: "assistant", content: "You have exhausted your 5 Ask AI credits for today." }]);
      return;
    }

    const next = [...messages, { role: "user", content: question } as ChatMessage];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const reply = await sendChat(next, {
        userTeam: profile?.team ?? null,
        isProjectLead: profile?.is_project_lead ?? false,
        context: window.location.pathname + criticalContext
      });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "I couldn't reach the assistant. Please check the AI service is running and try again."
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Chroma Sync assistant"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 900,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 18px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "linear-gradient(135deg, var(--accent), #6b46f5)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: "0 12px 34px -12px rgba(59,130,246,0.6)"
          }}
        >
          <LogoMark size={18} />
          Ask AI
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Chroma Sync assistant"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 900,
            width: "min(380px, calc(100vw - 32px))",
            height: "min(560px, calc(100vh - 48px))",
            display: "flex",
            flexDirection: "column",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "0 28px 80px -28px rgba(0,0,0,0.7)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              background: "linear-gradient(135deg, var(--accent), #6b46f5)",
              color: "#fff"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.18)",
                  display: "grid",
                  placeItems: "center"
                }}
              >
                <LogoMark size={16} />
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.1 }}>Chroma Sync Assistant</div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Guides you · never acts for you</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setMessages([GREETING])}
                aria-label="Go Home"
                title="Reset Chat"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  color: "#fff",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center"
                }}
              >
                <Home size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  color: "#fff",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center"
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    fontSize: 13,
                    lineHeight: 1.5,
                    background: m.role === "user" ? "var(--accent)" : "var(--surface-2)",
                    color: m.role === "user" ? "#fff" : "var(--text)",
                    border: m.role === "user" ? "none" : "1px solid var(--border)",
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {m.content}
                </div>
                {m.role === "assistant" && i > 0 && i === messages.length - 1 && (
                  <button
                    type="button"
                    onClick={goHome}
                    style={{
                      alignSelf: "flex-start",
                      padding: "6px 12px",
                      borderRadius: 16,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text-1)",
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <Home size={12} /> Go Home
                  </button>
                )}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--text-2)" }}>Thinking…</div>
            )}

            {messages.length === 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      color: "var(--text-2)",
                      fontSize: 12,
                      cursor: "pointer"
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            style={{
              display: "flex",
              gap: 8,
              padding: 12,
              borderTop: "1px solid var(--border)",
              background: "var(--surface)"
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Chroma Sync…"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 13,
                outline: "none"
              }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              style={{
                width: 42,
                borderRadius: 10,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: busy || !input.trim() ? "default" : "pointer",
                opacity: busy || !input.trim() ? 0.6 : 1,
                display: "grid",
                placeItems: "center"
              }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
