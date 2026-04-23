import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreativePerformanceView({ totalAds }: { totalAds: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>Creatividad</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>Anuncios analizados: {totalAds}</p>
        <p>Combina esta vista con Fatiga Creativa para detectar piezas a pausar o escalar.</p>
      </CardContent>
    </Card>
  );
}

