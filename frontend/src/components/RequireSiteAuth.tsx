import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import { fetchSiteAuthMe } from "../api/authSite";

/**
 * Protege las rutas hijas si el backend tiene login de app (SITE_AUTH_*).
 * No interfiere con el token de Meta.
 */
export default function RequireSiteAuth() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["siteAuthMe"],
    queryFn: fetchSiteAuthMe,
    retry: 1,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-destructive text-sm">No se pudo verificar el acceso.</p>
        <a href="/login" className="text-primary text-sm underline">
          Ir a iniciar sesión
        </a>
      </div>
    );
  }
  if (data?.kind === "out") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
