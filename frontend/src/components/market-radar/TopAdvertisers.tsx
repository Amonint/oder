// frontend/src/components/market-radar/TopAdvertisers.tsx
import { Badge } from "@/components/ui/badge";
import type { MarketRadarCompetitor } from "@/api/client";

interface Props {
  competitors: MarketRadarCompetitor[];
  clientPageId: string;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "FB",
  instagram: "IG",
  messenger: "MSG",
  audience_network: "AN",
  whatsapp: "WA",
  threads: "THR",
};

export default function TopAdvertisers({ competitors, clientPageId, onSelectCompetitor }: Props) {
  if (competitors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No se encontraron anunciantes activos en este segmento.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Quién pauta en tu segmento</h3>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Página</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Activos</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Plataformas</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp) => {
              const isClient = comp.page_id === clientPageId;
              return (
                <tr
                  key={comp.page_id}
                  className={`border-t ${isClient ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium truncate max-w-[140px] block">
                      {comp.name}
                    </span>
                    {isClient && (
                      <Badge variant="secondary" className="text-[10px] mt-0.5">Tú</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={comp.active_ads === 0 ? "text-muted-foreground" : "font-semibold"}>
                      {comp.active_ads}
                    </span>
                    <span className="text-muted-foreground text-xs"> /{comp.total_ads}</span>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {comp.platforms.map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px] px-1">
                          {PLATFORM_LABEL[p] ?? p}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!isClient && (
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => onSelectCompetitor(comp.page_id, comp.name)}
                      >
                        Ver ads →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
