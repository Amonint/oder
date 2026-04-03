// frontend/src/App.tsx
import { useQuery } from "@tanstack/react-query";
import { fetchAdAccounts, type AdAccount } from "./api/client";

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAdAccounts,
  });

  if (isLoading) return <p>Cargando cuentas…</p>;
  if (isError) return <p>Error al cargar cuentas.</p>;

  return (
    <div>
      <h1>Meta Ads — Cuentas</h1>
      <ul>
        {data?.data.map((a: AdAccount) => (
          <li key={a.id}>
            <strong>{a.name}</strong> ({a.id}) — {a.currency ?? "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}
