import {
  Card, CardHeader, CardTitle, CardContent,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { AttributionResponse, InsightActionItem } from "@/api/client";
import { ATTRIBUTION_POST_2026_TOOLTIP } from "@/lib/attributionCopy";

const WINDOW_OPTIONS = [
  { value: "click_1d", label: "1 día tras clic" },
  { value: "click_7d", label: "7 días tras clic" },
  { value: "click_28d", label: "28 días tras clic" },
  { value: "view_1d", label: "1 día tras impresión" },
  { value: "view_7d", label: "7 días tras impresión" },
];

interface AttributionWindowPanelProps {
  data: AttributionResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  window: string;
  onWindowChange: (w: string) => void;
}

function extractTotalActions(actions: InsightActionItem[] | undefined): number {
  if (!actions) return 0;
  return actions.reduce((sum, a) => sum + Number(a.value ?? 0), 0);
}

function extractTotalSpend(data: AttributionResponse["data"]): number {
  return data.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
}

export default function AttributionWindowPanel({
  data,
  isLoading,
  isError,
  errorMessage,
  window,
  onWindowChange,
}: AttributionWindowPanelProps) {
  const rows = data?.data ?? [];
  const totalSpend = extractTotalSpend(rows);
  const totalActions = rows.reduce(
    (sum, row) => sum + extractTotalActions(row.actions),
    0
  );
  const cpa = totalActions > 0 ? totalSpend / totalActions : null;

  return (
    <TooltipProvider delayDuration={300}>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-foreground flex items-center gap-1 text-lg font-semibold">
            Ventana de atribución
            <InfoTooltip text={ATTRIBUTION_POST_2026_TOOLTIP} />
          </h2>
          <Select value={window} onValueChange={onWindowChange}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data?.window_label && (
            <Badge variant="secondary" className="font-normal">
              Activa: {data.window_label}
            </Badge>
          )}
        </div>

        {data?.note && (
          <p className="text-muted-foreground text-xs">{data.note}</p>
        )}
        {data?.warning ? (
          <Alert>
            <AlertTitle>Advertencia de atribución</AlertTitle>
            <AlertDescription>{data.warning}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                Gasto total
                <InfoTooltip text="Inversión total en el período para la ventana seleccionada." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {isLoading ? <Skeleton className="h-8 w-24" /> : `$${totalSpend.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">Total conversiones</CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {isLoading ? <Skeleton className="h-8 w-24" /> : totalActions.toLocaleString("es")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                CPA (ventana actual)
                <InfoTooltip text="Costo por conversión calculado sobre la ventana de atribución activa." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {isLoading
                  ? <Skeleton className="h-8 w-24" />
                  : cpa != null ? `$${cpa.toFixed(2)}` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {isError && (
          <Alert variant="destructive">
            <AlertTitle>Error al cargar datos de atribución</AlertTitle>
            <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-sm">Sin datos de conversiones para esta ventana.</p>
            </CardContent>
          </Card>
        )}
      </section>
    </TooltipProvider>
  );
}
