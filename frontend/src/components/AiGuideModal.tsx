// import { useState, useEffect, useRef } from "react";
// import { Eye, BrainCircuit, ArrowLeft, Send, Loader2, Home } from "lucide-react";
// import ReactMarkdown from "react-markdown";
// import { useAuth } from "../auth/AuthContext";
// import LogoMark from "./LogoMark";
// import { checkAndUseCredit } from "../lib/credits";
// import { supabase } from "../lib/supabase";

// interface AiGuideModalProps {
//   isOpen: boolean;
//   onClose: () => void;
// }

// interface ChatMessage {
//   role: "user" | "assistant";
//   content: string;
// }

// export default function AiGuideModal({ isOpen, onClose }: AiGuideModalProps) {
//   const { profile } = useAuth();
//   const [messages, setMessages] = useState<ChatMessage[]>([]);
//   const [input, setInput] = useState("");
//   const [loading, setLoading] = useState(false);
//   const messagesEndRef = useRef<HTMLDivElement>(null);
//   const [criticalContext, setCriticalContext] = useState<string>("");

//   // Initialize from sessionStorage on mount and fetch context
//   useEffect(() => {
//     const saved = sessionStorage.getItem("chroma-chat-history");
//     if (saved) {
//       try {
//         setMessages(JSON.parse(saved));
//       } catch (e) {
//         setMessages([]);
//       }
//     } else {
//       setMessages([{ role: "assistant", content: "Hi! I'm the Chroma Sync assistant. Ask me how to create, review, or approve a decision, or ask me about the current page you are on." }]);
//     }

//     // Load top critical decisions silently for context
//     async function loadCriticalContext() {
//       const { data } = await supabase
//         .from("decisions")
//         .select("id, component_name, ai_rating, status")
//         .eq("ai_rating", "red")
//         .limit(3);
      
//       if (data && data.length > 0) {
//         const desc = data.map(d => `- [${d.id.slice(0,6)}] ${d.component_name} (Status: ${d.status})`).join("\n");
//         setCriticalContext(`\nTop Critical Decisions (AI Rating Red):\n${desc}`);
//       }
//     }
//     loadCriticalContext();
//   }, []);

//   // Save to sessionStorage when messages change
//   useEffect(() => {
//     if (messages.length > 0) {
//       sessionStorage.setItem("chroma-chat-history", JSON.stringify(messages));
//     }
//   }, [messages]);

//   // Auto-scroll to bottom
//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
//   }, [messages]);

//   async function handleSend() {
//     if (!input.trim() || loading) return;
    
//     // Check credits before sending
//     const { allowed } = await checkAndUseCredit("ask_ai");
//     if (!allowed) {
//       setMessages(prev => [...prev, { role: "assistant", content: "You have exhausted your 5 Ask AI credits for today." }]);
//       return;
//     }

//     const userMsg = input.trim();
//     setInput("");
    
//     const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }];
//     setMessages(newMessages);
//     setLoading(true);

//     try {
//       const res = await fetch(`${import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8000"}/chat`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           messages: newMessages,
//           user_team: profile?.team || null,
//           is_project_lead: profile?.is_project_lead || false,
//           context: window.location.pathname + criticalContext // Provide page context + DB context
//         })
//       });

//       if (!res.ok) throw new Error("Failed to fetch response");
      
//       const data = await res.json();
//       setMessages([...newMessages, { role: "assistant", content: data.reply }]);
//     } catch (e) {
//       console.error(e);
//       setMessages([...newMessages, { role: "assistant", content: "I'm having trouble connecting right now. Please try again later." }]);
//     } finally {
//       setLoading(false);
//     }
//   }

//   function handleGoHome() {
//     const initialMsg = [{ role: "assistant", content: "Hi! I'm the Chroma Sync assistant. Ask me how to create, review, or approve a decision, or ask me about the current page you are on." }] as ChatMessage[];
//     setMessages(initialMsg);
//     sessionStorage.setItem("chroma-chat-history", JSON.stringify(initialMsg));
//   }

//   if (!isOpen) return null;

