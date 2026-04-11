// frontend/src/components/market-radar/MarketSeasonality.tsx
import type { MarketRadarCompetitor } from "@/api/client";

interface Props {
  competitors: MarketRadarCompetitor[];
}

function aggregateMonthly(competitors: MarketRadarCompetitor[]): { month: string; count: number }[] {
  const totals: Record<string, number> = {};
  for (const comp of competitors) {
    for (const [month, count] of Object.entries(comp.monthly_activity)) {
      totals[month] = (totals[month] ?? 0) + count;
    }
  }
  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6) // últimos 6 meses
    .map(([month, count]) => ({ month, count }));
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("es", { month: "short", year: "2-digit" });
}

export default function MarketSeasonality({ competitors }: Props) {
  const monthly = aggregateMonthly(competitors);
  if (monthly.length === 0) return null;

  const max = Math.max(...monthly.map((m) => m.count), 1);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Cuándo pauta el segmento</h3>
      <div className="space-y-1">
        {monthly.map(({ month, count }) => (
          <div key={month} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12 shrink-0">{formatMonth(month)}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{count}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Ads publicados por el segmento en los últimos 6 meses.
      </p>
    </div>
  );
}
