import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { PageFunnelResponse } from "@/api/client";

interface VideoRetentionFunnelCardProps {
  data: PageFunnelResponse | undefined;
  isLoading: boolean;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("es");
}

function pct(from: number, to: number): string {
  if (from === 0) return "—";
  return `${((to / from) * 100).toFixed(1)}%`;
}

export default function VideoRetentionFunnelCard({ data, isLoading }: VideoRetentionFunnelCardProps) {
  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Retención de Video</h2>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </section>
    );
  }

  const p25 = data?.video_p25 ?? 0;
  const p50 = data?.video_p50 ?? 0;
  const p75 = data?.video_p75 ?? 0;
  const p100 = data?.video_p100 ?? 0;
  const videoViews = data?.video_views ?? 0;
  const videoPlays = data?.video_plays ?? 0;
  const thruplay = data?.video_thruplay ?? 0;
  const avgWatchSec = data?.video_avg_watch_sec ?? 0;

  if (p25 === 0) return null;

  // Funnel: Plays → Views(3s) → 25% → 50% → 75% → 100%
  const funnelStart = videoPlays > 0 ? videoPlays : videoViews;
  const steps = [
    {
      label: "Plays",
      value: funnelStart,
      sub: videoPlays > 0 ? "reproducciones" : "vistas 3s",
      tooltip: "Total de reproducciones iniciadas (cualquier duración). Punto de entrada real del funnel.",
    },
    ...(videoPlays > 0 && videoViews > 0 ? [{
      label: "3 seg",
      value: videoViews,
      sub: "vieron 3s",
      tooltip: "Personas que vieron al menos 3 segundos — primer filtro de atención real.",
    }] : []),
    {
      label: "25%",
      value: p25,
      sub: "vieron ¼",
      tooltip: "Personas que vieron al menos el 25% del video — señal de interés inicial.",
    },
    {
      label: "50%",
      value: p50,
      sub: "vieron ½",
      tooltip: "Vieron la mitad del video — buen nivel de engagement.",
    },
    {
      label: "75%",
      value: p75,
      sub: "vieron ¾",
      tooltip: "Vieron tres cuartos del video — audiencia muy comprometida.",
    },
    {
      label: "Completo",
      value: p100,
      sub: "vieron todo",
      tooltip: "Vieron el video completo — perfil de mayor intención.",
    },
  ];

  const rates = steps.slice(0, -1).map((step, i) =>
    pct(step.value, steps[i + 1]?.value ?? 0),
  );

  const avgLabel = avgWatchSec > 0
    ? avgWatchSec >= 60
      ? `${Math.floor(avgWatchSec / 60)}m ${avgWatchSec % 60}s promedio`
      : `${avgWatchSec}s promedio`
    : null;

  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-lg font-semibold">Retención de Video</h2>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Cuántas personas llegaron a cada cuartil. La caída entre etapas indica dónde se pierde la atención.
            </CardTitle>
            <div className="flex items-center gap-3 shrink-0">
              {avgLabel && (
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  ⏱ {avgLabel}
                </span>
              )}
              {thruplay > 0 && (
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md flex items-center gap-1">
                  ThruPlay: <strong className="text-foreground">{fmt(thruplay)}</strong>
                  <InfoTooltip text="ThruPlay = vio 15+ segundos (o el video completo si dura menos de 15s). Métrica oficial de calidad de Meta." />
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1 overflow-x-auto">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1 min-w-0">
                  <div className="flex flex-col items-center text-center min-w-[90px] px-2 py-3 rounded-xl bg-muted/40">
                    <span className="text-foreground text-xl font-bold leading-tight">{fmt(step.value)}</span>
                    <span className="text-foreground text-xs font-medium mt-0.5 flex items-center gap-0.5">
                      {step.label}
                      <InfoTooltip text={step.tooltip} />
                    </span>
                    <span className="text-muted-foreground text-[10px] mt-0.5">{step.sub}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex flex-col items-center min-w-[44px]">
                      <span className="text-muted-foreground text-[10px] font-medium">{rates[i]}</span>
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
