import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Link, Navigate, useParams } from "react-router-dom";
import { fetchAccountDashboard, getMetaAccessToken } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DATE_PRESETS = [
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "Últimos 30 días" },
  { value: "last_90d", label: "Últimos 90 días" },
  { value: "maximum", label: "Máximo disponible" },
] as const;

const KPI_LABELS: Record<string, string> = {
  impressions: "Impresiones",
  clicks: "Clics",
  spend: "Gasto",
  reach: "Alcance",
  frequency: "Frecuencia",
  cpm: "CPM",
  cpp: "CPP",
  ctr: "CTR",
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toLocaleString("es", { maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [datePreset, setDatePreset] = useState<string>("last_30d");
  const hasToken = Boolean(getMetaAccessToken());
  const id = accountId ? decodeURIComponent(accountId) : "";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", id, datePreset],
    queryFn: () => fetchAccountDashboard(id, datePreset),
    enabled: hasToken && Boolean(id),
  });

  const chartData = useMemo(() => {
    const actions = data?.actions;
    if (!actions?.length) return [];
    return [...actions]
      .sort((a, b) => b.value - a.value)
      .slice(0, 14)
      .map((a) => ({
        label: String(a.action_type).slice(0, 28),
        value: a.value,
      }));
  }, [data]);

  const chartConfig = {
    value: {
      label: "Valor",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  if (!hasToken) {
    return <Navigate to="/" replace />;
  }

  if (!id) {
    return <Navigate to="/accounts" replace />;
  }

  return (
    <div className="space-y-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Inicio</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/accounts">Cuentas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[200px] truncate font-mono text-xs">
              {id}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground font-mono text-sm">{id}</p>
          {data?.date_start && data?.date_stop ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Periodo reportado: {data.date_start} → {data.date_stop}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Periodo</span>
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Preset" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to="/accounts">Volver a cuentas</Link>
          </Button>
        </div>
      </div>

      {data?.insights_empty ? (
        <Alert>
          <AlertTitle>Sin datos en este periodo</AlertTitle>
          <AlertDescription>
            Meta no devolvió filas de insights para este rango. Prueba otro preset
            (p. ej. <strong>maximum</strong>) o revisa que la cuenta tenga
            actividad.
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error al cargar el dashboard</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Error desconocido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {data && !isLoading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(data.summary).map(([key, val]) => (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardDescription>
                    {KPI_LABELS[key] ?? key}
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {formatNum(val)}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Separator />

          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Acciones (action_type)</CardTitle>
                <CardDescription>
                  Desglose agregado del periodo (no es serie diaria).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.actions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center">
                            Sin acciones
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.actions.map((row, idx) => (
                          <TableRow key={`${String(row.action_type)}-${idx}`}>
                            <TableCell className="max-w-[240px] font-mono text-xs">
                              {String(row.action_type)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNum(row.value)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Costo por tipo de acción</CardTitle>
                <CardDescription>
                  Campo <code className="text-xs">cost_per_action_type</code> de
                  Meta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Costo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.cost_per_action_type.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center">
                            Sin datos
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.cost_per_action_type.map((row, idx) => (
                          <TableRow key={`${String(row.action_type)}-${idx}`}>
                            <TableCell className="max-w-[240px] font-mono text-xs">
                              {String(row.action_type)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNum(row.value)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Gráfico por tipo de acción</CardTitle>
              <CardDescription>
                Barras según los tipos con mayor volumen en el periodo
                agregado.
              </CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
              {chartData.length === 0 ? (
                <p className="text-muted-foreground px-6 text-sm">
                  No hay datos para graficar.
                </p>
              ) : (
                <ChartContainer config={chartConfig} className="min-h-[280px] w-full">
                  <BarChart
                    accessibilityLayer
                    data={chartData}
                    margin={{ left: 8, right: 8, top: 8, bottom: 48 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      tickMargin={8}
                      angle={-35}
                      textAnchor="end"
                      height={64}
                      interval={0}
                      fontSize={10}
                    />
                    <YAxis tickLine={false} axisLine={false} width={48} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
