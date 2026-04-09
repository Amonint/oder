// frontend/src/components/competitor/IntensityIndex.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  data: CompetitorAdItem[];
}

function calcScore(data: CompetitorAdItem[]): number {
  const now = new Date();
  const active = data.filter(
    (ad) => !ad.ad_delivery_stop_time || new Date(ad.ad_delivery_stop_time) > now
  );

  const inactive = data.filter(
    (ad) => ad.ad_delivery_stop_time && new Date(ad.ad_delivery_stop_time) <= now
  );
  const duraciones = inactive.map((ad) => {
    const s = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time).getTime() : null;
    const e = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : null;
    if (!s || !e) return null;
    return (e - s) / (1000 * 60 * 60 * 24);
  }).filter((d): d is number => d !== null);

  const vidaMedia =
    duraciones.length > 0
      ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length
      : 0;

  const plataformas = new Set(data.flatMap((ad) => ad.publisher_platforms ?? [])).size;

  const scoreActivos = Math.min(active.length / 50, 1) * 40;
  const scoreVida = Math.min(vidaMedia / 30, 1) * 30;
  const scorePlataformas = Math.min(plataformas / 3, 1) * 30;

  return Math.min(Math.round(scoreActivos + scoreVida + scorePlataformas), 100);
}

function label(score: number): { text: string; color: string } {
  if (score <= 30) return { text: "Baja presión", color: "text-green-600" };
  if (score <= 60) return { text: "Presión media", color: "text-yellow-600" };
  return { text: "Alta presión", color: "text-red-600" };
}

export default function IntensityIndex({ data }: Props) {
  const score = calcScore(data);
  const { text, color } = label(score);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Índice de intensidad publicitaria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums">{score}</span>
          <span className="text-muted-foreground text-sm mb-1">/100</span>
          <span className={`text-sm font-medium mb-1 ${color}`}>{text}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Basado en volumen de anuncios activos, vida media y amplitud de plataformas.
        </p>
      </CardContent>
    </Card>
  );
}
