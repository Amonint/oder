// frontend/src/hooks/useMarketRadar.ts
import { useQuery } from "@tanstack/react-query";
import { fetchMarketRadar, type MarketRadarResponse } from "@/api/client";

export function useMarketRadar(pageId: string | null) {
  return useQuery<MarketRadarResponse, Error>({
    queryKey: ["market-radar", pageId],
    queryFn: () => fetchMarketRadar(pageId!),
    enabled: pageId !== null,
    staleTime: 10 * 60 * 1000, // 10 minutos
  });
}
