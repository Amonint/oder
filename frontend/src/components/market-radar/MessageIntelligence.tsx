// frontend/src/components/market-radar/MessageIntelligence.tsx

interface Props {
  topWords: { word: string; count: number }[];
}

export default function MessageIntelligence({ topWords }: Props) {
  if (topWords.length === 0) return null;

  const max = Math.max(...topWords.map((w) => w.count), 1);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Qué dice el mercado</h3>
      <p className="text-xs text-muted-foreground">
        Palabras más frecuentes en los anuncios del segmento.
      </p>
      <div className="space-y-1">
        {topWords.slice(0, 8).map(({ word, count }) => (
          <div key={word} className="flex items-center gap-2">
            <span className="text-xs w-28 shrink-0 truncate font-medium">{word}</span>
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary/70 h-1.5 rounded-full"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-6 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