//   return (
//     <div className="cs-guide-modal cs-guide-modal-ai" style={{
//       position: "fixed",
//       top: 0, left: 0, right: 0, bottom: 0,
//       background: "rgba(0, 0, 0, 0.8)",
//       backdropFilter: "blur(12px)",
//       display: "flex",
//       alignItems: "center",
//       justifyContent: "center",
//       zIndex: 9999,
//       padding: "1rem"
//     }}>
//       <div className="cs-guide-modal-panel" style={{
//         background: "var(--bg-1)",
//         border: "1px solid rgba(99, 102, 241, 0.4)",
//         borderRadius: "var(--r-xl)",
//         width: "100%",
//         maxWidth: "760px",
//         height: "85vh",
//         display: "flex",
//         flexDirection: "column",
//         boxShadow: "0 0 80px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
//         overflow: "hidden"
//       }}>
//         {/* Header - CCTV Theme */}
//         <div className="cs-guide-modal-header" style={{
//           padding: "1.25rem 1.5rem",
//           borderBottom: "1px solid var(--border)",
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "space-between",
//           background: "linear-gradient(90deg, rgba(15, 23, 42, 1) 0%, rgba(30, 27, 75, 1) 100%)",
//         }}>
//           <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
//             <div style={{
//               width: 36, height: 36, borderRadius: "50%",
//               background: "rgba(99, 102, 241, 0.1)",
//               border: "1px solid rgba(99, 102, 241, 0.3)",
//               display: "flex", alignItems: "center", justifyContent: "center",
//               color: "var(--accent)"
//             }}>
//               <LogoMark size={20} />
//             </div>
//             <div>
//               <h2 style={{ margin: 0, fontSize: "1.125rem", color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", letterSpacing: "0.02em" }}>
//                 Chroma Intelligence Core
//               </h2>
//               <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.06em", marginTop: "0.25rem", textTransform: "uppercase" }}>
//                 <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px #ef4444", animation: "pulse 2s infinite" }} />
//                 ACTIVE ASSISTANT
//               </div>
//             </div>
//           </div>
//           <div style={{ display: "flex", gap: "0.5rem" }}>
//             <button
//               onClick={handleGoHome}
//               className="btn btn-secondary"
//               style={{ padding: "0.4rem 1rem", fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}
//               title="Reset Chat"
//             >
//               <Home size={14} /> Go Home
//             </button>
//             <button
//               onClick={onClose}
//               className="btn btn-primary"
//               style={{ padding: "0.4rem 1rem", fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}
//             >
//               <ArrowLeft size={14} /> Back to App
//             </button>
//           </div>
//         </div>

//         {/* Messages Area */}
//         <div className="cs-guide-modal-content" style={{
//           padding: "1.5rem",
//           overflowY: "auto",
//           display: "flex",
//           flexDirection: "column",
//           gap: "1.25rem",
//           flex: 1,
//           background: "var(--bg-0)"
//         }}>
//           {messages.map((msg, idx) => (
//             <div key={idx} style={{
//               display: "flex",
//               justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
//               width: "100%"
//             }}>
//               <div style={{
//                 maxWidth: "80%",
//                 padding: "1rem",
//                 borderRadius: "1rem",
//                 background: msg.role === "user" ? "var(--accent)" : "var(--bg-1)",
//                 color: msg.role === "user" ? "#fff" : "var(--text-0)",
//                 border: msg.role === "user" ? "none" : "1px solid var(--border)",
//                 borderBottomRightRadius: msg.role === "user" ? "4px" : "1rem",
//                 borderBottomLeftRadius: msg.role === "assistant" ? "4px" : "1rem",
//                 boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
//               }}>
//                 <div className="markdown-content" style={{ fontSize: "0.9375rem", lineHeight: 1.6 }}>
//                   {msg.role === "assistant" ? (
//                     <ReactMarkdown>{msg.content}</ReactMarkdown>
//                   ) : (
//                     <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
//                   )}
//                 </div>
//               </div>
//             </div>
//           ))}
          
//           {loading && (
//             <div style={{ display: "flex", justifyContent: "flex-start", width: "100%" }}>
//               <div style={{
//                 padding: "1rem",
//                 borderRadius: "1rem",
//                 background: "var(--bg-1)",
//                 border: "1px solid var(--border)",
//                 borderBottomLeftRadius: "4px",
//                 display: "flex",
//                 alignItems: "center",
//                 gap: "0.5rem",
//                 color: "var(--text-2)"
//               }}>
//                 <Loader2 size={16} className="spinner" /> Thinking...
//               </div>
//             </div>
//           )}
          
//           <div ref={messagesEndRef} />
//         </div>
        
