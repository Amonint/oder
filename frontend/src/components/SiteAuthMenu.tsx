import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchSiteAuthMe, siteLogout } from "../api/authSite";
import { Button } from "./ui/button";

export default function SiteAuthMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["siteAuthMe"],
    queryFn: fetchSiteAuthMe,
    staleTime: 30_000,
  });

  if (data?.kind !== "in") {
    return null;
  }
  return (
    <div className="ml-auto">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-muted-foreground"
        onClick={async () => {
          await siteLogout();
          await queryClient.invalidateQueries({ queryKey: ["siteAuthMe"] });
          navigate("/login", { replace: true });
        }}
      >
        Cerrar sesión ({data.user})
      </Button>
    </div>
  );
}
