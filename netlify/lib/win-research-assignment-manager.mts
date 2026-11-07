import { randomUUID } from "node:crypto";
import { getWithMetadata, list, put, putIfMatch, putIfNew } from "./store.mts";
import { rememberResearchSubmission, promoteReviewedResearchMemory } from "./win-research-memory.mts";

const ASSIGNMENTS = "library/research-assignments";
const SUBMISSIONS = "library/research-submissions";
const CHALLENGES = "library/research-challenges";
const DIVISIONS = new Set(["R1","R2","R3","R4","R5","R6","R7","R8"]);
const clean = (value: unknown, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const strings = (value: unknown, max = 20, itemMax = 1000) =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.trim())
    .slice(0, max).map(x => x.trim().slice(0, itemMax)) : [];
const nowIso = (nowMs = Date.now()) => new Date(nowMs).toISOString();

export type ResearchAssignment = {
  id: string; title: string; division: string; objective: string; acceptanceCriteria: string[];
  sourceScope: string[]; dataRestrictions: string[]; expectedArtifacts: string[];
  ownerId: string; independentReviewerId: string; status: string; executionMode: string;
  modelCallLimit: number; toolCallLimit: number; budgetCeilingUsd: number;
  createdAt: string; updatedAt: string; dueAt: string | null; leaseId?: string | null;
  leaseExpiresAt?: string | null; assignedAgentId?: string | null; submissionId?: string;
  [key: string]: unknown;
};

function boundedInteger(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : fallback;
}

export async function createResearchAssignment(input: any, ownerId: string, nowMs = Date.now()) {
  const title = clean(input?.title, 180);
  const division = clean(input?.division, 8).toUpperCase();
  const objective = clean(input?.objective, 5000);
  const acceptanceCriteria = strings(input?.acceptanceCriteria, 12, 1000);
  const sourceScope = strings(input?.sourceScope, 20, 500);
  const dataRestrictions = strings(input?.dataRestrictions, 20, 500);
  const expectedArtifacts = strings(input?.expectedArtifacts, 12, 500);
  const independentReviewerId = clean(input?.independentReviewerId, 120);
  if (!title || !DIVISIONS.has(division) || !objective || !acceptanceCriteria.length ||
      !sourceScope.length || !dataRestrictions.length || !expectedArtifacts.length ||
      !ownerId || !independentReviewerId) {
    throw new Error("Assignment requires title, valid R1-R8 division, objective, acceptance criteria, source/data scope, expected artifacts, owner and independent reviewer.");
  }
  const dueAt = clean(input?.dueAt, 80);
  if (dueAt && !Number.isFinite(Date.parse(dueAt))) throw new Error("dueAt must be a valid ISO date.");
  const id = "research-" + randomUUID();
  const assignment: ResearchAssignment = {
    id, title, division, objective, acceptanceCriteria, sourceScope, dataRestrictions, expectedArtifacts,
    ownerId, independentReviewerId, status: "proposed",
    executionMode: "provider_neutral",
    // Task ceilings are configuration only; the executor must reserve against the global WIN ledger before any call.
    modelCallLimit: boundedInteger(input?.modelCallLimit, 3, 12),
    toolCallLimit: boundedInteger(input?.toolCallLimit, 4, 20),
    budgetCeilingUsd: Math.max(0, Math.min(0.5, Number.isFinite(Number(input?.budgetCeilingUsd)) ? Number(input.budgetCeilingUsd) : 0.15)),
    createdAt: nowIso(nowMs), updatedAt: nowIso(nowMs), dueAt: dueAt || null,
    approvalRequired: true, approvedBy: null, approvedAt: null,
    trustedKnowledgePromotion: "separate_owner_action_required"
  };
  await put(ASSIGNMENTS, id, assignment);
  return assignment;
}

export async function approveResearchAssignment(id: string, ownerId: string, nowMs = Date.now()) {
  return mutateAssignment(id, nowMs, current => {
    if (current.ownerId !== ownerId) throw new Error("Only the assignment owner can approve it.");
    if (current.status !== "proposed") throw new Error("Only proposed assignments can be approved.");
    return { ...current, status: "approved", approvedBy: ownerId, approvedAt: nowIso(nowMs) };
  });
}

async function mutateAssignment(id: string, nowMs: number, change: (current: ResearchAssignment) => ResearchAssignment) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getWithMetadata<ResearchAssignment>(ASSIGNMENTS, id);
    if (!current) throw new Error("Research assignment not found.");
    const next = { ...change(current.value), id, updatedAt: nowIso(nowMs) };
    const result = await putIfMatch(ASSIGNMENTS, id, next, current.etag);
    if (result?.modified) return next;
  }
  throw new Error("Assignment changed concurrently; retry after reloading it.");
}

