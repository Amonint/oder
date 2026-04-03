import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMetaAccessToken, setMetaAccessToken } from "@/api/client";

export default function TokenPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getMetaAccessToken()) {
      navigate("/accounts", { replace: true });
    }
  }, [navigate]);

  function onConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Pega un token de acceso válido.");
      return;
    }
    setMetaAccessToken(trimmed);
    navigate("/accounts");
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Meta Ads — Conectar</CardTitle>
          <CardDescription>
            Introduce un token de usuario de la Marketing API (p. ej. long-lived).
            No se guarda en el servidor: solo en{" "}
            <code className="text-xs">sessionStorage</code> de este navegador.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onConnect}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meta-token">Token de acceso</Label>
              <Input
                id="meta-token"
                name="token"
                type="password"
                autoComplete="off"
                placeholder="Pega el token aquí"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button type="submit">Conectar / Cargar cuentas</Button>
          </CardFooter>
        </form>
      </Card>
      <p className="text-muted-foreground text-center text-xs">
        Si compartiste este token, revócalo en Meta for Developers y genera uno
        nuevo.
      </p>
    </div>
  );
}
