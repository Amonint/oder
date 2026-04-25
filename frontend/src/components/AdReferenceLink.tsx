import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdReferenceLinkProps = {
  href: string | null | undefined;
  compact?: boolean;
  className?: string;
  /**
   * Evita que el click burbujee (útil dentro de filas clicables).
   * Default: true.
   */
  stopPropagation?: boolean;
  /**
   * Texto del enlace.
   * Default: "Ver referencia".
   */
  label?: string;
};

export function AdReferenceLink({
  href,
  compact = false,
  className,
  stopPropagation = true,
  label = "Ver referencia",
}: AdReferenceLinkProps) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-primary hover:underline",
        compact ? "text-[11px]" : "text-xs",
        className,
      )}
      onClick={
        stopPropagation
          ? (e) => {
              e.stopPropagation();
            }
          : undefined
      }
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

