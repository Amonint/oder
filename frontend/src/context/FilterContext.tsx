import { createContext, useContext, useState, type ReactNode } from "react";

export interface FilterState {
  datePreset: string;
  dateStart: string | null;
  dateStop: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
}

interface FilterContextValue extends FilterState {
  setFilter: (partial: Partial<FilterState>) => void;
  /** Returns resolved date params to pass to fetchXxx functions */
  dateParams: () => { datePreset?: string; dateStart?: string; dateStop?: string };
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilterState>({
    datePreset: "last_30d",
    dateStart: null,
    dateStop: null,
    campaignId: null,
    adsetId: null,
    adId: null,
  });

  function setFilter(partial: Partial<FilterState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function dateParams() {
    if (state.datePreset === "today") {
      const today = new Date().toISOString().slice(0, 10);
      return { dateStart: today, dateStop: today };
    }
    if (state.datePreset === "custom" && state.dateStart && state.dateStop) {
      return { dateStart: state.dateStart, dateStop: state.dateStop };
    }
    return { datePreset: state.datePreset };
  }

  return (
    <FilterContext.Provider value={{ ...state, setFilter, dateParams }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used within FilterProvider");
  return ctx;
}
