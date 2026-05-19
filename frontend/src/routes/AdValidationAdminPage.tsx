import { useQuery, useQueryClient } from "@tanstack/react-query";
import StudyCreateForm from "@/components/ad-validation/StudyCreateForm";
import StudyTable from "@/components/ad-validation/StudyTable";
import {
  listAdValidationStudies,
  type AdValidationStudy,
} from "@/api/adValidation";

const QUERY_KEY = ["ad-validation-studies"] as const;

export default function AdValidationAdminPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listAdValidationStudies,
  });

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Admin: Validación de anuncios</h1>
      <StudyCreateForm
        onCreated={(study: AdValidationStudy) => {
          queryClient.setQueryData<AdValidationStudy[]>(QUERY_KEY, (prev) => {
            if (!prev) return [study];
            return [study, ...prev];
          });
        }}
      />
      {isLoading ? <p className="text-sm text-slate-600">Cargando...</p> : null}
      {error ? (
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Error cargando estudios"}
        </p>
      ) : null}
      <StudyTable studies={data} />
    </section>
  );
}
