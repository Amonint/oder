import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { HealthScoreResult } from "@/lib/healthScore";

interface HealthScoreCardProps {
  result: HealthScoreResult | null;
}

const STATUS_CONFIG = {
  healthy: { label: "Saludable", colorClass: "text-green-600 dark:text-green-400" },
  watch: { label: "Vigilar", colorClass: "text-yellow-600 dark:text-yellow-400" },
  critical: { label: "Crítico", colorClass: "text-red-600 dark:text-red-400" },
};

const COMPONENT_LABELS: Record<string, string> = {
  ctr: "CTR",
  frequency: "Frecuencia",
  acceptance_rate: "Tasa de aceptación",
  close_rate: "Tasa de cierre",
  roas: "ROAS estimado",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  gray: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  green: "Bien",
  yellow: "Revisar",
  red: "Mal",
  gray: "Sin dato",
};

export default function HealthScoreCard({ result }: HealthScoreCardProps) {
  if (!result) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-muted-foreground text-sm">
            Ingresa datos manuales para calcular el score de salud.
          </p>
        </CardContent>
      </Card>
    );
  }

  const cfg = STATUS_CONFIG[result.status];

  return (
    <TooltipProvider delayDuration={300}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            Score de salud
            <InfoTooltip text="Score 0-100 basado en CTR, frecuencia, tasa de aceptación, tasa de cierre y ROAS estimado. 80-100 = saludable, 60-79 = vigilar, 0-59 = crítico." />
          </CardTitle>
          <CardDescription>Lectura única del rendimiento general</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span className={`text-5xl font-bold tabular-nums ${cfg.colorClass}`}>
              {result.score}
            </span>
            <span className="text-muted-foreground text-sm">/ 100</span>
            <Badge className={`ml-2 ${STATUS_BADGE_CLASS[result.status === "healthy" ? "green" : result.status === "watch" ? "yellow" : "red"]}`}>
              {cfg.label}
            </Badge>
          </div>

          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                result.status === "healthy" ? "bg-green-500" :
                result.status === "watch" ? "bg-yellow-400" : "bg-red-500"
              }`}
              style={{ width: `${result.score}%` }}
            />
          </div>

          <div className="space-y-1.5">
            {Object.entries(result.breakdown).map(([key, comp]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{COMPONENT_LABELS[key] ?? key}</span>
                <Badge className={STATUS_BADGE_CLASS[comp.status]}>
                  {STATUS_LABEL[comp.status]}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
