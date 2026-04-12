import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { PageFunnelResponse } from "@/api/client";

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
        <h2 className="text-foreground text-lg font-semibold">Embudo de Conversión</h2>
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
        <h2 className="text-foreground text-lg font-semibold">Embudo de Conversión</h2>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Sin datos de embudo en el periodo seleccionado.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const steps: FunnelStep[] = [
    {
      label: "Impresiones",
      value: data.impressions,
      sub: "Veces mostrado",
      tooltip: "Total de veces que el anuncio fue mostrado en pantalla (Facebook + Instagram). Una persona puede generar múltiples impresiones.",
    },
    {
      label: "Alcance",
      value: data.reach,
      sub: "Personas únicas",
      tooltip: "Número de personas distintas que vieron el anuncio al menos una vez. Cada persona se cuenta una sola vez en el período.",
    },
    {
      label: "Clics únicos",
      value: data.unique_clicks,
      sub: "Clics distintos",
      tooltip: "Personas que hicieron clic al menos una vez en el anuncio. Incluye clics en enlace, foto y otros elementos. Fuente: campo unique_clicks de Meta.",
    },
    {
      label: "Conversaciones",
      value: data.conversations_started,
      sub: "Mensajes iniciados",
      tooltip: "Personas que iniciaron una conversación por Messenger o WhatsApp dentro de los 7 días de ver el anuncio. Fuente: acción messaging_conversation_started_7d.",
    },
    {
      label: "Respuestas",
      value: data.first_replies,
      sub: "Primera respuesta",
      tooltip: "Personas que respondieron activamente al primer mensaje de la conversación. Indica leads de mayor calidad. Fuente: acción messaging_first_reply de Meta.",
    },
  ];

  const conversions = [
    pct(data.impressions, data.reach),
    pct(data.reach, data.unique_clicks),
    pct(data.unique_clicks, data.conversations_started),
    pct(data.conversations_started, data.first_replies),
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-lg font-semibold">Embudo de Conversión</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Cada flecha muestra qué porcentaje avanzó al siguiente paso.
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
