import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEffect, useId, useState } from "react";
import { fetchSiteAuthMe, siteLogin } from "../api/authSite";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function LoginPage() {
  const uId = useId();
  const pId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["siteAuthMe"],
    queryFn: fetchSiteAuthMe,
  });

  const m = useMutation({
    mutationFn: () => siteLogin(user.trim(), pass),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["siteAuthMe"] });
      navigate("/", { replace: true });
    },
  });

  useEffect(() => {
    if (!isLoading && data && (data.kind === "off" || data.kind === "in")) {
      navigate("/", { replace: true });
    }
  }, [isLoading, data, navigate]);

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[40vh] items-center justify-center text-sm">
        Cargando…
      </div>
    );
  }
  if (!isLoading && data && (data.kind === "off" || data.kind === "in")) {
    return null;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="border-border bg-card w-full max-w-sm space-y-6 rounded-lg border p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-foreground text-lg font-semibold tracking-tight">
            Oderbiz Analitics
          </h1>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={uId}>Usuario</Label>
            <Input
              id={uId}
              name="username"
              type="text"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={pId}>Contraseña</Label>
            <Input
              id={pId}
              name="password"
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
            />
          </div>
          {m.isError && (
            <p className="text-destructive text-sm" role="alert">
              {m.error instanceof Error
                ? m.error.message
                : "Error al iniciar sesión"}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={m.isPending}
          >
            {m.isPending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
