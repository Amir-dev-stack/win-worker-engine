import { timingSafeEqual } from "node:crypto";
import {
  WinMLOwnerApprovalRegistryError,
  evaluateWinMLTrainingReadiness,
  getWinMLOwnerTrainingApprovalStatus,
  listWinMLOwnerTrainingApprovalStatuses,
  registerWinMLOwnerTrainingApproval,
  registerWinMLOwnerTrainingRevocation,
  registerWinMLLicenceReviewEvidence
} from "../lib/ml-owner-approval-registry.mts";

const MAX_BODY_BYTES = 64 * 1024;
const noStore = { "cache-control": "no-store" };

function env(name: string): string {
  try { return Netlify.env.get(name) || ""; }
  catch { return ""; }
}

function ownerTokenMatches(req: Request, expected: string): boolean {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const actual = Buffer.from(match[1].trim(), "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && actual.length >= 32 && timingSafeEqual(actual, wanted);
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStore });
}

/**
 * Owner-only approval control plane. It fails closed unless all three protected
 * Netlify variables exist. Request bodies can never supply credentials or keys.
 */
export default async (req: Request) => {
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const ownerToken = env("WIN_ML_OWNER_APPROVAL_TOKEN");
  const publicKeyPem = env("WIN_ML_OWNER_APPROVAL_PUBLIC_KEY");
  const reviewerId = env("WIN_ML_OWNER_REVIEWER_ID");
  if (ownerToken.length < 32 || !publicKeyPem.trim() || !reviewerId.trim()) {
    return response({ error: "owner_approval_control_plane_not_configured" }, 503);
  }
  if (!ownerTokenMatches(req, ownerToken)) return response({ error: "unauthorized" }, 401);
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return response({ error: "application_json_required" }, 415);
  }

  let raw: string;
  try { raw = await req.text(); }
  catch { return response({ error: "request_body_unreadable" }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return response({ error: "request_body_too_large" }, 413);
  }

  let body: any;
  try { body = JSON.parse(raw); }
  catch { return response({ error: "invalid_json" }, 400); }

  const trustedConfig = { publicKeyPem, reviewerId };
  try {
    if (body?.action === "licence_evidence") {
      const result = await registerWinMLLicenceReviewEvidence(body.evidence, trustedConfig);
      return response({ action: "licence_evidence", ...result });
    }
    if (body?.action === "readiness") {
      if (typeof body.datasetId !== "string" || typeof body.approvalId !== "string") {
        return response({ error: "dataset_id_and_approval_id_required" }, 400);
      }
      const result = await evaluateWinMLTrainingReadiness(body.datasetId, body.approvalId, trustedConfig);
      return response({ action: "readiness", ...result });
    }
    if (body?.action === "approve") {
      const result = await registerWinMLOwnerTrainingApproval(body.evidence, trustedConfig);
      return response({ action: "approve", ...result });
    }
    if (body?.action === "revoke") {
      const result = await registerWinMLOwnerTrainingRevocation(body.evidence, trustedConfig);
      return response({ action: "revoke", ...result });
    }
    if (body?.action === "list") {
      const result = await listWinMLOwnerTrainingApprovalStatuses(trustedConfig, body.limit);
      return response({ action: "list", ...result });
    }
    if (body?.action === "status") {
      if (typeof body.approvalId !== "string") return response({ error: "approval_id_required" }, 400);
      const result = await getWinMLOwnerTrainingApprovalStatus(body.approvalId, trustedConfig);
      return response({ action: "status", ...result });
    }
    return response({ error: "unsupported_action" }, 400);
  } catch (error) {
    if (error instanceof WinMLOwnerApprovalRegistryError) {
      const conflict = error.code.includes("conflict") || error.code.includes("already_recorded");
      return response({ error: error.code, details: error.details }, conflict ? 409 : 400);
    }
    return response({ error: "owner_approval_operation_failed" }, 500);
  }
};

export const config = { path: "/api/ml-owner-approval" };
