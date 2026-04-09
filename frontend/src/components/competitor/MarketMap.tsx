// frontend/src/components/competitor/MarketMap.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  data: CompetitorAdItem[];
}

const MONITORED_COUNTRIES = ["CO", "MX", "AR", "CL", "PE", "US", "ES"];

export default function MarketMap({ data }: Props) {
  // Plataformas con conteo
  const platformCount: Record<string, number> = {};
  for (const ad of data) {
    for (const p of ad.publisher_platforms ?? []) {
      platformCount[p] = (platformCount[p] ?? 0) + 1;
    }
  }
  const platforms = Object.entries(platformCount).sort((a, b) => b[1] - a[1]);
  const maxPlatform = platforms[0]?.[1] ?? 1;

  // Idiomas con frecuencia
  const langCount: Record<string, number> = {};
  for (const ad of data) {
    for (const lang of ad.languages ?? []) {
      langCount[lang] = (langCount[lang] ?? 0) + 1;
    }
  }
  const langs = Object.entries(langCount).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Mapa de mercado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Plataformas */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Plataformas</p>
          {platforms.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {platforms.map(([platform, count]) => (
                <div key={platform} className="flex items-center gap-2">
                  <span className="w-20 text-xs capitalize shrink-0">{platform}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(count / maxPlatform) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Idiomas */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Idiomas detectados</p>
          {langs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {langs.map(([lang, count]) => (
                <Badge key={lang} variant="secondary" className="text-xs">
                  {lang.toUpperCase()} · {count}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Países monitoreados */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Países monitoreados</p>
          <div className="flex flex-wrap gap-1.5">
            {MONITORED_COUNTRIES.map((c) => (
              <Badge key={c} variant="outline" className="text-xs font-mono">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
