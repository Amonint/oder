import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { ManualDataRecord } from "@/api/client";

interface FunnelExtendedCardProps {
  conversationsStarted: number;
  firstReplies: number;
  manualRecord: ManualDataRecord | null;
}

interface FunnelStep {
  label: string;
  value: number;
  sub: string;
  tooltip: string;
  isManual?: boolean;
}

function pct(from: number, to: number): string {
  if (from === 0) return "—";
  return `${((to / from) * 100).toFixed(1)}%`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("es");
}

export default function FunnelExtendedCard({
  conversationsStarted,
  firstReplies,
  manualRecord,
}: FunnelExtendedCardProps) {
  const steps: FunnelStep[] = [
    {
      label: "Mensajes iniciados",
      value: conversationsStarted,
      sub: "Meta Insights",
      tooltip: "Conversaciones iniciadas reportadas por Meta.",
    },
    {
      label: "Respuestas",
      value: firstReplies,
      sub: "Meta Insights",
      tooltip: "Primeras respuestas reportadas por Meta (messaging_first_reply).",
    },
    {
      label: "Leads aceptados",
      value: manualRecord?.accepted_leads ?? 0,
      sub: "Manual",
      tooltip: "Leads que pasaron el filtro de calificación del equipo.",
      isManual: true,
    },
    {
      label: "Cotizaciones",
      value: manualRecord?.quotes_sent ?? 0,
      sub: "Manual",
      tooltip: "Presupuestos enviados al cliente.",
      isManual: true,
    },
    {
      label: "Ventas cerradas",
      value: manualRecord?.sales_closed ?? 0,
      sub: "Manual",
      tooltip: "Conversiones reales en ventas.",
      isManual: true,
    },
  ];

  const conversions = [
    pct(steps[0].value, steps[1].value),
    pct(steps[1].value, steps[2].value),
    pct(steps[2].value, steps[3].value),
    pct(steps[3].value, steps[4].value),
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-foreground text-lg font-semibold">Embudo comercial extendido</h2>
        <span className="text-muted-foreground text-xs">Meta Insights + datos manuales</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Flecha = tasa de avance al siguiente paso. Pasos en cursiva = carga manual.
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1 overflow-x-auto">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1 min-w-0">
                  <div className={`flex flex-col items-center text-center min-w-[90px] px-2 py-3 rounded-xl ${step.isManual ? "bg-muted/60 border border-dashed border-muted-foreground/30" : "bg-muted/40"}`}>
                    <span className="text-foreground text-xl font-bold leading-tight">{fmt(step.value)}</span>
                    <span className={`text-xs font-medium mt-0.5 flex items-center gap-0.5 ${step.isManual ? "text-muted-foreground italic" : "text-foreground"}`}>
                      {step.label}
                      <InfoTooltip text={step.tooltip} />
                    </span>
                    <span className="text-muted-foreground text-[10px] mt-0.5">{step.sub}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex flex-col items-center min-w-[44px]">
                      <span className="text-muted-foreground text-[10px] font-medium">{conversions[i]}</span>
                      <span className="text-muted-foreground text-base leading-none">→</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>
    </section>
  );
}
