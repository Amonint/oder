import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { PageFunnelResponse } from "@/api/client";
import { buildMessagingFunnelSteps } from "@/lib/pageDashboardDecisions";

interface ConversionFunnelCardProps {
  data: PageFunnelResponse | undefined;
  isLoading: boolean;
}

interface FunnelStep {
  label: string;
  value: number;
  sub: string;
  tooltip: string;
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

export default function ConversionFunnelCard({ data, isLoading }: ConversionFunnelCardProps) {
  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Embudo de Adquisición</h2>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-28 w-full" />
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!data || data.impressions === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Embudo de Adquisición</h2>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Sin datos de embudo en el periodo seleccionado.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const steps: FunnelStep[] = buildMessagingFunnelSteps(data).map((step) => ({
    ...step,
    tooltip:
      step.label === "Impresiones"
        ? "Total de veces que el anuncio fue mostrado en pantalla."
        : step.label === "Clics únicos"
        ? "Personas únicas que hicieron clic en el anuncio (botón de mensaje, enlace u otro). Incluye clics al CTA de mensajería."
        : step.label === "Conversaciones"
        ? "Conversaciones iniciadas atribuidas por Meta (ventana 7d)."
        : step.label === "1ª Respuesta"
        ? "Conversaciones donde hubo al menos una primera respuesta del negocio."
        : step.label === "Profundidad 2"
        ? "Conversaciones con 2 o más mensajes enviados — señal de interés."
        : step.label === "Profundidad 3"
        ? "Conversaciones con 3+ mensajes — interés real del prospecto."
        : "Conversaciones con 5+ mensajes — perfil de lead calificado.",
  }));

  const convRates = steps.slice(0, -1).map((step, i) =>
    pct(step.value, steps[i + 1]?.value ?? 0),
  );

  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-lg font-semibold">Embudo de Adquisición</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Flujo de pauta: exposición, clic prioritario y conversación iniciada.
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1 overflow-x-auto">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1 min-w-0">
                {/* Step box */}
                <div className="flex flex-col items-center text-center min-w-[90px] px-2 py-3 rounded-xl bg-muted/40">
                  <span className="text-foreground text-xl font-bold leading-tight">{fmt(step.value)}</span>
                  <span className="text-foreground text-xs font-medium mt-0.5 flex items-center gap-0.5">
                    {step.label}
                    <InfoTooltip text={step.tooltip} />
                  </span>
                  <span className="text-muted-foreground text-[10px] mt-0.5">{step.sub}</span>
                </div>
                {/* Arrow + rate */}
                {i < steps.length - 1 && (
                  <div className="flex flex-col items-center min-w-[44px]">
                    <span className="text-muted-foreground text-[10px] font-medium">{convRates[i]}</span>
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
