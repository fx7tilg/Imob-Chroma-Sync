import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, ArrowRight, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function SearchPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      
      let queryBuilder = supabase
        .from("decisions")
        .select("id, component_name, business_area, status")
        .order("updated_at", { ascending: false })
        .limit(10);
        
      if (query.trim()) {
        queryBuilder = queryBuilder.or(`component_name.ilike.%${query}%,business_area.ilike.%${query}%,status.ilike.%${query}%`);
      }
      
      const { data } = await queryBuilder;
      setResults(data || []);
      setLoading(false);
    };

    const timer = setTimeout(fetchResults, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0, 5, 15, 0.6)", backdropFilter: "blur(4px)",
      zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "10vh"
    }}>
      <div 
        style={{
          width: "100%", maxWidth: 600, background: "var(--bg-elevated)", 
          borderRadius: "var(--r-lg)", border: "1px solid var(--border)", 
          boxShadow: "var(--shadow-xl)", overflow: "hidden", display: "flex", flexDirection: "column"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "1rem", borderBottom: "1px solid var(--border)", gap: "0.75rem" }}>
          <Search size={20} color="var(--text-3)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search decisions by component name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--text-0)", fontSize: "1.125rem"
            }}
          />
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-2)" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: "0.5rem" }}>
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.875rem" }}>Searching...</div>
          ) : results.length > 0 ? (
            results.map((r) => (
              <div 
                key={r.id}
                onClick={() => {
                  navigate(`/decisions/${r.id}`);
                  onClose();
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.75rem 1rem", borderRadius: "var(--r-md)", cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "8px", background: "rgba(59, 130, 246, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                    <FileText size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--text-0)" }}>{r.component_name || "Unnamed Component"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: 2 }}>
                      {r.business_area} • {r.status}
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} color="var(--text-3)" />
              </div>
            ))
          ) : results.length === 0 && query.trim() ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.875rem" }}>No results found for "{query}"</div>
          ) : results.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.875rem" }}>No decisions exist yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
