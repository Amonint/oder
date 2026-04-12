// frontend/src/components/market-radar/AdPreview.tsx
import { useState } from "react";
import { AdModal } from "./AdModal";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  ad: CompetitorAdItem;
}

export function AdPreview({ ad }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const preview_text = ad.ad_creative_bodies?.[0]?.substring(0, 50) || "Sin texto";
  const media_icon = "🖼";

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="block w-full text-left border rounded p-2 hover:bg-accent transition-colors"
      >
        {ad.ad_snapshot_url ? (
          <img
            src={ad.ad_snapshot_url}
            alt="ad"
            className="w-full h-20 object-cover rounded mb-1"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-20 bg-muted rounded mb-1 flex items-center justify-center text-sm">
            {media_icon}
          </div>
        )}
        <p className="text-xs truncate text-muted-foreground">{preview_text}...</p>
      </button>

      <AdModal ad={ad} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
