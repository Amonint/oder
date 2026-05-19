import { useEffect, useMemo, useState } from "react";
import maplibregl, {
  type GeoJSONSourceSpecification,
  type LayerSpecification,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from "maplibre-gl";
import type { GeoInsightRow, GeoMetadata } from "@/api/client";
import { AdReferenceLink } from "@/components/AdReferenceLink";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Map as UiMap, MapControls, useMap } from "@/components/ui/map";
import { clearMapArtifactsSafely } from "@/lib/maplibreCleanup";

type ProvinceMetric =
  | "impressions"
  | "clicks"
  | "spend"
  | "reach"
  | "cpa"
  | "results";

interface ProvinceMapProps {
  data: GeoInsightRow[];
  metadata: GeoMetadata;
  metric?: ProvinceMetric;
  minSpendUsd?: number;
  extraCaption?: string;
  adReferenceUrl?: string | null;
}

type ProvinceMetricState = {
  value: number;
  insufficient: boolean;
  hasData: boolean;
};

type EcuadorGeoJson = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

const SOURCE_ID = "ecuador-provinces-source";
const FILL_LAYER_ID = "ecuador-provinces-fill";
const OUTLINE_LAYER_ID = "ecuador-provinces-outline";
const INSUFFICIENT_FILL = "#94a3b8";
const NO_DATA_FILL = "#e5e7eb";

const PROVINCE_NAME_MAP: Record<string, string> = {
  "morona santiago": "Morona-Santiago",
  "morona-santiago": "Morona-Santiago",
  "morona santiago province": "Morona-Santiago",
  "zamora chinchipe": "Zamora-Chinchipe",
  "zamora-chinchipe": "Zamora-Chinchipe",
  "zamora chinchipe province": "Zamora-Chinchipe",
  "santo domingo": "Santo Domingo de los Tsáchilas",
  "santo domingo de los tsachilas": "Santo Domingo de los Tsáchilas",
  "santo domingo de los tsachilas province": "Santo Domingo de los Tsáchilas",
  "los rios": "Los Ríos",
  "manabi": "Manabí",
  "cañar": "Cañar",
  "canar": "Cañar",
  "sucumbios": "Sucumbíos",
  "bolivar": "Bolívar",
  "galapagos": "Galápagos",
};

function normalizeProvinceName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(provincia|province|de|del)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toGadmProvinceName(name: string): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  const normalized = normalizeProvinceName(raw);
  return PROVINCE_NAME_MAP[normalized] ?? raw;
}

