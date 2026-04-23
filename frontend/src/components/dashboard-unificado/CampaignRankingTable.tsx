import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Row {
  campaign_name?: string;
  spend?: string | number;
  ctr?: string | number;
  cpm?: string | number;
  cpa?: number | null;
  roas?: number | null;
}

const EMPTY_PUBLICATION_RE = /^(?:publicaci[oó]n:\s*)?["“”'`]\s*["“”'`]$/i;
function safeCampaignName(name: string | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw || EMPTY_PUBLICATION_RE.test(raw)) return "Campaña sin nombre";
  return raw;
}

export default function CampaignRankingTable({ rows }: { rows: Row[] }) {
  const grouped = Object.values(
    rows.reduce<Record<string, Row>>((acc, row) => {
      const key = safeCampaignName(row.campaign_name);
      const spend = Number(row.spend ?? 0);
      if (!acc[key]) acc[key] = { campaign_name: key, spend: 0, ctr: 0, cpm: 0, cpa: null, roas: null };
      acc[key].spend = Number(acc[key].spend ?? 0) + spend;
      return acc;
    }, {})
  ).sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0));

  return (
    <Card>
      <CardHeader><CardTitle>Ranking campanas</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Campana</TableHead><TableHead className="text-right">Gasto</TableHead></TableRow></TableHeader>
          <TableBody>
            {grouped.map((row) => (
              <TableRow key={row.campaign_name}>
                <TableCell>{row.campaign_name}</TableCell>
                <TableCell className="text-right">${Number(row.spend ?? 0).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

