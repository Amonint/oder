// frontend/src/components/market-radar/CompetitorCard.tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdPreview } from "./AdPreview";
import type { MarketRadarExtendedCompetitor } from "@/api/client";

interface Props {
  competitor: MarketRadarExtendedCompetitor;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

export function CompetitorCard({ competitor, onSelectCompetitor }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const confidenceChipClass =
    competitor.province_confidence >= 0.8
      ? "border-transparent bg-[#56048C] text-white"
      : competitor.province_confidence >= 0.5
        ? "border-transparent bg-[#E86E53] text-white"
        : "border-transparent bg-[#F2B441] text-[#150140]";

  return (
    <div className="border rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">#{competitor.rank}</span>
            <p className="text-sm font-semibold text-foreground">{competitor.name}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {competitor.province ? (
              <Badge variant="default" className={confidenceChipClass}>
                {competitor.province} • {(competitor.province_confidence * 100).toFixed(0)}%
              </Badge>
            ) : (
              <Badge
                variant="default"
                className="border-transparent bg-[#150140] text-white"
              >
                Ubicación desconocida
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectCompetitor(competitor.page_id, competitor.name)}
        >
          →
        </Button>
      </div>

      {/* Metadata */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>
          {competitor.active_ads} activos / {competitor.total_ads} total
        </span>
        <span>{competitor.platforms.join(", ")}</span>
        <span>{competitor.languages.join(", ")}</span>
      </div>

      {/* Expandable ads section */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          {isExpanded ? "Ocultar anuncios" : `Ver ${competitor.ads.length} anuncios`}
        </Button>

        {isExpanded && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {competitor.ads.map((ad) => (
              <AdPreview key={ad.id} ad={ad} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
