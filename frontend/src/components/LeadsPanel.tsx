import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { MessagingResponse } from "@/api/client";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DASHBOARD_COLORS, barColorAt } from "@/lib/dashboardColors";
import { adsManagerUrlFromCampaign } from "@/lib/adReference";
import { AdReferenceLink } from "@/components/AdReferenceLink";

interface LeadsPanelProps {
  accountId?: string;
  data: MessagingResponse | undefined;
  previousData?: MessagingResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

const EMPTY_PUBLICATION_RE = /^(?:publicaci[oó]n:\s*)?["“”'`]\s*["“”'`]$/i;
function safeName(name: string | null | undefined, id: string | null | undefined, kind: "Campaña" | "Anuncio"): string {
  const raw = String(name ?? "").trim();
  const safeId = String(id ?? "").trim();
  if (raw && !EMPTY_PUBLICATION_RE.test(raw)) return raw;
  if (safeId) return `${kind} sin nombre (ID: ${safeId})`;
  return `${kind} sin nombre`;
}

type MessagingRowExt = NonNullable<MessagingResponse["data"]>[number] & {
  first_reply_rate: number | null;
  commercial_score: number;
  recommendation: "escalar" | "optimizar" | "pausar";
  confidence: "alta" | "media" | "baja";
};

const scoreChartConfig = {
  score: { label: "Score comercial", color: DASHBOARD_COLORS[0] },
} satisfies ChartConfig;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeCostPerConversation(cost: number | null): number {
  if (cost == null || !Number.isFinite(cost) || cost <= 0) return 0;
  // lineal: <=3 USD excelente, >=20 USD deficiente
  const n = (20 - cost) / (20 - 3);
  return clamp01(n);
}

function normalizeReplyRate(rate: number | null): number {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return 0;
  return clamp01(rate / 0.7); // 70% o más = muy bueno
}

function normalizeVolume(conversations: number): number {
  if (!Number.isFinite(conversations) || conversations <= 0) return 0;
  return clamp01(Math.sqrt(conversations) / Math.sqrt(50)); // satura cerca de 50
}

function commercialScore(row: {
  conversations_started: number;
  first_reply_rate: number | null;
  cost_per_conversation_started: number | null;
}): number {
  const cost = normalizeCostPerConversation(row.cost_per_conversation_started);
  const quality = normalizeReplyRate(row.first_reply_rate);
  const vol = normalizeVolume(row.conversations_started);
  return Math.round((0.4 * cost + 0.4 * quality + 0.2 * vol) * 100);
}

function recommendAction(score: number): "escalar" | "optimizar" | "pausar" {
  if (score >= 70) return "escalar";
  if (score >= 45) return "optimizar";
  return "pausar";
}

function confidenceLevel(row: { conversations_started: number; spend?: string | number }): "alta" | "media" | "baja" {
  const spend = Number(row.spend ?? 0);
  const conv = Number(row.conversations_started ?? 0);
  if (conv >= 10 && spend >= 30) return "alta";
  if (conv >= 5 && spend >= 12) return "media";
  return "baja";
}

function deltaPct(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

export default function LeadsPanel({ accountId, data, previousData, isLoading, isError, errorMessage }: LeadsPanelProps) {
  const rows = data?.data ?? [];
  const summary = data?.summary;
  const previousSummary = previousData?.summary;
  const rowsExtended: MessagingRowExt[] = rows.map((row) => {
    const replyRate =
      row.conversations_started > 0
        ? row.first_replies / row.conversations_started
        : null;
    const score = commercialScore({
      conversations_started: row.conversations_started,
      first_reply_rate: replyRate,
      cost_per_conversation_started: row.cost_per_conversation_started,
    });
    return {
      ...row,
      first_reply_rate: replyRate,
      commercial_score: score,
      recommendation: recommendAction(score),
      confidence: confidenceLevel(row),
    };
  });
  const topScale = [...rowsExtended]
    .filter((r) => r.conversations_started >= 3 && r.confidence !== "baja")
    .sort((a, b) => b.commercial_score - a.commercial_score)
    .slice(0, 5);
  const topPause = [...rowsExtended]
    .filter((r) => r.conversations_started >= 3)
    .sort((a, b) => a.commercial_score - b.commercial_score)
    .slice(0, 5);
  const scoreChartData = [...rowsExtended]
    .sort((a, b) => b.commercial_score - a.commercial_score)
    .slice(0, 8)
    .map((r) => ({
      key: `${r.campaign_id ?? "na"}-${r.ad_id ?? "na"}`,
      campaign: safeName(r.campaign_name ?? null, r.campaign_id ?? null, "Campaña"),
      score: r.commercial_score,
    }));
  const summaryScore = summary
    ? Math.round(
        0.5 * commercialScore({
          conversations_started: summary.total_conversations_started,
          first_reply_rate: summary.first_reply_rate,
          cost_per_conversation_started: summary.avg_cost_per_conversation_started,
        }) +
          0.5 * commercialScore({
            conversations_started: summary.total_conversations_started,
            first_reply_rate: summary.first_reply_rate,
            cost_per_conversation_started: summary.avg_cost_per_first_reply,
          }),
      )
    : null;
  const deltaConversations = deltaPct(
    summary?.total_conversations_started ?? null,
    previousSummary?.total_conversations_started ?? null,
  );
  const deltaReplyRate = deltaPct(
    summary?.first_reply_rate ?? null,
    previousSummary?.first_reply_rate ?? null,
  );
  const deltaCostConversation = deltaPct(
    summary?.avg_cost_per_conversation_started ?? null,
    previousSummary?.avg_cost_per_conversation_started ?? null,
  );

  return (
    <TooltipProvider delayDuration={300}>
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Mensajería (Meta Insights)</h2>
        <p className="text-muted-foreground text-sm">
          Conversaciones iniciadas y primeras respuestas por campaña.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                Conversaciones iniciadas
                <InfoTooltip text="Cantidad total de conversaciones iniciadas reportadas por Insights de Meta." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summary.total_conversations_started.toLocaleString("es")}
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
                Costo por conversación
                <InfoTooltip text="Costo promedio por conversación iniciada reportada por Insights." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summary.avg_cost_per_conversation_started != null ? `$${summary.avg_cost_per_conversation_started.toFixed(2)}` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                Tasa de primera respuesta
                <InfoTooltip text="Primeras respuestas / conversaciones iniciadas. Indicador de calidad temprana de conversación." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summary.first_reply_rate != null ? `${(summary.first_reply_rate * 100).toFixed(1)}%` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                Score comercial
                <InfoTooltip text="Score compuesto: 40% costo por conversación, 40% tasa de primera respuesta, 20% volumen." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summaryScore != null ? `${summaryScore}/100` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {summary && previousSummary ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Comparación vs periodo anterior</CardTitle>
            <CardDescription>
              Vista homogénea semanal/periodo para medir tendencia de mensajería.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <Badge variant="secondary" className="justify-center py-2">
                Conversaciones: {deltaConversations != null ? `${deltaConversations >= 0 ? "+" : ""}${deltaConversations.toFixed(1)}%` : "—"}
              </Badge>
              <Badge variant="secondary" className="justify-center py-2">
                1ra respuesta: {deltaReplyRate != null ? `${deltaReplyRate >= 0 ? "+" : ""}${deltaReplyRate.toFixed(1)}%` : "—"}
              </Badge>
              <Badge variant="secondary" className="justify-center py-2">
                Costo/conversación: {deltaCostConversation != null ? `${deltaCostConversation >= 0 ? "+" : ""}${deltaCostConversation.toFixed(1)}%` : "—"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data?.note && (
        <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
          {data.note}
        </Badge>
      )}
      <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
        Esta sección mide rendimiento de mensajería en Meta; no representa ventas cerradas del negocio.
      </Badge>
      <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
        Confiabilidad: Meta nativo (Insights) para conversaciones, respuestas y costos.
      </Badge>
      <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
        Confianza de recomendacion: alta ({">="}10 conv y {">="}$30), media ({">="}5 conv y {">="}$12), baja (muestra insuficiente).
      </Badge>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top campañas por score comercial</CardTitle>
          <CardDescription>
            Prioriza inversión en campañas con mejor equilibrio entre costo, calidad y volumen.
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {scoreChartData.length === 0 ? (
            <p className="text-muted-foreground px-6 text-sm">Sin datos suficientes.</p>
          ) : (
            <ChartContainer config={scoreChartConfig} className="min-h-[260px] w-full">
              <BarChart data={scoreChartData} margin={{ left: 8, right: 8, top: 8, bottom: 72 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="campaign"
                  tickLine={false}
                  tickMargin={8}
                  angle={-25}
                  textAnchor="end"
                  height={72}
                  interval={0}
                  fontSize={10}
                />
                <YAxis tickLine={false} axisLine={false} width={40} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="score" radius={4}>
                  {scoreChartData.map((d, i) => (
                    <Cell key={`${d.key}-${i}`} fill={barColorAt(i, d.key)} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 5 para escalar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topScale.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin campañas con volumen mínimo para recomendar escalado.</p>
            ) : (
              topScale.map((r, i) => (
                <div key={`scale-${r.campaign_id ?? i}`} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span className="truncate max-w-[70%]">{safeName(r.campaign_name ?? null, r.campaign_id ?? null, "Campaña")}</span>
                  <Badge>{r.commercial_score}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 5 para pausar/optimizar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topPause.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin campañas con volumen mínimo para recomendar pausa.</p>
            ) : (
              topPause.map((r, i) => (
                <div key={`pause-${r.campaign_id ?? i}`} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span className="truncate max-w-[70%]">{safeName(r.campaign_name ?? null, r.campaign_id ?? null, "Campaña")}</span>
                  <Badge variant="secondary">{r.commercial_score}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mensajería por campaña</CardTitle>
          <CardDescription>Volumen de conversaciones y costos en el período seleccionado.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar mensajería</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Sin datos de mensajería en este periodo.</p>
          ) : (
            <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaña</TableHead>
                      <TableHead className="text-right">Conversaciones</TableHead>
                      <TableHead className="text-right">1ras respuestas</TableHead>
                      <TableHead className="text-right">Tasa 1ra resp.</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">Costo / conversación</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Confianza</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsExtended.map((row, idx) => (
                      <TableRow key={row.campaign_id ?? idx}>
                        <TableCell className="font-medium text-sm max-w-[240px] truncate">
                          <AdReferenceLink href={adsManagerUrlFromCampaign(row.campaign_id ?? null, accountId ?? null)} compact />
                          {safeName(row.campaign_name ?? null, row.campaign_id ?? null, "Campaña")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          {row.conversations_started.toLocaleString("es")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.first_replies.toLocaleString("es")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.first_reply_rate != null ? `${(row.first_reply_rate * 100).toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          ${Number(row.spend ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.cost_per_conversation_started != null ? `$${row.cost_per_conversation_started.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.commercial_score}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={row.confidence === "alta" ? "default" : row.confidence === "media" ? "secondary" : "outline"}>
                            {row.confidence}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={row.recommendation === "escalar" ? "default" : row.recommendation === "pausar" ? "destructive" : "secondary"}>
                            {row.recommendation}
                          </Badge>
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
