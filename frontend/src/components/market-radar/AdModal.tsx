// frontend/src/components/market-radar/AdModal.tsx
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  ad: CompetitorAdItem;
  isOpen: boolean;
  onClose: () => void;
}

export function AdModal({ ad, isOpen, onClose }: Props) {
  const startDate = ad.ad_delivery_start_time
    ? new Date(ad.ad_delivery_start_time).toLocaleDateString("es-ES")
    : "Desconocida";
  const endDate = ad.ad_delivery_stop_time
    ? new Date(ad.ad_delivery_stop_time).toLocaleDateString("es-ES")
    : "En curso";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Detalles del Anuncio</DialogTitle>
          <DialogClose asChild>
            <button className="absolute right-4 top-4">
              <X className="w-4 h-4" />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className="space-y-4">
          {/* Visual */}
          {ad.ad_snapshot_url && (
            <div>
              <img
                src={ad.ad_snapshot_url}
                alt="ad"
                className="w-full rounded border"
                onError={(e) => {
                  e.currentTarget.alt = "Sin imagen disponible";
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}

          {/* Textos */}
          <div className="space-y-2">
            {ad.ad_creative_bodies?.map((body, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-muted-foreground">Texto</p>
                <p className="text-sm">{body}</p>
              </div>
            ))}

            {ad.ad_creative_link_titles?.[0] && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Título</p>
                <p className="text-sm">{ad.ad_creative_link_titles[0]}</p>
              </div>
            )}

            {ad.ad_creative_link_descriptions?.[0] && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Descripción</p>
                <p className="text-sm">{ad.ad_creative_link_descriptions[0]}</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Fechas de campaña</p>
              <p className="text-sm">
                {startDate} → {endDate}
              </p>
            </div>

            {ad.publisher_platforms && ad.publisher_platforms.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Plataformas</p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {ad.publisher_platforms.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {ad.languages && ad.languages.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Idiomas</p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {ad.languages.map((lang) => (
                    <Badge key={lang} variant="secondary" className="text-xs">
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
