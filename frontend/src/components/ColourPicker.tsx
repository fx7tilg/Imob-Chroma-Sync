import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { MasterColourCode } from "../types/db";

interface Props {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** Filter by category: only show exterior/interior/universal colours */
  category?: "exterior" | "interior" | "universal" | null;
}

const FINISH_LABEL: Record<string, string> = {
  solid: "Solid",
  metallic: "Metallic",
  pearl: "Pearl Effect",
  matte: "Matte",
};

export default function ColourPicker({ value, onChange, disabled, category }: Props) {
  const [colours, setColours] = useState<MasterColourCode[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("master_colour_codes")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setColours(data as MasterColourCode[]);
      });
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = useMemo(() => {
    let items = colours;
    // Filter by category + universal
    if (category) {
      items = items.filter((c) => c.category === category || c.category === "universal");
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.finish.toLowerCase().includes(q)
      );
    }
    return items;
  }, [colours, search, category]);

  const selected = colours.find((c) => c.code === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Selected value display */}
      <button
        type="button"
        className="input"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          cursor: disabled ? "default" : "pointer",
          textAlign: "left",
          width: "100%",
          background: "var(--bg-0)",
          justifyContent: "space-between",
        }}
      >
        {selected ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
            <ColourSwatch hex={selected.hex_preview} size={18} />
            <span style={{ fontWeight: 500, fontSize: "0.8125rem" }}>{selected.code}</span>
            <span style={{ color: "var(--text-2)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selected.name}
            </span>
          </div>
        ) : (
          <span style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>- Select colour code -</span>
        )}
        <span style={{ color: "var(--text-3)", fontSize: "0.625rem", flexShrink: 0 }}>▼</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--bg-0)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            maxHeight: 320,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
            <input
              className="input"
              placeholder="Search by code, name, or finish…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{ fontSize: "0.75rem", padding: "0.375rem 0.5rem", height: "auto" }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.75rem" }}>
                No matching colours found
              </div>
            )}
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                  setSearch("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "none",
                  background: c.code === value ? "rgba(16, 185, 129, 0.08)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 100ms",
                  borderBottom: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(77,166,255,0.06)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    c.code === value ? "rgba(16, 185, 129, 0.08)" : "transparent")
                }
              >
                <ColourSwatch hex={c.hex_preview} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-0)", fontFamily: "ui-monospace, monospace" }}>
                      {c.code}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-1)" }}>{c.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.125rem" }}>
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.5625rem",
                        padding: "1px 5px",
                        background: "var(--bg-2)",
                        color: "var(--text-2)",
                      }}
                    >
                      {FINISH_LABEL[c.finish] || c.finish}
                    </span>
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.5625rem",
                        padding: "1px 5px",
                        background: "var(--bg-2)",
                        color: "var(--text-2)",
                      }}
                    >
                      {c.category}
                    </span>
                  </div>
                </div>
                {c.code === value && (
                  <span style={{ color: "var(--green)", fontSize: "0.875rem" }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline colour swatch circle with border. */
export function ColourSwatch({ hex, size = 16 }: { hex: string; size?: number }) {
  const isDark = isColourDark(hex);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: hex,
        border: `1.5px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
        flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }}
      title={hex}
    />
  );
}

function isColourDark(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
