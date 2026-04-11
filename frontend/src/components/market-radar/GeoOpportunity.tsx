// frontend/src/components/market-radar/GeoOpportunity.tsx
import { Badge } from "@/components/ui/badge";

const COUNTRY_NAMES: Record<string, string> = {
  EC: "Ecuador", CO: "Colombia", MX: "México", AR: "Argentina",
  CL: "Chile", PE: "Perú", VE: "Venezuela", HN: "Honduras",
  GT: "Guatemala", BO: "Bolivia", US: "Estados Unidos", ES: "España",
};

interface Props {
  topCountries: { country: string; advertiser_count: number }[];
}

function opportunityLabel(count: number): { label: string; variant: "default" | "secondary" | "outline" } {
  if (count === 0) return { label: "🔥 Sin competencia", variant: "default" };
  if (count === 1) return { label: "⚡ Baja", variant: "secondary" };
  if (count <= 4) return { label: "Media", variant: "outline" };
  return { label: "Alta competencia", variant: "outline" };
}

export default function GeoOpportunity({ topCountries }: Props) {
  if (topCountries.length === 0) return null;

  const sorted = [...topCountries].sort((a, b) => a.advertiser_count - b.advertiser_count);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Dónde pauta el segmento</h3>
      <p className="text-xs text-muted-foreground">
        Países con pocos anunciantes = menor competencia = CPM potencialmente más bajo para ti.
      </p>
      <div className="space-y-1">
        {sorted.map(({ country, advertiser_count }) => {
          const { label, variant } = opportunityLabel(advertiser_count);
          return (
            <div key={country} className="flex items-center justify-between py-1 border-b last:border-0">
              <span className="text-sm">{COUNTRY_NAMES[country] ?? country}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {advertiser_count} anunciante{advertiser_count !== 1 ? "s" : ""}
                </span>
                <Badge variant={variant} className="text-[10px]">{label}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