export async function claimResearchAssignment(id: string, agentId: string, nowMs = Date.now(), leaseMs = 30 * 60 * 1000) {
  if (!clean(agentId, 120)) throw new Error("agentId is required.");
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getWithMetadata<ResearchAssignment>(ASSIGNMENTS, id);
    if (!current) throw new Error("Research assignment not found.");
    const task = current.value;
    const expired = task.status === "running" && Date.parse(String(task.leaseExpiresAt || "")) <= nowMs;
    if (task.status !== "approved" && !expired) throw new Error("Assignment is not available to claim.");
    if (task.dueAt && Date.parse(task.dueAt) < nowMs) throw new Error("Assignment due date has passed.");
    const claimed = { ...task, status: "running", assignedAgentId: agentId, leaseId: randomUUID(),
      leaseExpiresAt: nowIso(nowMs + Math.max(60_000, Math.min(leaseMs, 60 * 60 * 1000))), updatedAt: nowIso(nowMs) };
    const result = await putIfMatch(ASSIGNMENTS, id, claimed, current.etag);
    if (result?.modified) return claimed;
  }
  throw new Error("Assignment claim lost a concurrent race; reload the queue.");
}

export async function submitResearchAssignment(id: string, agentId: string, leaseId: string, input: any, nowMs = Date.now()) {
  const current = await getWithMetadata<ResearchAssignment>(ASSIGNMENTS, id);
  if (!current || current.value.status !== "running" || current.value.assignedAgentId !== agentId ||
      current.value.leaseId !== leaseId || Date.parse(String(current.value.leaseExpiresAt || "")) <= nowMs) {
    throw new Error("A valid, unexpired assignment lease is required to submit.");
  }
  const summary = clean(input?.summary, 8000);
  const findings = strings(input?.findings, 30, 1500);
  const limitations = strings(input?.limitations, 20, 1000);
  const evidence = Array.isArray(input?.evidence) ? input.evidence.slice(0, 40) : [];
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts.slice(0, 20) : [];
  if (!summary || !findings.length || !limitations.length || !evidence.length || !artifacts.length) {
    throw new Error("Submission requires summary, findings, limitations, evidence and artifact manifest.");
  }
  const safeEvidence = evidence.map((entry: any) => ({
    title: clean(entry?.title, 240), url: clean(entry?.url, 1500),
    retrievedAt: clean(entry?.retrievedAt, 80), note: clean(entry?.note, 1000)
  }));
  if (safeEvidence.some((entry: any) => {
    try { return new URL(entry.url).protocol !== "https:" || !entry.title; } catch { return true; }
  })) throw new Error("Every evidence item requires a title and HTTPS source URL.");
  const safeArtifacts = artifacts.map((entry: any) => ({
    name: clean(entry?.name, 240), mediaType: clean(entry?.mediaType, 120),
    sha256: clean(entry?.sha256, 64), location: clean(entry?.location, 1000),
    reproductionCommand: clean(entry?.reproductionCommand, 1000)
  }));
  if (safeArtifacts.some((a: any) => !a.name || !a.sha256 || !/^[a-f0-9]{64}$/i.test(a.sha256))) {
    throw new Error("Every artifact requires a name and SHA-256 digest.");
  }
  const submissionId = "submission-" + randomUUID();
  const submission = {
    id: submissionId, assignmentId: id, agentId, summary, findings, limitations,
    evidence: safeEvidence, artifacts: safeArtifacts, status: "untrusted_pending_review",
    trustedKnowledgePromotion: "blocked", createdAt: nowIso(nowMs)
  };
  const created = await putIfNew(SUBMISSIONS, submissionId, submission);
  if (!created?.modified) throw new Error("Could not create a unique research submission.");
  const updated = await putIfMatch(ASSIGNMENTS, id, {
    ...current.value, status: "submitted", submissionId, leaseExpiresAt: null, updatedAt: nowIso(nowMs)
  }, current.etag);
  if (!updated?.modified) throw new Error("Submission stored in the untrusted inbox, but assignment state changed concurrently; manual reconciliation required.");
  return submission;
}

