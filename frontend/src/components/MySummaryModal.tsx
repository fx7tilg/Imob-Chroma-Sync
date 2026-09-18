import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface MySummaryModalProps {
  decisions: any[];
  title?: string;
  subtitle?: string;
}

export default function MySummaryModal({ title = "My Performance Summary", subtitle = "AI Analysis" }: MySummaryModalProps) {
  return (
    <Link 
      to="/decisions/my-summary" 
      className="card" 
      style={{ 
        textDecoration: "none", 
        marginBottom: "1.5rem", 
        padding: "1.25rem", 
        display: "flex", 
        flexDirection: "row", 
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem", 
        transition: "transform 200ms", 
        cursor: "pointer",
        border: "1px solid rgba(77,166,255,0.15)",
        background: "linear-gradient(135deg, rgba(77,166,255,0.03), rgba(139,92,246,0.02))"
      }} 
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} 
      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ 
          width: 48, height: 48, borderRadius: 12, 
          background: "rgba(77,166,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent)"
        }}>
          <Sparkles size={24} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-0)" }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <span className="badge badge-accent" style={{ fontSize: "0.625rem" }}>BETA</span>
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--text-2)", marginTop: "0.25rem" }}>
            {subtitle} of your decision history and workflow patterns.
          </div>
        </div>
      </div>
      <div style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
        Open Report <ArrowRight size={16} />
      </div>
    </Link>
  );
}
