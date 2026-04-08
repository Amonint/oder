import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface DateRangePickerModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (start: string, end: string) => void;
  initialStart?: string;
  initialEnd?: string;
}

export default function DateRangePickerModal({
  open,
  onClose,
  onApply,
  initialStart,
  initialEnd,
}: DateRangePickerModalProps) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (initialStart && initialEnd) {
      return {
        from: new Date(initialStart + "T00:00:00"),
        to: new Date(initialEnd + "T00:00:00"),
      };
    }
    return undefined;
  });

  const isValid =
    range?.from != null &&
    range?.to != null &&
    range.from <= range.to;

  function handleApply() {
    if (!isValid || !range?.from || !range?.to) return;
    onApply(
      format(range.from, "yyyy-MM-dd"),
      format(range.to, "yyyy-MM-dd"),
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Seleccionar rango de fechas</DialogTitle>
        </DialogHeader>
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          locale={es}
          numberOfMonths={1}
          toDate={new Date()}
        />
        {range?.from && range?.to && !isValid && (
          <p className="text-destructive text-xs">
            La fecha de inicio debe ser menor o igual a la fecha fin.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={!isValid} onClick={handleApply}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
