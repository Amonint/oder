import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { PageKpiRow } from "@/api/client";

interface KpiGridProps {
  data: PageKpiRow[] | undefined;
  isLoading: boolean;
}

interface KpiDef {
  key: keyof PageKpiRow;
  label: string;
  format: (v: string) => string;
  tooltip: string;
}

const KPI_DEFS: KpiDef[] = [
  {
    key: "spend",
    label: "Gasto",
    format: (v) => `$${parseFloat(v).toFixed(2)}`,
    tooltip: "Suma total invertida en todas las plataformas Meta (Facebook, Instagram, Audience Network) durante el período. Fuente: campo spend de la API de Insights.",
  },
  {
    key: "reach",
    label: "Alcance",
    format: (v) => parseInt(v).toLocaleString("es-EC"),
    tooltip: "Número de personas únicas que vieron al menos un anuncio. Cada persona se cuenta una sola vez, sin importar cuántas veces vio el anuncio. Fuente: campo reach.",
  },
  {
    key: "impressions",
    label: "Impresiones",
    format: (v) => parseInt(v).toLocaleString("es-EC"),
    tooltip: "Total de veces que un anuncio fue mostrado en pantalla, incluyendo Facebook e Instagram. Una misma persona puede generar múltiples impresiones. Fuente: campo impressions.",
  },
  {
    key: "cpm",
    label: "CPM",
    format: (v) => `$${parseFloat(v).toFixed(2)}`,
    tooltip: "Costo por cada 1.000 impresiones en Meta (Facebook + Instagram). Se calcula: Gasto ÷ Impresiones × 1.000. Indica qué tan costoso es llegar a la audiencia.",
  },
  {
    key: "ctr",
    label: "CTR (todos los clics)",
    format: (v) => `${parseFloat(v).toFixed(2)}%`,
    tooltip:
      "Campo ctr de Meta: porcentaje de impresiones con al menos un clic (todos los tipos de clic). No es el CTR de enlace. Ver también «CTR enlace».",
  },
  {
    key: "inline_link_click_ctr",
    label: "CTR enlace",
    format: (v) => `${parseFloat(v).toFixed(2)}%`,
    tooltip:
      "Campo inline_link_click_ctr de Meta: porcentaje de impresiones con clic en enlace inline. Suele ser más útil para anuncios orientados a tráfico web.",
  },
  {
    key: "frequency",
    label: "Frecuencia",
    format: (v) => parseFloat(v).toFixed(2),
    tooltip: "Promedio de veces que una persona vio el anuncio en el período. Se calcula: Impresiones ÷ Alcance. Frecuencia >3 puede indicar saturación de audiencia.",
  },
];

export default function KpiGrid({ data, isLoading }: KpiGridProps) {
  const row: PageKpiRow = data?.[0] ?? {};

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {KPI_DEFS.map((kpi) => (
          <Card key={kpi.key}>
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
                <p className="text-2xl font-bold">
                  {row[kpi.key] != null ? kpi.format(String(row[kpi.key])) : "—"}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
