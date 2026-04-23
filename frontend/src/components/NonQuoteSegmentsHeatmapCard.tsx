import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SegmentNoQuoteRow } from "@/api/client";

interface NonQuoteSegmentsHeatmapCardProps {
  data: SegmentNoQuoteRow[] | undefined;
  threshold: number | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

function bgForRate(noQuoteRate: number): string {
  if (noQuoteRate >= 0.7) return "bg-red-600/90 text-white";
  if (noQuoteRate >= 0.5) return "bg-amber-500/80 text-black";
  if (noQuoteRate >= 0.3) return "bg-yellow-300/80 text-black";
  return "bg-emerald-500/70 text-black";
}

export default function NonQuoteSegmentsHeatmapCard({
  data,
  threshold,
  isLoading,
  isError,
  errorMessage,
}: NonQuoteSegmentsHeatmapCardProps) {
  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segmentos que no cotizan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {errorMessage ?? "No se pudo cargar el heatmap de desalineación."}
          </p>
        </CardContent>
      </Card>
    );
  }
  const rows = (data ?? []).slice(0, 12);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Segmentos que no cotizan</CardTitle>
        <CardDescription>
          Heatmap por no-quote rate. Umbral de alerta: {(threshold ?? 0.2) * 100}% de quote rate mínimo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay segmentos con volumen suficiente.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <div
                key={r.segment_key}
                className={`rounded-md p-3 ${bgForRate(r.no_quote_rate)}`}
                title={`Aceptados: ${r.accepted_leads} · Cotizados: ${r.quotes_sent}`}
              >
                <p className="truncate text-sm font-semibold">{r.segment_key}</p>
                <p className="text-xs">
                  No cotizan: {(r.no_quote_rate * 100).toFixed(1)}%
                </p>
                <p className="text-xs">
                  Quote rate: {(r.quote_rate * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
