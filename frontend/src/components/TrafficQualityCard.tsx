import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrafficQualityResponse } from "@/api/client";

interface TrafficQualityCardProps {
  data: TrafficQualityResponse | undefined;
  isLoading: boolean;
}

interface MetricTileProps {
  label: string;
  value: string;
  description: string;
  highlight?: boolean;
}

function MetricTile({ label, value, description, highlight }: MetricTileProps) {
  return (
    <Card className={highlight ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-900/10" : ""}>
      <CardContent className="p-4 space-y-1">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
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
        <h2 className="text-foreground text-lg font-semibold">Calidad de Tráfico</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0,1,2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      </section>
    );
  }

  const outbound = data?.outbound_clicks ?? 0;
  const cpc = data?.cost_per_outbound_click ?? 0;
  const lpRate = data?.click_to_lp_rate ?? 0;

  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-lg font-semibold">Calidad de Tráfico</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricTile
          label="Clics Salientes"
          value={outbound.toLocaleString("es")}
          description="Personas que fueron a tu landing page"
        />
        <MetricTile
          label="Costo por Clic Saliente"
          value={cpc > 0 ? `$${cpc.toFixed(2)}` : "—"}
          description="Costo de llevar a alguien fuera de Meta"
        />
        <MetricTile
          label="Tasa Clic → Landing"
          value={lpRate > 0 ? `${lpRate.toFixed(1)}%` : "—"}
          description="Clics que llegaron a cargar la página web"
          highlight={lpRate > 0 && lpRate < 70}
        />
      </div>
    </section>
  );
}
