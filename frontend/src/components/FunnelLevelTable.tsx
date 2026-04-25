import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdReferenceLink } from "@/components/AdReferenceLink";

export interface FunnelLevelRow {
  id: string;
  name: string;
  impressions: number;
  reach: number;
  clicks: number;
  conversations_started: number;
  first_replies: number;
  spend: number;
}

interface FunnelLevelTableProps {
  rows: FunnelLevelRow[];
  level: "campaign" | "ad";
  adReferenceUrlById?: Map<string, string>;
}

function pct(from: number, to: number): string {
  if (from === 0) return "—";
  return `${((to / from) * 100).toFixed(1)}%`;
}

export default function FunnelLevelTable({ rows, level, adReferenceUrlById }: FunnelLevelTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm p-2">
        Sin datos de embudo para {level === "campaign" ? "campañas" : "anuncios"} en este periodo.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Embudo por {level === "campaign" ? "campaña" : "anuncio"}
        </CardTitle>
        <CardDescription>
          Etapas: Impresiones → Alcance → Clics únicos (unique_clicks) → Conv. iniciadas → Respuestas. Tasas entre
          etapas en paréntesis.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">
                  {level === "campaign" ? "Campaña" : "Anuncio"}
                </TableHead>
                <TableHead className="text-right">Impresiones</TableHead>
                <TableHead className="text-right">Alcance</TableHead>
                <TableHead className="text-right">Clics únicos</TableHead>
                <TableHead className="text-right">Conv. iniciadas</TableHead>
                <TableHead className="text-right">Respuestas</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {level === "ad" ? (
                      <AdReferenceLink href={adReferenceUrlById?.get(String(row.id)) ?? null} compact />
                    ) : null}
                    <p className="truncate text-sm font-medium max-w-[220px]">{row.name}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.impressions.toLocaleString("es")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.reach.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.impressions, row.reach)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.clicks.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.reach || row.impressions, row.clicks)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.conversations_started.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.clicks, row.conversations_started)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.first_replies.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.conversations_started, row.first_replies)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    ${row.spend.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
