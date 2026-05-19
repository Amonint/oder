import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { PageKpiRow } from "@/api/client";

interface KpiGridProps {
  data: PageKpiRow[] | undefined;
  isLoading: boolean;
  conversations?: number;
  cpa?: number | null;
  firstReplies?: number;
}

function fmt(
  v: number | string | undefined | null,
  prefix = "",
  suffix = "",
  decimals = 0,
): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return "—";
  return `${prefix}${n.toLocaleString("es-EC", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

export default function KpiGrid({
  data,
  isLoading,
  conversations,
  cpa,
  firstReplies,
}: KpiGridProps) {
  const row: PageKpiRow = data?.[0] ?? {};

  const kpis = [
    {
      label: "Gasto",
      value: fmt(row.spend, "$", "", 2),
      tooltip: "Total invertido en el período (Facebook + Instagram).",
    },
    {
      label: "Alcance",
      value: fmt(row.reach, "", "", 0),
      tooltip: "Personas únicas que vieron al menos una vez el anuncio durante el período.",
    },
    {
      label: "Conversaciones",
      value: fmt(conversations, "", "", 0),
      tooltip:
        "Conversaciones iniciadas en Messenger atribuidas a la pauta (ventana 7d, fuente: embudo).",
    },
    {
      label: "CPA",
      value: cpa != null ? fmt(cpa, "$", "", 2) : "—",
      tooltip:
        "Costo por conversación iniciada = Gasto ÷ Conversaciones. Null si no hubo conversaciones en el período.",
    },
    {
      label: "1ª Respuesta",
      value: fmt(firstReplies, "", "", 0),
      tooltip:
        "Cantidad de conversaciones donde el prospecto recibió al menos una respuesta del negocio.",
    },
    {
      label: "CPM",
      value: fmt(row.cpm, "$", "", 3),
      tooltip:
        "Costo por 1,000 impresiones. Indica qué tan caro está el inventario publicitario en Meta.",
    },
    {
      label: "CPP",
      value: fmt(row.cpp, "$", "", 2),
      tooltip:
        "Costo por persona única alcanzada. Más útil que el CPM cuando la audiencia es pequeña y con alta frecuencia.",
    },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center">
                {kpi.label}
                <InfoTooltip text={kpi.tooltip} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
