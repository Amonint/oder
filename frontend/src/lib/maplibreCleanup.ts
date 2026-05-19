type MapArtifactTarget = {
  getStyle?: () => unknown;
  getLayer: (id: string) => unknown;
  removeLayer: (id: string) => void;
  getSource: (id: string) => unknown;
  removeSource: (id: string) => void;
};

type ClearMapArtifactsOptions = {
  layerIds: string[];
  sourceId?: string;
};

export function clearMapArtifactsSafely(
  map: MapArtifactTarget,
  { layerIds, sourceId }: ClearMapArtifactsOptions,
): void {
  if (typeof map.getStyle === "function" && !map.getStyle()) {
    return;
  }

  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }

  if (sourceId && map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}
