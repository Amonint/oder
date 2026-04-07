import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { PageRow } from "@/api/client";

interface PageCardProps {
  page: PageRow;
  onClick: () => void;
}

export default function PageCard({ page, onClick }: PageCardProps) {
  const fmtCurrency = (n: number) =>
    n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const fmtNumber = (n: number) => n.toLocaleString("es-EC");

  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onClick}>
      <TableCell className="font-medium">{page.name}</TableCell>
      <TableCell className="text-muted-foreground text-sm">{page.category || "—"}</TableCell>
      <TableCell className="text-right font-mono">{fmtCurrency(page.spend)}</TableCell>
      <TableCell className="text-right font-mono">{fmtNumber(page.impressions)}</TableCell>
    </TableRow>
  );
}
