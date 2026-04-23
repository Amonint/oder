import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  summary: Record<string, number>;
  cpa?: number | null;
  roas?: number | null;
}

export default function ExecutiveSummary({ summary, cpa, roas }: Props) {
  const rawCpr = Number(summary.cost_per_result ?? 0);
  const effectiveCpr = rawCpr > 0 ? rawCpr : cpa != null && cpa > 0 ? cpa : 0;
  const entries = [
    ["spend", summary.spend ?? 0],
    ["impressions", summary.impressions ?? 0],
    ["reach", summary.reach ?? 0],
    ["frequency", summary.frequency ?? 0],
    ["ctr", summary.ctr ?? 0],
    ["cpc", summary.cpc ?? 0],
    ["cpm", summary.cpm ?? 0],
    ["cost_per_result (efectivo si Meta=0)", effectiveCpr],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen ejecutivo</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {entries.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-semibold">{Number(value).toLocaleString("es")}</p>
          </div>
        ))}
        <div>
          <p className="text-xs text-muted-foreground">cpa</p>
          <p className="font-semibold">{cpa != null ? cpa.toFixed(2) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">roas</p>
          <p className="font-semibold">{roas != null ? `${roas.toFixed(2)}x` : "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

