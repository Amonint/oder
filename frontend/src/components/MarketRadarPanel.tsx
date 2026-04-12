// frontend/src/components/MarketRadarPanel.tsx
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMarketRadarExtended } from "@/hooks/useMarketRadarExtended";
import { TopAdvertisersSection } from "@/components/market-radar/TopAdvertisersSection";

interface Props {
  pageId: string;
  onClose: () => void;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

export default function MarketRadarPanel({ pageId, onClose, onSelectCompetitor }: Props) {
  const { data, isLoading, error } = useMarketRadarExtended({ pageId });

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
          {/* Province detection */}
          <div className="bg-blue-50 p-3 rounded-lg space-y-1">
            <p className="text-xs font-semibold text-blue-900">🎯 Provincia Detectada</p>
            <p className="text-sm text-blue-800">
              {data.client_page.province || "Ubicación desconocida"}
              <span className="text-xs ml-2">
                ({(data.client_page.province_confidence * 100).toFixed(0)}% • {data.client_page.province_source})
              </span>
            </p>
          </div>

          {/* Ecuador Top 5 */}
          <TopAdvertisersSection
            competitors={data.ecuador_top5}
            title="🇪🇨 Top 5 Ecuador"
            onSelectCompetitor={onSelectCompetitor}
          />

          {/* Province Top 5 */}
          <TopAdvertisersSection
            competitors={data.province_top5}
            title={`📍 Top 5 ${data.client_page.province || "Provincia"}`}
            onSelectCompetitor={onSelectCompetitor}
          />

          {/* Metadata footer */}
          <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
            <p>Total detectados: {data.metadata.total_competitors_detected}</p>
            <p>Última sincronización: {new Date(data.metadata.last_sync).toLocaleString('es-ES')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
