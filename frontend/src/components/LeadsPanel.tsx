import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { LeadsResponse } from "@/api/client";

interface LeadsPanelProps {
  data: LeadsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function LeadsPanel({ data, isLoading, isError, errorMessage }: LeadsPanelProps) {
  const rows = data?.data ?? [];
  const summary = data?.summary;

  return (
    <TooltipProvider delayDuration={300}>
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Lead Ads</h2>
        <p className="text-muted-foreground text-sm">
          Leads reportados en Insights (conversiones) por campaña.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                Total leads
                <InfoTooltip text="Leads reportados en Insights de Meta (acciones de tipo lead/onsite_conversion)." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summary.total_leads_insights.toLocaleString("es")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">Gasto total</CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                ${summary.total_spend.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                CPA por lead
                <InfoTooltip text="Gasto total ÷ total leads reportados en Insights." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summary.avg_cpa_lead != null ? `$${summary.avg_cpa_lead.toFixed(2)}` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {data?.note && (
        <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
          {data.note}
        </Badge>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leads por campaña</CardTitle>
          <CardDescription>Volumen y CPA por campaña en el período seleccionado.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar leads</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Sin leads en este periodo.</p>
          ) : (
            <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaña</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">CPA lead</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={row.campaign_id ?? idx}>
                        <TableCell className="font-medium text-sm max-w-[240px] truncate">
                          {row.campaign_name ?? row.campaign_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          {row.leads_insights.toLocaleString("es")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          ${Number(row.spend ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.cpa_lead != null ? `$${row.cpa_lead.toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          )}
        </CardContent>
      </Card>
    </section>
    </TooltipProvider>
  );
}
