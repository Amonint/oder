// frontend/src/components/CompetitorPanel.tsx
import { useQuery } from "@tanstack/react-query";
import { fetchCompetitorAds } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import RadarTable from "@/components/competitor/RadarTable";
import CreativeLibrary from "@/components/competitor/CreativeLibrary";
import IntensityIndex from "@/components/competitor/IntensityIndex";
import MarketMap from "@/components/competitor/MarketMap";

interface Props {
  pageId: string;
  pageName: string;
  onClose: () => void;
}

export default function CompetitorPanel({ pageId, pageName, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["competitor-ads", pageId],
    queryFn: () => fetchCompetitorAds(pageId),
    staleTime: 5 * 60 * 1000,
  });

  const ads = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Competidor</p>
          <h2 className="text-base font-semibold text-foreground truncate max-w-[240px]">
            {pageName}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Cerrar panel de competidor"
        >
          ✕
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error
              ? error.message.includes("ads_read") || error.message.includes("403")
                ? "Tu token no tiene acceso al Ad Library API. Requiere el permiso ads_read."
                : error.message
              : "Error al cargar datos del competidor"}
          </AlertDescription>
        </Alert>
      )}

      {/* Sin anuncios */}
      {!isLoading && !error && ads.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Este competidor no tiene anuncios activos en los países monitoreados.
        </p>
      )}

      {/* Vistas */}
      {!isLoading && !error && ads.length > 0 && (
        <>
          <RadarTable data={ads} />
          <IntensityIndex data={ads} />
          <CreativeLibrary data={ads} />
          <MarketMap data={ads} />
        </>
      )}
    </div>
  );
}
