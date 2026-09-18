import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export default function SearchableSelect({ options, value, onChange, placeholder = "Select...", disabled, style }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const selectedOption = useMemo(() => options.find(o => o.value === value), [options, value]);
  
  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(o => 
      o.label.toLowerCase().includes(lower) || 
      o.value.toLowerCase().includes(lower)
    );
  }, [options, search]);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="input"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          textAlign: "left",
          background: disabled ? "var(--bg-1)" : "var(--bg-0)",
          cursor: disabled ? "not-allowed" : "pointer",
          padding: "6px 12px",
          height: "auto",
          minHeight: "32px",
        }}
      >
        <span style={{ 
          whiteSpace: "nowrap", 
          overflow: "hidden", 
          textOverflow: "ellipsis",
          color: selectedOption ? "var(--text-0)" : "var(--text-3)"
        }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ color: "var(--text-3)", flexShrink: 0, marginLeft: "0.5rem" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--bg-0)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: "max-content",
          }}
        >
          <div style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-1)" }}>
            <Search size={14} style={{ color: "var(--text-3)" }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: "0.8125rem",
                color: "var(--text-0)",
                width: "100%"
              }}
            />
          </div>
          
          <div style={{ 
            maxHeight: "200px", // 5 items * 40px roughly
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            padding: "0.25rem"
          }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: "0.75rem", fontSize: "0.8125rem", color: "var(--text-3)", textAlign: "center" }}>
                No results found.
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.75rem",
                    border: "none",
                    background: value === opt.value ? "var(--bg-2)" : "transparent",
                    color: "var(--text-0)",
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                    borderRadius: "var(--r-sm)",
                    textAlign: "left"
                  }}
                >
                  <span style={{ 
                    whiteSpace: "nowrap", 
                    overflow: "hidden", 
                    textOverflow: "ellipsis",
                    fontWeight: value === opt.value ? 500 : 400
                  }}>
                    {opt.label}
                  </span>
                  {value === opt.value && <Check size={14} style={{ color: "var(--text-0)", flexShrink: 0, marginLeft: "0.5rem" }} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
