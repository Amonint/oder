import { createContext, useContext, useState, type ReactNode } from "react";

export interface FilterState {
  datePreset: string;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
}

interface FilterContextValue extends FilterState {
  setFilter: (partial: Partial<FilterState>) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilterState>({
    datePreset: "last_30d",
    campaignId: null,
    adsetId: null,
    adId: null,
  });

  function setFilter(partial: Partial<FilterState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  return (
    <FilterContext.Provider value={{ ...state, setFilter }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used within FilterProvider");
  return ctx;
}
