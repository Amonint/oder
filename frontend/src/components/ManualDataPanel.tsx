import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { saveManualData, type ManualDataRecord } from "@/api/client";

interface ManualDataPanelProps {
  adAccountId: string;
  campaignId?: string | null;
  existingRecord?: ManualDataRecord | null;
  onSaved: () => void;
}

const FIELD_CONFIG: Array<{
  key: keyof ManualDataRecord;
  label: string;
  type: "number" | "text";
  min?: number;
  step?: number;
  tooltip: string;
}> = [
  { key: "useful_messages", label: "Mensajes útiles / calificados", type: "number", min: 0, tooltip: "Total de conversaciones que tienen potencial de conversión." },
  { key: "accepted_leads", label: "Leads aceptados", type: "number", min: 0, tooltip: "Personas que expresaron interés real y pasaron filtro de calificación." },
  { key: "quotes_sent", label: "Cotizaciones enviadas", type: "number", min: 0, tooltip: "Presupuestos o propuestas enviadas al cliente." },
  { key: "sales_closed", label: "Ventas cerradas", type: "number", min: 0, tooltip: "Conversiones reales en ventas dentro del período." },
  { key: "avg_ticket", label: "Ticket promedio ($)", type: "number", min: 0, step: 0.01, tooltip: "Valor promedio de cada venta cerrada." },
  { key: "estimated_revenue", label: "Ingreso real / estimado ($)", type: "number", min: 0, step: 0.01, tooltip: "Ingresos totales del período. Si no se conoce, se calcula como ventas × ticket." },
  { key: "notes", label: "Observaciones", type: "text", tooltip: "Contexto del equipo comercial: objeciones comunes, calidad del tráfico, etc." },
];

function defaultRecord(accountId: string, campaignId?: string | null): ManualDataRecord {
  return {
    account_id: accountId,
    campaign_id: campaignId ?? null,
    ad_id: null,
    useful_messages: 0,
    accepted_leads: 0,
    quotes_sent: 0,
    sales_closed: 0,
    avg_ticket: 0,
    estimated_revenue: 0,
    notes: "",
  };
}

export default function ManualDataPanel({
  adAccountId,
  campaignId,
  existingRecord,
  onSaved,
}: ManualDataPanelProps) {
  const [form, setForm] = useState<ManualDataRecord>(
    existingRecord ?? defaultRecord(adAccountId, campaignId)
  );
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => saveManualData(adAccountId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-data", adAccountId] });
      onSaved();
    },
  });

  function handleChange(key: keyof ManualDataRecord, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Carga manual de datos comerciales</CardTitle>
        <CardDescription>
          Sin CRM — ingresa resultados reales del equipo de ventas para calcular métricas de cierre.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {FIELD_CONFIG.map((field) => (
          <div key={String(field.key)} className="space-y-1">
            <label className="text-sm text-foreground font-medium" htmlFor={String(field.key)}>
              {field.label}
            </label>
            {field.type === "text" ? (
              <textarea
                id={String(field.key)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
                value={String(form[field.key] ?? "")}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.tooltip}
              />
            ) : (
              <input
                id={String(field.key)}
                type="number"
                min={field.min ?? 0}
                step={field.step ?? 1}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={Number(form[field.key] ?? 0)}
                onChange={(e) => handleChange(field.key, Number(e.target.value))}
              />
            )}
            <p className="text-muted-foreground text-xs">{field.tooltip}</p>
          </div>
        ))}

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertTitle>Error al guardar</AlertTitle>
            <AlertDescription>
              {mutation.error instanceof Error ? mutation.error.message : "Error desconocido"}
            </AlertDescription>
          </Alert>
        )}

        {mutation.isSuccess && (
          <Alert>
            <AlertTitle>Guardado</AlertTitle>
            <AlertDescription>Datos manuales guardados correctamente.</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="w-full"
        >
          {mutation.isPending ? "Guardando…" : "Guardar datos"}
        </Button>
      </CardContent>
    </Card>
  );
}
