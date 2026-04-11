// frontend/src/components/MarketRadarPanel.tsx
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMarketRadar } from "@/hooks/useMarketRadar";
import TopAdvertisers from "@/components/market-radar/TopAdvertisers";
import GeoOpportunity from "@/components/market-radar/GeoOpportunity";
import MarketSeasonality from "@/components/market-radar/MarketSeasonality";
import MessageIntelligence from "@/components/market-radar/MessageIntelligence";

interface Props {
  pageId: string;
  onClose: () => void;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

export default function MarketRadarPanel({ pageId, onClose, onSelectCompetitor }: Props) {
  const { data, isLoading, error } = useMarketRadar(pageId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Radar de Mercado</p>
          {data && (
            <h2 className="text-base font-semibold text-foreground">
              {data.client_page.category || "Segmento detectado"}
            </h2>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar Radar de Mercado">
          ✕
        </Button>
      </div>

      {/* Keywords chips */}
      {data && (
        <div className="flex flex-wrap gap-1">
          {data.client_page.keywords_used.map((kw) => (
            <Badge key={kw} variant="secondary" className="text-xs">
              {kw}
            </Badge>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Data */}
      {data && !isLoading && (
        <div className="space-y-6">
          <TopAdvertisers
            competitors={data.competitors}
            clientPageId={pageId}
            onSelectCompetitor={onSelectCompetitor}
          />
          <GeoOpportunity topCountries={data.market_summary.top_countries} />
          <MarketSeasonality competitors={data.competitors} />
          <MessageIntelligence topWords={data.market_summary.top_words} />
        </div>
      )}
    </div>
  );
}
