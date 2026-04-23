import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { dashboardChartColor } from "@/lib/dashboardColors";

interface SpendSparklineProps {
  data: { date: string; spend: number }[];
  legend?: string;
}

/** Mini serie de gasto (A6 / Resumen). */
export default function SpendSparkline({ data, legend = "Gasto diario" }: SpendSparklineProps) {
  if (data.length < 2) return null;
  const last = data.slice(-21);
  return (
    <div className="w-full space-y-1">
      <p className="text-muted-foreground inline-flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: dashboardChartColor(0) }}
        />
        {legend}
      </p>
      <ResponsiveContainer width="100%" height={44}>
        <LineChart data={last} margin={{ left: 0, right: 0, top: 2, bottom: 0 }}>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <span className="rounded border bg-background px-1.5 py-0.5 text-[10px] tabular-nums shadow">
                  {String(payload[0].payload.date)} · ${Number(payload[0].value).toFixed(0)}
                </span>
              ) : null
            }
          />
          <Line
            type="monotone"
            dataKey="spend"
            stroke={dashboardChartColor(0)}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
