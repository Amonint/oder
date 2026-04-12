// frontend/src/components/market-radar/TopAdvertisersSection.tsx
import { CompetitorCard } from "./CompetitorCard";
import type { MarketRadarExtendedCompetitor } from "@/api/client";

interface Props {
  competitors: MarketRadarExtendedCompetitor[];
  title: string;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

export function TopAdvertisersSection({ competitors, title, onSelectCompetitor }: Props) {
  if (competitors.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">No competitors found in this category.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {competitors.map((competitor) => (
          <CompetitorCard
            key={competitor.page_id}
            competitor={competitor}
            onSelectCompetitor={onSelectCompetitor}
          />
        ))}
      </div>
    </div>
  );
}
