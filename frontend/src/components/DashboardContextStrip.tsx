import { dashboardPeriodSummary } from "@/lib/formatDashboardContext";

export interface DashboardContextStripProps {
  datePreset: string;
  dateStart: string | null | undefined;
  dateStop: string | null | undefined;
  currencyCode: string | null | undefined;
  attributionWindowLabel: string | null;
}

export default function DashboardContextStrip({
  datePreset,
  dateStart,
  dateStop,
  currencyCode,
  attributionWindowLabel,
}: DashboardContextStripProps) {
  const period = dashboardPeriodSummary(datePreset, dateStart, dateStop);
  const currency = currencyCode?.trim() || "—";
  const attr = attributionWindowLabel?.trim() || "—";

  return (
    <div
      role="note"
      className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
    >
      Fechas del informe: <span className="text-foreground/90">{period}</span>
      {" · "}
      Moneda de los importes: <span className="text-foreground/90 tabular-nums">{currency}</span>
      {" · "}
      Cómo se atribuyen ventas y conversiones a los anuncios:{" "}
      <span className="text-foreground/90">{attr}</span>
    </div>
  );
}