//         {/* Input Area */}
//         <div className="cs-guide-modal-footer" style={{
//           padding: "1rem 1.5rem",
//           borderTop: "1px solid var(--border)",
//           background: "var(--bg-1)",
//           display: "flex",
//           gap: "0.75rem",
//           alignItems: "center"
//         }}>
//           <input
//             type="text"
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             onKeyDown={(e) => {
//               if (e.key === "Enter" && !e.shiftKey) {
//                 e.preventDefault();
//                 handleSend();
//               }
//             }}
//             placeholder="Ask a question about this page, decisions, or workflows..."
//             style={{
//               flex: 1,
//               padding: "0.75rem 1rem",
//               borderRadius: "var(--r-md)",
//               border: "1px solid var(--border)",
//               background: "var(--bg-0)",
//               color: "var(--text-0)",
//               fontSize: "0.9375rem"
//             }}
//           />
//           <button
//             onClick={handleSend}
//             disabled={!input.trim() || loading}
//             className="btn btn-accent"
//             style={{ padding: "0.75rem", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", justifyContent: "center" }}
//           >
//             <Send size={18} />
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }

import { BrainCircuit, Zap, ShieldCheck, Eye, GitBranch } from "lucide-react";
import LogoMark from "./LogoMark";

interface AiGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AiGuideModal({ isOpen, onClose }: AiGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="cs-guide-modal cs-guide-modal-ai" style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0, 0, 0, 0.8)",
      backdropFilter: "blur(12px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "1rem"
    }}>
      <div className="cs-guide-modal-panel" style={{
        background: "var(--bg-1)",
        border: "1px solid rgba(77, 166, 255, 0.4)",
        borderRadius: "var(--r-xl)",
        width: "100%",
        maxWidth: "760px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 0 80px rgba(77, 166, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
        overflow: "hidden"
      }}>
        {/* Header - CCTV Theme */}
        <div className="cs-guide-modal-header" style={{
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(90deg, rgba(15, 23, 42, 1) 0%, rgba(30, 27, 75, 1) 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(77, 166, 255, 0.1)",
              border: "1px solid rgba(77, 166, 255, 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#4da6ff"
            }}>
              <LogoMark size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", letterSpacing: "0.02em" }}>
                How Chroma AI Works
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.06em", marginTop: "0.25rem", textTransform: "uppercase" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4da6ff", boxShadow: "0 0 8px #4da6ff", animation: "pulse 2s infinite" }} />
                STATIC SYSTEM OVERVIEW
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)", border: "none",
              color: "#fff", cursor: "pointer",
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="cs-guide-modal-content" style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* Card 1: On Submit */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <Zap size={16} style={{ color: "#f59e0b" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>AI Readiness Rating</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>The Gatekeeper:</strong> The AI acts as an automated border control guard. When a designer clicks "Submit", it instantly scans 6 critical rules.</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Ratings:</strong> Assigns a Green (Good to go), Yellow (Warning), or Red (Blocked) rating based on missing data or technical impossibilities.</p>
              </div>
            </div>

            {/* Card 2: Conflict detection */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <Eye size={16} style={{ color: "#ec4899" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>AI Conflict Detection</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>The Night Watchman:</strong> A background worker that wakes up every 30 minutes to scan the entire company database.</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Clashes:</strong> If Team A uses shiny plastic and Team B uses matte plastic on adjacent parts, the AI instantly flags a visual mismatch conflict.</p>
              </div>
            </div>

            {/* Card 3: Version validation */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <GitBranch size={16} style={{ color: "#8b5cf6" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>Version Validation</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>The Strict Teacher:</strong> When a decision is rejected and returned to the creator to fix, the AI enforces compliance.</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Delta Tracking:</strong> It compares the old version and new version mathematically to ensure the user actually fixed the specific problem they were told to fix.</p>
              </div>
            </div>

            {/* Card 4: Reporting */}
            <div style={{ background: "var(--bg-0)", padding: "1.25rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <ShieldCheck size={16} style={{ color: "#34d399" }} />
                <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-0)" }}>Enterprise Reporting</h4>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                <p style={{ margin: "0 0 0.5rem 0" }}><strong style={{ color: "var(--text-1)" }}>The Chief of Staff:</strong> The AI gathers thousands of complex data points and generates beautiful executive summaries.</p>
                <p style={{ margin: 0 }}><strong style={{ color: "var(--text-1)" }}>Actionable Insight:</strong> It finds real-world impacts (e.g. supplier delays) and writes highly professional briefings that executives can read in 60 seconds.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "1rem 1.5rem", borderTop: "1px solid var(--border)", background: "var(--bg-0)",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", letterSpacing: "0.02em" }}>
            Data is strictly isolated per tenant for maximum enterprise security.
          </span>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "0.4rem 1rem", fontSize: "0.8125rem", fontWeight: 600 }}>
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}
