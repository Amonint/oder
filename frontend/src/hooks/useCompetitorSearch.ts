// frontend/src/hooks/useCompetitorSearch.ts
import { useEffect, useState } from "react";
import { searchCompetitorPages, type CompetitorPageSuggestion } from "@/api/client";

interface UseCompetitorSearchResult {
  suggestions: CompetitorPageSuggestion[];
  isLoading: boolean;
  error: string | null;
}

export function useCompetitorSearch(query: string): UseCompetitorSearchResult {
  const [suggestions, setSuggestions] = useState<CompetitorPageSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await searchCompetitorPages(query);
        if (!controller.signal.aborted) {
          setSuggestions(result.data);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Error al buscar páginas");
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { suggestions, isLoading, error };
}
