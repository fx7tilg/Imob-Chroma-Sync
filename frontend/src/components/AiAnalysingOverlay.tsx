import { useEffect, useState } from "react";
import LogoMark from "./LogoMark";

interface Props {
  isVisible: boolean;
  message?: string;
}

export default function AiAnalysingOverlay({ isVisible, message = "AI is analysing..." }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
    } else {
      const t = setTimeout(() => setShow(false), 300); // fade out duration
      return () => clearTimeout(t);
    }
  }, [isVisible]);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "2rem",
        right: "2rem",
        zIndex: 9999,
        background: "var(--bg-1)",
        border: "1px solid rgba(77, 166, 255, 0.3)",
        borderRadius: "var(--r-md)",
        padding: "1rem 1.25rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 40px rgba(77, 166, 255, 0.15)",
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
        transform: isVisible ? "translateY(0)" : "translateY(1rem)",
        transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* The Premium Rotating Chroma Sync Core */}
      <div className="ai-core-loader" style={{ transform: "scale(0.5)", margin: "-1rem" }}>
        <div className="ai-core-ring" />
        <div className="ai-core-ring-inner" />
        <LogoMark size={40} className="ai-core-icon" />
      </div>

      {/* The Animated Text */}
      <div>
        <h2
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            background: "linear-gradient(135deg, #4da6ff, #8b5cf6, #34d399)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 0 20px rgba(77, 166, 255, 0.2)",
            margin: "0 0 0.125rem 0",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
          }}
        >
          {message}
        </h2>
        <p style={{ margin: 0, fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)", letterSpacing: "0.02em" }}>
          Intelligence Engine
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
