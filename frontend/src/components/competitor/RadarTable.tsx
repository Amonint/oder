// frontend/src/components/competitor/RadarTable.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  data: CompetitorAdItem[];
}

function calcDurationDays(start?: string, stop?: string | null): number | null {
  if (!start) return null;
  const s = new Date(start).getTime();
  const e = stop ? new Date(stop).getTime() : Date.now();
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

export default function RadarTable({ data }: Props) {
  const now = new Date();
  const active = data.filter(
    (ad) => !ad.ad_delivery_stop_time || new Date(ad.ad_delivery_stop_time) > now
  );
  const inactive = data.filter(
    (ad) => ad.ad_delivery_stop_time && new Date(ad.ad_delivery_stop_time) <= now
  );

  const duraciones = inactive
    .map((ad) => calcDurationDays(ad.ad_delivery_start_time, ad.ad_delivery_stop_time))
    .filter((d): d is number => d !== null);
  const vidaMedia =
    duraciones.length > 0
      ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length)
      : null;

  const plataformas = Array.from(
    new Set(data.flatMap((ad) => ad.publisher_platforms ?? []))
  );

  const rows = [
    { label: "Anuncios activos", value: active.length.toString() },
    { label: "Anuncios inactivos", value: inactive.length.toString() },
    { label: "Total anuncios", value: data.length.toString() },
    { label: "Vida media del anuncio", value: vidaMedia !== null ? `${vidaMedia} días` : "—" },
    {
      label: "Plataformas",
      value: (
        <div className="flex flex-wrap gap-1">
          {plataformas.length > 0
            ? plataformas.map((p) => (
                <Badge key={p} variant="secondary" className="capitalize text-xs">
                  {p}
                </Badge>
              ))
            : "—"}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Radar competitivo</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-2 pr-4 text-muted-foreground">{row.label}</td>
                <td className="py-2 font-medium">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
