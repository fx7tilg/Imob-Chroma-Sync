import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { useGlobalFilter, TimeFilterType } from "../../contexts/FilterContext";
import SearchableSelect from "./SearchableSelect";

const PRESETS: { value: TimeFilterType; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "day", label: "Specific Day" },
  { value: "month", label: "By Month" },
  { value: "quarter", label: "By Quarter" },
  { value: "year", label: "By Year" },
  { value: "custom", label: "Custom Range" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Generate years from 1900 to 9999
const YEARS_OPTIONS = Array.from({ length: 9999 - 1900 + 1 }, (_, i) => {
  const y = 1900 + i;
  return { value: y.toString(), label: y.toString() };
});
// Also reverse it so newest is on top (optional, but 2026 is better near top than scrolling from 1900)
// The search bar in SearchableSelect handles the rest.
YEARS_OPTIONS.reverse();

export default function DateFilterDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const {
    timeFilter, setTimeFilter,
    selectedDay, setSelectedDay,
    selectedMonth, setSelectedMonth,
    selectedQuarter, setSelectedQuarter,
    selectedYear, setSelectedYear,
    customStartDate, setCustomStartDate,
    customEndDate, setCustomEndDate,
    filterLabel
  } = useGlobalFilter();

  const [localType, setLocalType] = useState<TimeFilterType>(timeFilter);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleApply = () => {
    setTimeFilter(localType);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button 
        className="btn btn-ghost" 
        onClick={() => {
          setLocalType(timeFilter);
          setOpen(!open);
        }}
        style={{ 
          padding: "6px 12px", 
          background: "rgba(255,255,255,0.06)", 
          border: "1px solid rgba(255,255,255,0.14)", 
          borderRadius: "9999px",
          color: "#ffffff",
          display: "flex", 
          gap: "0.5rem", 
          alignItems: "center" 
        }}
      >
        <Calendar size={14} style={{ color: "rgba(255,255,255,0.72)" }}/>
        <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#ffffff" }}>{filterLabel}</span>
        <ChevronDown size={14} style={{ color: "rgba(255,255,255,0.6)" }}/>
      </button>

      {open && (
        <div 
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            background: "var(--bg-0)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
            zIndex: 200,
            display: "flex",
            width: 500,
            overflow: "hidden"
          }}
        >
          {/* Left Sidebar */}
          <div style={{ width: 160, borderRight: "1px solid var(--border)", background: "var(--bg-1)", padding: "0.5rem" }}>
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setLocalType(p.value)}
                style={{
                  width: "100%", textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.8125rem",
                  borderRadius: "var(--r-sm)", border: "none", cursor: "pointer",
                  background: localType === p.value ? "var(--bg-2)" : "transparent",
                  color: localType === p.value ? "var(--text-0)" : "var(--text-2)",
                  fontWeight: localType === p.value ? 500 : 400
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Right Details */}
          <div style={{ flex: 1, padding: "1.25rem", display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1 }}>
              {localType === "all" && (
                <div style={{ color: "var(--text-2)", fontSize: "0.8125rem", marginTop: "1rem" }}>
                  View all historical decisions and conflicts across the entire timeline.
                </div>
              )}
              {localType === "day" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.5rem" }}>Select Date</label>
                  <input type="date" className="input" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} />
                </div>
              )}
              {localType === "month" && (
                <div>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <SearchableSelect 
                        options={YEARS_OPTIONS}
                        value={selectedYear.toString()}
                        onChange={val => setSelectedYear(parseInt(val))}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                    {MONTHS.map((m, i) => (
                      <button 
                        key={m} 
                        onClick={() => setSelectedMonth(i)}
                        className={`btn ${selectedMonth === i ? "btn-accent" : "btn-ghost"}`}
                        style={{ padding: "0.375rem" }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {localType === "quarter" && (
                <div>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <SearchableSelect 
                        options={YEARS_OPTIONS}
                        value={selectedYear.toString()}
                        onChange={val => setSelectedYear(parseInt(val))}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    {[
                      { value: 1, label: "Q1", range: "Jan - Mar" },
                      { value: 2, label: "Q2", range: "Apr - Jun" },
                      { value: 3, label: "Q3", range: "Jul - Sep" },
                      { value: 4, label: "Q4", range: "Oct - Dec" }
                    ].map((q) => (
                      <button 
                        key={q.value} 
                        onClick={() => setSelectedQuarter(q.value)}
                        className={`btn ${selectedQuarter === q.value ? "btn-accent" : "btn-ghost"}`}
                        style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "center" }}
                      >
                        <span style={{ fontWeight: 500 }}>{q.label}</span>
                        <span style={{ fontSize: "0.6875rem", opacity: 0.8 }}>{q.range}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {localType === "year" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.5rem" }}>Select Year</label>
                  <SearchableSelect 
                    options={YEARS_OPTIONS}
                    value={selectedYear.toString()}
                    onChange={val => setSelectedYear(parseInt(val))}
                  />
                </div>
              )}
              {localType === "custom" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.5rem" }}>Start Date</label>
                    <input type="date" className="input" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.5rem" }}>End Date</label>
                    <input type="date" className="input" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <button className="btn btn-accent" onClick={handleApply}>
                <Check size={14} /> Apply Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
