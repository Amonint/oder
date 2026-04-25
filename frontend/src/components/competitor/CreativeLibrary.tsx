// frontend/src/components/competitor/CreativeLibrary.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompetitorAdItem } from "@/api/client";
import { AdReferenceLink } from "@/components/AdReferenceLink";

interface Props {
  data: CompetitorAdItem[];
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function CreativeLibrary({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Biblioteca creativa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sin anuncios disponibles.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Biblioteca creativa ({data.length} anuncios)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3">
          {data.slice(0, 20).map((ad) => {
            const body = ad.ad_creative_bodies?.[0];
            const title = ad.ad_creative_link_titles?.[0];
            const caption = ad.ad_creative_link_captions?.[0];
            return (
              <div
                key={ad.id}
                className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm"
              >
                {body && (
                  <p className="text-foreground leading-snug">
                    {truncate(body, 120)}
                  </p>
                )}
                {title && (
                  <p className="font-medium text-xs text-muted-foreground">
                    {truncate(title, 80)}
                  </p>
                )}
                {caption && (
                  <p className="text-xs text-muted-foreground italic">
                    {truncate(caption, 60)}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Desde {formatDate(ad.ad_delivery_start_time)}
                  </span>
                  {(ad.publisher_platforms ?? []).map((p) => (
                    <Badge key={p} variant="outline" className="text-xs capitalize">
                      {p}
                    </Badge>
                  ))}
                  <span className="ml-auto">
                    <AdReferenceLink href={ad.ad_snapshot_url ?? null} compact />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
