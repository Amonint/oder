import { useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchPages, getMetaAccessToken } from "@/api/client";
import PageCard from "@/components/PageCard";

const DATE_OPTIONS = [
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "maximum", label: "Máximo disponible" },
];

export default function PagesPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const hasToken = Boolean(getMetaAccessToken());
  const [datePreset, setDatePreset] = useState("last_7d");

  if (!hasToken) return <Navigate to="/" replace />;
  if (!accountId) return <Navigate to="/accounts" replace />;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pages", accountId, datePreset],
    queryFn: () => fetchPages(accountId, { datePreset }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="w-full space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <nav className="text-muted-foreground mb-1 flex items-center gap-2 text-sm">
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => navigate("/accounts")}
            >
              Cuentas
            </button>
            <span>/</span>
            <span className="text-foreground">Páginas</span>
          </nav>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Páginas asociadas a la cuenta
          </h1>
          <p className="text-muted-foreground text-sm">
            Selecciona una página para ver su dashboard de pauta.
          </p>
        </div>

        <Select value={datePreset} onValueChange={setDatePreset}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar las páginas</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Error desconocido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {data && !isLoading ? (
        data.data.length === 0 ? (
          <Alert>
            <AlertTitle>Sin páginas en el periodo</AlertTitle>
            <AlertDescription>
              No se encontraron páginas con campañas en el periodo seleccionado. Intenta ampliar el periodo o verificar la actividad de la cuenta.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Página</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((page) => (
                  <PageCard
                    key={page.page_id}
                    page={page}
                    onClick={() =>
                      navigate(
                        `/accounts/${encodeURIComponent(accountId)}/pages/${encodeURIComponent(page.page_id)}/dashboard`
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </div>
  );
}
