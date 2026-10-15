import { requireProfile } from "@/lib/auth";
import ResultsClient from "./ResultsClient";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  await requireProfile();
  return <ResultsClient />;
}