function spendUsd(row: GeoInsightRow): number {
  const n = parseFloat(String(row.spend ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function isCpaInsufficient(row: GeoInsightRow, minSpendUsd: number): boolean {
  if (spendUsd(row) < minSpendUsd) return true;
  const cpa = row.cpa;
  if (cpa == null || !Number.isFinite(cpa) || cpa <= 0) return true;
  return false;
}

function metricValue(row: GeoInsightRow, metric: ProvinceMetric): number {
  if (metric === "spend") return spendUsd(row);
  if (metric === "impressions") return Number(row.impressions ?? 0);
  if (metric === "clicks") return Number(row.clicks ?? 0);
  if (metric === "reach") return Number(row.reach ?? 0);
  if (metric === "results") return Number(row.results ?? 0);
  return Number(row.cpa ?? 0);
}

function metricTitle(metric: ProvinceMetric): string {
  if (metric === "impressions") return "Impresiones";
  if (metric === "clicks") return "Clics";
  if (metric === "spend") return "Gasto";
  if (metric === "reach") return "Alcance";
  if (metric === "results") return "Resultados";
  return "CPA";
}

function formatMetric(metric: ProvinceMetric, value: number, insufficient: boolean): string {
  if (insufficient) return "Datos insuficientes";
  if (metric === "spend" || metric === "cpa") return `$${value.toFixed(2)}`;
  if (metric === "results") return Math.round(value).toLocaleString("es");
  return value.toLocaleString("es");
}

function buildMetricLookup(
  rows: GeoInsightRow[],
  metric: ProvinceMetric,
  minSpendUsd: number,
): Map<string, ProvinceMetricState> {
  const lookup = new Map<string, ProvinceMetricState>();

  for (const row of rows) {
    const province = toGadmProvinceName(row.region_name || row.region || "");
    if (!province) continue;

    let insufficient = false;
    let value = 0;

    if (metric === "cpa") {
      insufficient = isCpaInsufficient(row, minSpendUsd);
      value = insufficient ? 0 : Number(row.cpa ?? 0);
    } else if (metric === "results") {
      insufficient = row.results == null;
      value = insufficient ? 0 : Number(row.results ?? 0);
    } else {
      value = metricValue(row, metric);
    }

    const current = lookup.get(province);
    if (!current) {
      lookup.set(province, { value, insufficient, hasData: true });
      continue;
    }

    if (metric === "cpa") {
      if (current.insufficient && !insufficient) {
        lookup.set(province, { value, insufficient: false, hasData: true });
      } else if (!current.insufficient && !insufficient) {
        lookup.set(province, {
          value: (current.value + value) / 2,
          insufficient: false,
          hasData: true,
        });
      }
      continue;
    }

    lookup.set(province, {
      value: current.value + value,
      insufficient: current.insufficient && insufficient,
      hasData: true,
    });
  }

  return lookup;
}

function EcuadorProvinceLayers({
  rows,
  metric,
  minSpendUsd,
  onGeoJsonError,
}: {
  rows: GeoInsightRow[];
  metric: ProvinceMetric;
  minSpendUsd: number;
  onGeoJsonError: (value: boolean) => void;
}) {
  const { map, isLoaded } = useMap();
  const metricLookup = useMemo(
    () => buildMetricLookup(rows, metric, minSpendUsd),
    [rows, metric, minSpendUsd],
  );

  useEffect(() => {
    if (!map || !isLoaded) return;
    const mapInstance = map;

    let cancelled = false;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    function clearMapLayers() {
      clearMapArtifactsSafely(mapInstance, {
        layerIds: [FILL_LAYER_ID, OUTLINE_LAYER_ID],
        sourceId: SOURCE_ID,
      });
    }

    function cleanupHandlers() {
      mapInstance.getCanvas().style.cursor = "";
      popup.remove();
      mapInstance.off("mousemove", FILL_LAYER_ID, handleMouseMove);
      mapInstance.off("mouseleave", FILL_LAYER_ID, handleMouseLeave);
    }

    function handleMouseMove(
      e: MapMouseEvent & {
        features?: MapGeoJSONFeature[];
      },
    ) {
      if (!e.features?.length) return;
      const props = e.features[0].properties as Record<string, unknown>;
      const province = String(props.NAME_1 ?? "Provincia");
      const value = Number(props._value ?? 0);
      const insufficient = Boolean(props._insufficient ?? false);
      mapInstance.getCanvas().style.cursor = "pointer";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${province}</strong><br/>${metricTitle(metric)}: ${formatMetric(metric, value, insufficient)}`,
        )
        .addTo(mapInstance);
    }

    function handleMouseLeave() {
      mapInstance.getCanvas().style.cursor = "";
      popup.remove();
    }

    async function drawLayer() {
      onGeoJsonError(false);
      clearMapLayers();

      try {
        const response = await fetch("/ecuador-provinces.geojson", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("GeoJSON no disponible");
        const geojson = (await response.json()) as EcuadorGeoJson;
        if (cancelled) return;

        const validValues: number[] = [];
        for (const feature of geojson.features) {
          const featureProps = (feature.properties ??= {});
          const name = String(featureProps.NAME_1 ?? "");
          const match = metricLookup.get(name);
          featureProps._value = match?.value ?? 0;
          featureProps._insufficient = match?.insufficient ?? false;
          featureProps._hasData = match?.hasData ?? false;
          if (match && !match.insufficient && match.value > 0) {
            validValues.push(match.value);
          }
        }

        const maxValue = validValues.length > 0 ? Math.max(...validValues) : 1;

        mapInstance.addSource(SOURCE_ID, {
          type: "geojson",
          data: geojson,
        } satisfies GeoJSONSourceSpecification);

        mapInstance.addLayer({
          id: FILL_LAYER_ID,
          type: "fill",
          source: SOURCE_ID,
          paint: {
            "fill-color": [
              "case",
              ["!", ["get", "_hasData"]],
              NO_DATA_FILL,
              ["get", "_insufficient"],
              INSUFFICIENT_FILL,
              [
                "interpolate",
                ["linear"],
                ["get", "_value"],
                0,
                "#dbeafe",
                maxValue * 0.4,
                "#60a5fa",
                maxValue * 0.75,
                "#2563eb",
                maxValue,
                "#1e3a8a",
              ],
            ],
            "fill-opacity": 0.85,
          },
        } as LayerSpecification);

        mapInstance.addLayer({
          id: OUTLINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": "#1e40af",
            "line-width": 0.9,
          },
        } as LayerSpecification);

        mapInstance.on("mousemove", FILL_LAYER_ID, handleMouseMove);
        mapInstance.on("mouseleave", FILL_LAYER_ID, handleMouseLeave);
      } catch {
        if (!cancelled) onGeoJsonError(true);
      }
    }

    drawLayer();

    return () => {
      cancelled = true;
      cleanupHandlers();
      clearMapLayers();
    };
  }, [isLoaded, map, metric, metricLookup, minSpendUsd, onGeoJsonError]);

  return null;
}

export default function EcuadorProvinceMap({
  data,
  metadata,
  metric = "impressions",
  minSpendUsd = 25,
  extraCaption,
  adReferenceUrl,
}: ProvinceMapProps) {
  const [geoJsonError, setGeoJsonError] = useState(false);

  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertDescription>No hay datos geográficos disponibles.</AlertDescription>
      </Alert>
    );
  }

  const alignmentNote =
    metric === "cpa" || metric === "results"
      ? " CPA y resultados usan la misma lógica que la tabla."
      : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapa de provincias (Ecuador) — {metricTitle(metric)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {metadata.scope === "account" ? "Toda la cuenta" : `Anuncio: ${metadata.ad_id}`} •{" "}
          {metadata.total_rows} regiones.
          {alignmentNote}
          {extraCaption ? ` ${extraCaption}` : null}
        </p>
        {metadata.scope === "ad" ? (
          <AdReferenceLink href={adReferenceUrl ?? null} />
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {geoJsonError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo cargar el mapa base de provincias</AlertTitle>
            <AlertDescription>
              Revisa que exista `public/ecuador-provinces.geojson`.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="h-80 w-full overflow-hidden rounded-lg border">
          <UiMap
            center={[-78.1834, -1.8312]}
            zoom={5.5}
            minZoom={4.5}
            maxZoom={11}
            maxPitch={0}
            dragRotate={false}
            touchZoomRotate={false}
            className="h-full w-full"
            theme="light"
          >
            <MapControls position="top-right" showZoom />
            <EcuadorProvinceLayers
              rows={data}
              metric={metric}
              minSpendUsd={minSpendUsd}
              onGeoJsonError={setGeoJsonError}
            />
          </UiMap>
        </div>
      </CardContent>
    </Card>
  );
}
