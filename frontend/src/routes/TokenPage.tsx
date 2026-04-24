import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
    <div className="flex min-h-[60vh] w-full items-center justify-center px-4 py-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Meta Ads — Conectar</CardTitle>
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
    </div>
  );
}
