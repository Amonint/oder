import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  selectedCampaign?: string | null;
  selectedAdset?: string | null;
  selectedAd?: string | null;
}

export default function AdsetDiagnosticView({ selectedCampaign, selectedAdset, selectedAd }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>Diagnostico ad set</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-1">
        <p>Campana: {selectedCampaign ?? "Todas"}</p>
        <p>Ad set: {selectedAdset ?? "Todos"}</p>
        <p>Anuncio: {selectedAd ?? "Todos"}</p>
        <p>Usa las vistas de audiencia/geo/placement para identificar segmentacion o saturacion.</p>
      </CardContent>
    </Card>
  );
}

