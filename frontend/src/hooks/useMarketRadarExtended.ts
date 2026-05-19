// frontend/src/hooks/useMarketRadarExtended.ts
import { useQuery } from "@tanstack/react-query";
import { fetchMarketRadarExtended, type MarketRadarExtendedResponse } from "@/api/client";

interface UseMarketRadarExtendedOptions {
  pageId: string | null;
}

export function useMarketRadarExtended({ pageId }: UseMarketRadarExtendedOptions) {
  return useQuery<MarketRadarExtendedResponse, Error>({
    queryKey: ["market-radar-extended", pageId],
    queryFn: async () => {
      if (!pageId) throw new Error("pageId required");
      return fetchMarketRadarExtended(pageId);
    },
    enabled: !!pageId,
    retry: 2,
  });
}