export async function challengeResearchSubmission(id: string, reviewerId: string, input: any, nowMs = Date.now()) {
  const assignment = await getWithMetadata<ResearchAssignment>(ASSIGNMENTS, id);
  if (!assignment || assignment.value.status !== "submitted") throw new Error("Only submitted assignments can be challenged.");
  if (assignment.value.independentReviewerId !== reviewerId) throw new Error("Only the assigned independent reviewer can challenge this submission.");
  const submission = await getWithMetadata<any>(SUBMISSIONS, String(assignment.value.submissionId || ""));
  if (!submission) throw new Error("Submission not found.");
  const objections = strings(input?.objections, 20, 1200);
  const reproduction = clean(input?.reproduction, 4000);
  if (!objections.length || !reproduction) throw new Error("Challenge requires explicit objections and a reproduction or verification report.");
  const challenge = { id: "challenge-" + randomUUID(), assignmentId: id, submissionId: submission.value.id,
    reviewerId, objections, reproduction, status: "independent_challenge_recorded", createdAt: nowIso(nowMs) };
  await put(CHALLENGES, challenge.id, challenge);
  const updated = await putIfMatch(ASSIGNMENTS, id, {
    ...assignment.value, status: "challenged", challengeId: challenge.id, updatedAt: nowIso(nowMs)
  }, assignment.etag);
  if (!updated?.modified) throw new Error("Challenge saved, but assignment state changed concurrently.");
  return challenge;
}

export async function reviewResearchSubmission(id: string, reviewerId: string, decision: "accept" | "reject", rationale: string, nowMs = Date.now()) {
  const assignment = await getWithMetadata<ResearchAssignment>(ASSIGNMENTS, id);
  if (!assignment || !["submitted", "challenged"].includes(assignment.value.status)) throw new Error("Assignment is not ready for independent disposition.");
  if (assignment.value.independentReviewerId !== reviewerId) throw new Error("Only the assigned independent reviewer can disposition this submission.");
  if (!rationale.trim()) throw new Error("A written review rationale is required.");
  const submissionId = String(assignment.value.submissionId || "");
  const submission = await getWithMetadata<any>(SUBMISSIONS, submissionId);
  if (!submission || submission.value.agentId === reviewerId) throw new Error("Submitter and reviewer must be independent.");
  const status = decision === "accept" ? "accepted_research" : "rejected";
  const saved = await putIfMatch(SUBMISSIONS, submissionId, {
    ...submission.value, status, reviewerId, reviewRationale: clean(rationale, 4000),
    reviewedAt: nowIso(nowMs), trustedKnowledgePromotion: "blocked_pending_separate_owner_approval"
  }, submission.etag);
  if (!saved?.modified) throw new Error("Submission changed during review; reload before retrying.");
  const reviewedAssignment = await mutateAssignment(id, nowMs, current => {
    if (current.submissionId !== submissionId) throw new Error("Assignment submission changed during review.");
    return { ...current, status: decision === "accept" ? "accepted" : "rejected", reviewedBy: reviewerId,
      reviewRationale: clean(rationale, 4000), trustedKnowledgePromotion: "separate_owner_action_required" };
  });
  if (decision === "accept") {
    await promoteReviewedResearchMemory({ agentId: submission.value.agentId, assignmentId: id, reviewerId, reviewedAt: nowIso(nowMs) });
  }
  return reviewedAssignment;
}

export async function getApprovedResearchAssignments(limit = 20) {
  const assignments = await list<ResearchAssignment>(ASSIGNMENTS, 200);
  return assignments
    .filter(item => item.status === "approved" && item.sourceScope.some(source => {
      try { return new URL(source).protocol === "https:"; } catch { return false; }
    }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, Math.max(1, Math.min(50, Math.floor(limit))));
}

export async function releaseResearchAssignment(id: string, agentId: string, leaseId: string, reason: string, nowMs = Date.now()) {
  return mutateAssignment(id, nowMs, current => {
    if (current.status !== "running" || current.assignedAgentId !== agentId || current.leaseId !== leaseId) {
      throw new Error("A matching active assignment lease is required to release this task.");
    }
    return { ...current, status: "approved", leaseId: null, leaseExpiresAt: null,
      assignedAgentId: null, lastExecutionError: clean(reason, 1000) || "Runner released assignment." };
  });
}

export async function getResearchAssignmentStatus() {
  const [assignments, submissions, challenges] = await Promise.all([
    list<any>(ASSIGNMENTS, 200), list<any>(SUBMISSIONS, 200), list<any>(CHALLENGES, 200)
  ]);
  const count = (status: string) => assignments.filter(x => x.status === status).length;
  return {
    sampled: true, assignments: assignments.length, proposed: count("proposed"), approved: count("approved"),
    running: count("running"), submitted: count("submitted"), challenged: count("challenged"),
    accepted: count("accepted"), rejected: count("rejected"),
    untrustedSubmissions: submissions.filter(x => x.status === "untrusted_pending_review").length,
    acceptedResearchNotPromoted: submissions.filter(x => x.status === "accepted_research").length,
    challenges: challenges.length, modelCallsAuthorizedByDefault: 0, productionWrites: false,
    recentAssignments: assignments.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,20)
      .map(x => ({ id:x.id,title:x.title,division:x.division,status:x.status,createdAt:x.createdAt,updatedAt:x.updatedAt,submissionId:x.submissionId || null }))
  };
}
