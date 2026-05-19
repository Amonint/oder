import { useParams } from "react-router-dom";
import ParticipantFlow from "@/components/ad-validation/ParticipantFlow";

export default function AdValidationParticipantPage() {
  const { token = "" } = useParams();
  if (!token) {
    return <p className="p-4 text-sm text-red-600">Token de estudio inválido.</p>;
  }
  return <ParticipantFlow token={token} />;
}
