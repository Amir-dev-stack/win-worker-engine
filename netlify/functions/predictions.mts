import { requireAuth } from "../lib/auth.mts";
import { list } from "../lib/store.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const records = await list<any>("predictions", 500);
  const url = new URL(req.url);
  if (url.searchParams.get("includeInvalid") === "true") {
    return Response.json(records, { headers: { "cache-control": "no-store" } });
  }

  // The dashboard's default "Frozen forecasts" collection contains only
  // evidence-complete predictions. Legacy/failed records remain available
  // through the authenticated includeInvalid=true audit view.
  const valid = records.filter((prediction: any) =>
    Number.isFinite(prediction?.riskAssessment?.overallRiskPercent) &&
    prediction.riskAssessment.overallRiskPercent >= 0 &&
    prediction.riskAssessment.overallRiskPercent <= 100 &&
    prediction.workerNetworkSummary?.completedDepartmentReports === 8 &&
    prediction.workerNetworkSummary?.completedDebateReports === 4 &&
    prediction.libraryReviewGate?.status === "passed" &&
    prediction.riskAssessmentGate?.status !== "failed"
  );

  return Response.json(valid, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/predictions" };
