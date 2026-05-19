import { type FormEvent, useState } from "react";
import { createAdValidationStudy, type AdValidationStudy } from "@/api/adValidation";

interface StudyCreateFormProps {
  onCreated: (study: AdValidationStudy) => void;
}

export default function StudyCreateForm({ onCreated }: StudyCreateFormProps) {
  const [name, setName] = useState("Nuevo estudio");
  const [imageUrl, setImageUrl] = useState("https://cdn.example/ad.png");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      const created = await createAdValidationStudy({
        name,
        image_url: imageUrl,
        image_width: 1080,
        image_height: 1080,
      });
      onCreated(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo crear estudio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 rounded border p-3">
      <h2 className="text-sm font-semibold">Crear estudio</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
        placeholder="Nombre del estudio"
        required
      />
      <input
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
        placeholder="URL imagen creatividad"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? "Creando..." : "Crear"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
