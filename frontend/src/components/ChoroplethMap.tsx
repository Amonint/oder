import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChoroplethMapProps {
  data: Array<{ region_name: string; spend: number; impressions?: number }>;
  metric?: "spend" | "impressions";
}

function toGadmName(regionName: string): string {
  const MAP: Record<string, string> = {
    "Manabí": "Manabí",
    "Los Ríos": "Los Ríos",
    "Bolívar": "Bolívar",
    "Cañar": "Cañar",
    "Sucumbíos": "Sucumbíos",
    "Galápagos": "Galápagos",
    "Morona Santiago": "Morona-Santiago",
    "Zamora Chinchipe": "Zamora-Chinchipe",
    "Santo Domingo": "Santo Domingo de los Tsáchilas",
  };
  return MAP[regionName] ?? regionName;
}

export default function ChoroplethMap({ data, metric = "spend" }: ChoroplethMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);

  // Inicializar mapa una sola vez
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-78.1834, -1.8312],
      zoom: 5.5,
    });

    mapRef.current = map;

    map.on("load", () => {
      mapReadyRef.current = true;
      // Disparar evento custom para que el efecto de datos pueda actuar
      map.fire("data-ready" as any);
    });

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar capas cada vez que cambian data o metric
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function applyData() {
      if (!map) return;
      // Eliminar capas y source previos si existen
      if (map.getLayer("ecuador-fill")) map.removeLayer("ecuador-fill");
      if (map.getLayer("ecuador-outline")) map.removeLayer("ecuador-outline");
      if (map.getSource("ecuador")) map.removeSource("ecuador");

      const lookup: Record<string, number> = {};
      for (const row of data) {
        const name = toGadmName(row.region_name);
        lookup[name] = metric === "spend" ? row.spend : (row.impressions ?? 0);
      }
      const values = Object.values(lookup);
      const maxVal = values.length > 0 ? Math.max(Math.max(...values), 0.01) : 1;

      fetch("/ecuador-provinces.geojson")
        .then((r) => r.json())
        .then((geojson) => {
          if (!map) return;
          for (const feature of geojson.features) {
            const name = feature.properties?.NAME_1 ?? "";
            feature.properties._value = lookup[name] ?? 0;
          }

          map.addSource("ecuador", { type: "geojson", data: geojson });

          map.addLayer({
            id: "ecuador-fill",
            type: "fill",
            source: "ecuador",
            paint: {
              "fill-color": [
                "interpolate", ["linear"], ["get", "_value"],
                0, "#e0f2fe",
                maxVal * 0.25, "#7dd3fc",
                maxVal * 0.6, "#2563eb",
                maxVal, "#1e3a8a",
              ],
              "fill-opacity": 0.75,
            },
          });

          map.addLayer({
            id: "ecuador-outline",
            type: "line",
            source: "ecuador",
            paint: { "line-color": "#1e40af", "line-width": 0.8 },
          });
        })
        .catch(() => {});
    }

    if (mapReadyRef.current) {
      applyData();
    } else {
      map.once("data-ready" as any, applyData);
    }
  }, [data, metric]);

  // Popup separado (no depende de data)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const onMove = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties as Record<string, unknown>;
      const name = String(props.NAME_1 ?? "");
      const val = Number(props._value ?? 0);
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${name}</strong><br/>` +
          (metric === "spend"
            ? `Gasto: $${val.toFixed(2)}`
            : `Impresiones: ${val.toLocaleString("es")}`),
        )
        .addTo(map);
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };

    map.on("mousemove", "ecuador-fill", onMove);
    map.on("mouseleave", "ecuador-fill", onLeave);

    return () => {
      map.off("mousemove", "ecuador-fill", onMove);
      map.off("mouseleave", "ecuador-fill", onLeave);
      popup.remove();
    };
  }, [metric]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapa de {metric === "spend" ? "Gasto" : "Impresiones"} por Provincia</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={mapContainer} className="h-80 w-full rounded-b-lg" />
      </CardContent>
    </Card>
  );
}
