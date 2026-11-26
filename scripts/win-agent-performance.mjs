const ID = /^[A-Za-z0-9._:-]{1,120}$/u;
const MODELS = /^[A-Za-z0-9._-]{1,80}$/u;

function assertId(value, code = "INVALID_PERFORMANCE_ID") {
  if (typeof value !== "string" || !ID.test(value)) throw Error(code);
  return value;
}

function validateOutcome(input) {
  if (!input || typeof input !== "object") throw Error("INVALID_PERFORMANCE_OUTCOME");
  const agentId = assertId(input.agentId);
  if (!MODELS.test(input.model || "")) throw Error("INVALID_PERFORMANCE_MODEL");
  if (!["success", "failure", "blocked"].includes(input.status)) throw Error("INVALID_PERFORMANCE_STATUS");
  for (const field of ["durationMs", "resourceUnits"]) {
    if (!Number.isSafeInteger(input[field]) || input[field] < 0) throw Error("INVALID_PERFORMANCE_NUMBER");
  }
  if (!Number.isSafeInteger(input.reviewRejected) || input.reviewRejected < 0) throw Error("INVALID_REVIEW_COUNT");
  return Object.freeze({
    agentId, model: input.model, status: input.status,
    durationMs: input.durationMs, resourceUnits: input.resourceUnits,
    reviewRejected: input.reviewRejected,
    recovered: input.recovered === true,
    recordedAt: typeof input.recordedAt === "string" ? input.recordedAt : new Date().toISOString()
  });
}

export function createPerformanceLedger({ store, windowSize = 20 } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.write !== "function") throw Error("PERFORMANCE_STORE_REQUIRED");
  if (!Number.isSafeInteger(windowSize) || windowSize < 3 || windowSize > 1000) throw Error("INVALID_PERFORMANCE_WINDOW");
  return Object.freeze({
    async record(outcome) {
      const safe = validateOutcome(outcome);
      const rows = (await store.read(safe.agentId)) || [];
      const next = [...rows, safe].slice(-windowSize);
      await store.write(safe.agentId, next);
      return safe;
    },
    async metrics(agentId) {
      const rows = (await store.read(assertId(agentId))) || [];
      if (!rows.length) return { sampleSize: 0, successRate: null, recoveryRate: null, reviewRejectionRate: null, meanDurationMs: null, meanResourceUnits: null };
      const successes = rows.filter(row => row.status === "success").length;
      const recovered = rows.filter(row => row.recovered).length;
      const rejected = rows.reduce((sum, row) => sum + row.reviewRejected, 0);
      return {
        sampleSize: rows.length,
        successRate: successes / rows.length,
        recoveryRate: recovered / rows.length,
        reviewRejectionRate: rejected / rows.length,
        meanDurationMs: rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length,
        meanResourceUnits: rows.reduce((sum, row) => sum + row.resourceUnits, 0) / rows.length
      };
    },
    async detectDeterioration(agentId, baseline) {
      const current = await this.metrics(agentId);
      if (!baseline || current.sampleSize < 3 || baseline.sampleSize < 3) return { deteriorating: false, reason: "INSUFFICIENT_EVIDENCE", current };
      const reasons = [];
      if (current.successRate < baseline.successRate - 0.2) reasons.push("SUCCESS_RATE_DROP");
      if (current.reviewRejectionRate > baseline.reviewRejectionRate + 0.2) reasons.push("REVIEW_REJECTION_RISE");
      if (current.meanDurationMs > baseline.meanDurationMs * 2) reasons.push("DURATION_REGRESSION");
      if (current.meanResourceUnits > baseline.meanResourceUnits * 2) reasons.push("RESOURCE_REGRESSION");
      return { deteriorating: reasons.length > 0, reasons, current };
    },
    async correctiveAssignment(agentId, baseline) {
      const result = await this.detectDeterioration(agentId, baseline);
      if (!result.deteriorating) return null;
      return Object.freeze({
        assignmentId: `performance-${agentId}-${Date.now()}`,
        agentId: assertId(agentId), type: "performance_correction",
        reasons: result.reasons, boundedAttempts: 1, status: "queued"
      });
    }
  });
}

export function createMemoryPerformanceStore() {
  const records = new Map();
  return {
    async read(agentId) { return records.get(agentId) || []; },
    async write(agentId, rows) { records.set(agentId, rows.map(row => Object.freeze({ ...row }))); }
  };
}
