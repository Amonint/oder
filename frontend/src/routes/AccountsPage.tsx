import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clearMetaAccessToken,
  fetchAdAccounts,
  getMetaAccessToken,
  type AdAccount,
} from "@/api/client";

export default function AccountsPage() {
  const navigate = useNavigate();
  const hasToken = Boolean(getMetaAccessToken());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAdAccounts,
    enabled: hasToken,
  });

  if (!hasToken) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Cuentas publicitarias
          </h1>
          <p className="text-muted-foreground text-sm">
            Elige una cuenta para ver el dashboard de métricas.
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            clearMetaAccessToken();
            navigate("/");
          }}
        >
          Cambiar token
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar las cuentas</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Error desconocido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {data && !isLoading ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Moneda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((a: AdAccount) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    navigate(`/accounts/${encodeURIComponent(a.id)}/dashboard`)
                  }
                >
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>
                    <code className="text-xs">{a.id}</code>
                  </TableCell>
                  <TableCell>
                    {a.currency ? (
                      <Badge variant="secondary">{a.currency}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
