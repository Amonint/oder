// frontend/src/hooks/useCompetitorResolve.ts
import { useEffect, useRef, useState } from "react";
import {
  resolveCompetitor,
  type CompetitorResolvedSuggestion,
} from "@/api/client";

function isCompetitorUrl(text: string): boolean {
  return /facebook\.com|instagram\.com/i.test(text);
}

export type ResolveState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "resolved"; platform: string; page_id: string; name: string; fan_count?: number; category?: string | null }
  | { status: "suggestions"; items: CompetitorResolvedSuggestion[] }
  | { status: "error"; message: string };

export function useCompetitorResolve(
  input: string,
  pageId?: string,
): ResolveState {
  const [state, setState] = useState<ResolveState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = input.trim();

    if (trimmed.length < 2) {
      setState({ status: "idle" });
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const url = isCompetitorUrl(trimmed);
    const delay = url ? 0 : 300;

    setState({ status: "resolving" });

    const timer = setTimeout(async () => {
      if (abortRef.current?.signal.aborted) return;
      try {
        const result = await resolveCompetitor(trimmed, pageId);
        if (abortRef.current?.signal.aborted) return;

        if (result.results) {
          setState({ status: "suggestions", items: result.results });
        } else if (result.page_id && result.name) {
          setState({
            status: "resolved",
            platform: result.platform,
            page_id: result.page_id,
            name: result.name,
            fan_count: result.fan_count,
            category: result.category,
          });
        } else {
          setState({ status: "error", message: "No se encontró el perfil." });
        }
      } catch (e) {
        if (!abortRef.current?.signal.aborted) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Error al resolver el perfil.",
          });
        }
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [input, pageId]);

  return state;
}
