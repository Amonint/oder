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
  fetchGraphMe,
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

  const emptyAccounts =
    Boolean(data) && !isLoading && !isError && data!.data.length === 0;

  const { data: graphMe, isError: meError } = useQuery({
    queryKey: ["graph-me"],
    queryFn: fetchGraphMe,
    enabled: hasToken && emptyAccounts,
    retry: false,
  });

  if (!hasToken) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="w-full space-y-6 py-6">
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

      {emptyAccounts ? (
        <Alert>
          <AlertTitle>Meta devolvió 0 cuentas publicitarias</AlertTitle>
          <AlertDescription className="space-y-3 text-sm">
            <p>
              La API respondió bien, pero <strong>/me/adaccounts</strong> no tiene
              filas para este token. Suele pasar si:
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                El token no incluye permisos <code className="text-xs">ads_read</code>{" "}
                o <code className="text-xs">ads_management</code> (u otro alcance que
                Meta exija para ver cuentas).
              </li>
              <li>
                Es un token de <strong>aplicación</strong> o de <strong>página</strong>{" "}
                en lugar de un <strong>token de usuario</strong> con acceso a cuentas de
                anuncios.
              </li>
              <li>
                El usuario de Meta no tiene ninguna cuenta publicitaria asignada (ni
                propia ni vía Business Manager).
              </li>
            </ul>
            {graphMe?.name != null || graphMe?.id != null ? (
              <p className="border-border mt-2 border-t pt-2">
                <strong>Token válido para Graph</strong> como:{" "}
                <span className="font-medium">{graphMe.name ?? "(sin nombre)"}</span>
                {graphMe.id != null ? (
                  <>
                    {" "}
                    (<code className="text-xs">{String(graphMe.id)}</code>)
                  </>
                ) : null}
                . El problema entonces es permiso o asignación de cuentas, no que el
                token esté “muerto”.
              </p>
            ) : null}
            {meError ? (
              <p className="text-destructive mt-2 text-xs">
                No se pudo leer <code>/me</code> con este token (revocá el token o
                generá uno nuevo en Meta for Developers).
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Comprobación manual: en Graph API Explorer probá{" "}
              <code className="text-xs">GET /me/adaccounts?fields=id,name</code> con el
              mismo token.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {data && !isLoading && data.data.length > 0 ? (
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
                    navigate(`/accounts/${encodeURIComponent(a.id)}/pages`)
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
