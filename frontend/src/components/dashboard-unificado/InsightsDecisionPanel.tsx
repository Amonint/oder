import { AlertTriangle, Info, Siren } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InsightItem } from "@/lib/dashboardDiagnostics";

interface Props {
  insights: InsightItem[];
}

function iconFor(severity: InsightItem["severity"]) {
  if (severity === "high") return <Siren className="h-4 w-4" />;
  if (severity === "medium") return <AlertTriangle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

export default function InsightsDecisionPanel({ insights }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Insights y decisiones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin alertas relevantes en este periodo.</p>
        ) : (
          insights.map((insight, idx) => (
            <div key={idx} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  {iconFor(insight.severity)}
                  {insight.finding}
                </p>
                <Badge variant="outline">{insight.severity}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{insight.evidence.join(" · ")}</p>
              <p className="text-sm">{insight.recommendation}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

