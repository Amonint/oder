import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import HeatmapOverlay from "@/components/ad-validation/HeatmapOverlay";
import { getAdValidationDashboard } from "@/api/adValidation";

export default function AdValidationStudyDashboardPage() {
  const { studyId = "" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["ad-validation-dashboard", studyId],
    queryFn: () => getAdValidationDashboard(studyId),
    enabled: studyId.length > 0,
  });

  if (!studyId) {
    return <p className="p-4 text-sm text-red-600">Study ID inválido.</p>;
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard estudio</h1>
        <Link to="/ad-validation" className="text-sm text-sky-700 hover:underline">
          Volver
        </Link>
      </div>
      {isLoading ? <p className="text-sm text-slate-600">Cargando...</p> : null}
      {error ? (
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Error en dashboard"}
        </p>
      ) : null}
      {data ? (
        <>
          <div className="grid gap-2 rounded border p-3 text-sm md:grid-cols-4">
            <div>
              <div className="text-slate-500">Estudio</div>
              <div className="font-medium">{data.study.name}</div>
            </div>
            <div>
              <div className="text-slate-500">Sesiones válidas</div>
              <div className="font-medium">{data.metrics.valid_sessions}</div>
            </div>
            <div>
              <div className="text-slate-500">Confianza</div>
              <div className="font-medium">{data.metrics.confidence_note}</div>
            </div>
            <div>
              <div className="text-slate-500">Heatmap</div>
              <div className="font-medium">
                {data.metrics.show_heatmap ? "Visible" : "Oculto"}
              </div>
            </div>
          </div>
          {data.metrics.show_heatmap && data.heatmap ? (
            <HeatmapOverlay
              grid={data.heatmap.grid}
              imageUrl={data.study.image_url ?? null}
            />
          ) : (
            <p className="text-sm text-slate-600">
              Sin sesiones válidas para mostrar heatmap.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
