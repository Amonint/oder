import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { id: string; name: string; inferred?: boolean };

interface Props {
  datePreset: string;
  onDatePresetChange: (value: string) => void;
  campaignValue: string;
  adsetValue: string;
  adValue: string;
  onCampaignChange: (value: string) => void;
  onAdsetChange: (value: string) => void;
  onAdChange: (value: string) => void;
  campaignOptions: Option[];
  adsetOptions: Option[];
  adOptions: Option[];
  onOpenCustomDate: () => void;
}

const ALL = "__all__";

export default function GlobalFilterBar(props: Props) {
  return (
    <div className="rounded-lg border p-3 flex flex-wrap items-center gap-2">
      <Select value={props.datePreset} onValueChange={(v) => (v === "custom" ? props.onOpenCustomDate() : props.onDatePresetChange(v))}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Periodo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoy</SelectItem>
          <SelectItem value="last_7d">7 dias</SelectItem>
          <SelectItem value="last_30d">30 dias</SelectItem>
          <SelectItem value="last_90d">90 dias</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
          <SelectItem value="maximum">Maximo</SelectItem>
        </SelectContent>
      </Select>
      <Select value={props.campaignValue} onValueChange={props.onCampaignChange}>
        <SelectTrigger className="w-[220px]"><SelectValue placeholder="Campana" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las campanas</SelectItem>
          {props.campaignOptions.map((item) => (
            <SelectItem key={item.id} value={item.id}>{item.name || item.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.adsetValue} onValueChange={props.onAdsetChange}>
        <SelectTrigger className="w-[220px]"><SelectValue placeholder="Ad set" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los ad sets</SelectItem>
          {props.adsetOptions.map((item) => (
            <SelectItem key={item.id} value={item.id}>{item.name || item.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.adValue} onValueChange={props.onAdChange}>
        <SelectTrigger className="w-[220px]"><SelectValue placeholder="Anuncio" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los anuncios</SelectItem>
          {props.adOptions.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <span className="inline-flex items-center gap-2">
                <span>{item.name || item.id}</span>
                {item.inferred ? (
                  <span className="rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                    Nombre inferido
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={props.onOpenCustomDate}>Rango personalizado</Button>
    </div>
  );
}

