import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrganicMetric } from "@/api/client";

interface OrganicKpiCardProps {
  metrics: Record<string, OrganicMetric> | undefined;
  isLoading: boolean;
}

const METRIC_LABELS: Record<string, string> = {
  page_impressions: "Impresiones Orgánicas",
  page_impressions_unique: "Alcance Orgánico",
  page_fan_adds: "Nuevos Seguidores",
  page_fan_removes: "Seguidores Perdidos",
  page_post_engagements: "Engagement",
  page_views_total: "Visitas a la Página",
  page_actions_post_reactions_total: "Reacciones",
};

export default function OrganicKpiCard({ metrics, isLoading }: OrganicKpiCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Engagement Orgánico</CardTitle>
        <p className="text-muted-foreground text-xs">Métricas de Page Insights (no pagadas)</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !metrics || Object.keys(metrics).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin datos de engagement orgánico.{" "}
            <span className="text-xs">
              (Requiere permiso <code>pages_read_engagement</code> y acceso de administrador a la página.)
            </span>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(metrics).map(([key, val]) => (
              <div
                key={key}
                className="bg-muted/40 rounded-lg p-3 text-center"
              >
                <p className="text-muted-foreground text-xs">
                  {METRIC_LABELS[key] ?? key}
                </p>
                <p className="text-foreground text-xl font-bold">
                  {val.total >= 1000
                    ? `${(val.total / 1000).toFixed(1)}k`
                    : val.total.toLocaleString("es")}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
