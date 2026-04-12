import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import { STATUS_DOT, type SemaphoreStatus } from "@/lib/semaphoreRules";

interface SemaphoreKpiCardProps {
  label: string;
  value: string;
  tooltip: string;
  status: SemaphoreStatus;
  sub?: string;
}

export default function SemaphoreKpiCard({
  label,
  value,
  tooltip,
  status,
  sub,
}: SemaphoreKpiCardProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            {label}
            <InfoTooltip text={tooltip} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
