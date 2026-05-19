import { Link } from "react-router-dom";
import type { AdValidationStudy } from "@/api/adValidation";

interface StudyTableProps {
  studies: AdValidationStudy[];
}

export default function StudyTable({ studies }: StudyTableProps) {
  if (studies.length === 0) {
    return <p className="text-sm text-slate-600">Sin estudios todavía.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-3 py-2">Estudio</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Link público</th>
          </tr>
        </thead>
        <tbody>
          {studies.map((study) => (
            <tr key={study.id} className="border-t">
              <td className="px-3 py-2">
                <Link
                  to={`/ad-validation/studies/${study.id}`}
                  className="text-sky-700 hover:underline"
                >
                  {study.name}
                </Link>
              </td>
              <td className="px-3 py-2">{study.status}</td>
              <td className="px-3 py-2">
                <code>/ad-validation/public/{study.public_token}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
