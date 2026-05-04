import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageFunnelResponse, PageKpiRow } from "@/api/client";
import InfoTooltip from "@/components/InfoTooltip";

interface FunnelReplyGaugeCardProps {
  funnel: PageFunnelResponse | undefined;
  insightsRow: PageKpiRow | undefined;
  isLoading: boolean;
}

export default function FunnelReplyGaugeCard({ funnel, insightsRow, isLoading }: FunnelReplyGaugeCardProps) {
  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  const conv = funnel?.conversations_started ?? 0;
  const replies = funnel?.first_replies ?? 0;
  const rate = conv > 0 ? Math.min(100, (replies / conv) * 100) : 0;
  const spend = parseFloat(String(insightsRow?.spend ?? "0")) || 0;
  const costPerConv = conv > 0 ? spend / conv : null;

  if (!funnel || funnel.impressions === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1">
          Tasa de primera respuesta
          <InfoTooltip text="Embudo Meta (mismo periodo): first_replies ÷ conversations_started. Es distinto del KPI «Tasa de Respuesta (Insights)» de Rentabilidad, que suma messaging_conversation_replied_7d en la serie diaria de conversiones. Uno mide el paso embudo; el otro métricas agregadas de pauta." />
        </CardTitle>
        <CardDescription>
          Coste aproximado por conversación iniciada:{" "}
          <span className="font-semibold text-foreground">
            {costPerConv != null ? `$${costPerConv.toFixed(2)}` : "—"}
          </span>{" "}
          (gasto total de KPIs ÷ conversaciones del embudo).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span className="text-foreground font-semibold tabular-nums">{rate.toFixed(1)}%</span>
            <span>100%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${rate}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {replies.toLocaleString("es")} respuestas sobre {conv.toLocaleString("es")} conversaciones iniciadas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
