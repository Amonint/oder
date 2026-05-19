import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { TrafficQualityResponse } from "@/api/client";

interface TrafficQualityCardProps {
  data: TrafficQualityResponse | undefined;
  isLoading: boolean;
}

interface MetricTileProps {
  label: string;
  value: string;
  description: string;
  tooltip: string;
  highlight?: boolean;
}

function MetricTile({ label, value, description, tooltip, highlight }: MetricTileProps) {
  return (
    <Card className={highlight ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-900/10" : ""}>
      <CardContent className="p-4 space-y-1">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center">
          {label}
          <InfoTooltip text={tooltip} />
        </p>
        <p className="text-foreground text-2xl font-bold">{value}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function TrafficQualityCard({ data, isLoading }: TrafficQualityCardProps) {
  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Clics y coste (Ads)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0,1,2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      </section>
    );
  }

  const outbound = data?.outbound_clicks ?? 0;
  const cpc = data?.cost_per_outbound_click ?? 0;
  const uniqueCtr = data?.unique_ctr ?? 0;

  if (outbound < 10) {
    return (
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Clics y coste (Ads)</h2>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">
              Esta campaña dirige a conversaciones directas en Meta — los clics salientes son mínimos ({outbound}) y no representan el objetivo principal. El rendimiento se evalúa por conversaciones iniciadas y profundidad de chat.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Clics y coste (Ads)</h2>
        <p className="text-muted-foreground text-xs">
          Señales desde Meta Ads Insights (clics salientes, CTR único). No incluye comportamiento en sitio
          (Pixel / GA4).
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            label="Clics Salientes"
            value={outbound.toLocaleString("es")}
            description="Clics que salieron de Meta hacia tu destino"
            tooltip="Campo outbound_clicks de Meta Insights. Cuenta clics que llevaron tráfico fuera de Meta hacia web o landing. No significa personas únicas."
          />
          <MetricTile
            label="Costo por Clic Saliente"
            value={cpc > 0 ? `$${cpc.toFixed(2)}` : "—"}
            description="Costo medio por outbound click"
            tooltip="Métrica de costo ligada a outbound_clicks. Meta la expone como cost_per_outbound_click; si no viene, no la inventamos."
          />
          <MetricTile
            label="CTR Único"
            value={uniqueCtr > 0 ? `${uniqueCtr.toFixed(2)}%` : "—"}
            description="Porcentaje de personas únicas que hicieron clic"
            tooltip="Porcentaje de personas únicas (del alcance total) que hicieron al menos un clic. Más representativo que el CTR estándar porque no cuenta clics repetidos de la misma persona. Fuente: campo unique_ctr de la API de Meta."
          />
        </div>
      </section>
    </TooltipProvider>
  );
}
