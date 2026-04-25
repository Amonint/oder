import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  selectedCampaign?: string | null;
  selectedAdset?: string | null;
  selectedAd?: string | null;
}

export default function AdsetDiagnosticView({ selectedCampaign, selectedAdset, selectedAd }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contexto de filtro (conjunto)</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-1">
        <p>Campaña: {selectedCampaign ?? "Todas"}</p>
        <p>Conjunto: {selectedAdset ?? "Todos"}</p>
        <p>Anuncio: {selectedAd ?? "Todos"}</p>
        <p>
          Aquí solo se muestra el alcance del filtro. Para saturación o segmentación revisa audiencia, geo y
          placements; no hay reglas automáticas de pausa/escala en esta tarjeta.
        </p>
      </CardContent>
    </Card>
  );
}

