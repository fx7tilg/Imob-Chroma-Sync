import React, { createContext, useContext, useMemo, useState } from "react";

export type TimeFilterType = "all" | "day" | "month" | "quarter" | "year" | "custom";

interface FilterContextState {
  timeFilter: TimeFilterType;
  setTimeFilter: (f: TimeFilterType) => void;
  
  selectedDay: string;
  setSelectedDay: (d: string) => void;
  
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
  
  selectedQuarter: number;
  setSelectedQuarter: (q: number) => void;
  
  selectedYear: number;
  setSelectedYear: (y: number) => void;

  customStartDate: string;
  setCustomStartDate: (d: string) => void;
  customEndDate: string;
  setCustomEndDate: (d: string) => void;
  
  filterRange: { start: string; end: string } | null;
  filterLabel: string;
}

const FilterContext = createContext<FilterContextState | undefined>(undefined);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function FilterProvider({ children }: { children: React.ReactNode }) {
  // Defaults to the current quarter + year automatically, no user action needed.
  const [timeFilter, setTimeFilter] = useState<TimeFilterType>("quarter");
  
  const now = new Date();
  const [selectedDay, setSelectedDay] = useState(now.toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const { filterRange, filterLabel } = useMemo(() => {
    if (timeFilter === "all") return { filterRange: null, filterLabel: "All Time" };

    let start = new Date();
    let end = new Date();
    let label = "";

    if (timeFilter === "day") {
      start = new Date(selectedDay);
      start.setHours(0, 0, 0, 0);
      end = new Date(selectedDay);
      end.setHours(23, 59, 59, 999);
      label = new Date(selectedDay).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } else if (timeFilter === "month") {
      start = new Date(selectedYear, selectedMonth, 1);
      end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      label = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    } else if (timeFilter === "quarter") {
      start = new Date(selectedYear, (selectedQuarter - 1) * 3, 1);
      end = new Date(selectedYear, (selectedQuarter - 1) * 3 + 3, 0, 23, 59, 59, 999);
      label = `Q${selectedQuarter} ${selectedYear}`;
    } else if (timeFilter === "year") {
      start = new Date(selectedYear, 0, 1);
      end = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
      label = `${selectedYear}`;
    } else if (timeFilter === "custom") {
      if (!customStartDate || !customEndDate) {
        return { filterRange: null, filterLabel: "Custom Range" };
      }
      start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      const s = start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
      const e = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
      label = `${s} - ${e}`;
    }

    return { 
      filterRange: { start: start.toISOString(), end: end.toISOString() },
      filterLabel: label 
    };
  }, [timeFilter, selectedDay, selectedMonth, selectedQuarter, selectedYear, customStartDate, customEndDate]);

  return (
    <FilterContext.Provider
      value={{
        timeFilter, setTimeFilter,
        selectedDay, setSelectedDay,
        selectedMonth, setSelectedMonth,
        selectedQuarter, setSelectedQuarter,
        selectedYear, setSelectedYear,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        filterRange, filterLabel,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useGlobalFilter() {
  const context = useContext(FilterContext);
  if (!context) throw new Error("useGlobalFilter must be used within FilterProvider");
  return context;
}
