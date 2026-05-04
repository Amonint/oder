import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Info } from "lucide-react"

interface InfoTooltipProps {
  text: string
}

/** Cada instancia trae su Provider para evitar fallos de contexto (p. ej. doble copia de React o barrel `radix-ui`). */
export default function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help text-muted-foreground/60 hover:text-muted-foreground transition-colors ml-1 align-middle">
            <Info size={13} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="leading-snug">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
