import { mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { assessCloudTaskProvenance } from "./win-cloud-task-provenance.mjs";

const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$/u;

function initial() { return { version: 1, nextId: 1, tasks: [], trace: [] }; }

export class DurableTaskDispatcher {
  #file; #clock; #launcher;
  constructor(file, { clock = Date.now, launcher } = {}) {
    this.#file = file; this.#clock = clock; this.#launcher = launcher;
  }
  #read() { try { return JSON.parse(readFileSync(this.#file, "utf8")); } catch (error) {
    if (error.code === "ENOENT") return initial(); throw error;
  } }
  #mutate(callback) {
    const lock = `${this.#file}.lock`;
    mkdirSync(lock, { mode: 0o700 });
    try {
      const state = this.#read();
      const result = callback(state);
      const temp = `${this.#file}.tmp`;
      writeFileSync(temp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      renameSync(temp, this.#file);
      return result;
    } finally { rmdirSync(lock); }
  }
  snapshot() { return structuredClone(this.#read()); }
  enqueue({ idempotencyKey, assignment, maxAttempts = 3 }) {
    if (!KEY.test(idempotencyKey) || !KEY.test(assignment) || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
      return { status: "rejected", reason: "INVALID_ASSIGNMENT", dispatchOperations: 0 };
    }
    return this.#mutate(state => {
      const prior = state.tasks.find(task => task.idempotencyKey === idempotencyKey);
      if (prior) return { status: "existing", taskId: prior.id, dispatchOperations: 0 };
      const task = { id: state.nextId++, idempotencyKey, assignment, status: "queued", attempts: 0, maxAttempts };
      state.tasks.push(task); state.trace.push({ taskId: task.id, at: this.#clock(), code: "ENQUEUED" });
      return { status: "queued", taskId: task.id, dispatchOperations: 0 };
    });
  }
  async dispatchNext(controls = {}) {
    if (controls.approved !== true || controls.quotaVerified !== true || controls.freeOnly !== true) {
      return { status: "blocked", reason: "POLICY_GATE", dispatchOperations: 0 };
    }
    if (!this.#launcher || this.#launcher.verifiedInterface !== true || this.#launcher.transport !== "live" ||
        typeof this.#launcher.launch !== "function") {
      return { status: "BLOCKED_INTERFACE", reason: "VERIFIED_LAUNCH_INTERFACE_UNAVAILABLE", dispatchOperations: 0 };
    }
    const candidate = this.snapshot().tasks.find(task => task.status === "queued");
    if (!candidate) return { status: "idle", dispatchOperations: 0 };
    let receipt;
    try { receipt = await this.#launcher.launch({ assignment: candidate.assignment, idempotencyKey: candidate.idempotencyKey }); }
    catch { receipt = undefined; }
    const provenance = assessCloudTaskProvenance(receipt);
    return this.#mutate(state => {
      const task = state.tasks.find(item => item.id === candidate.id);
      task.attempts++;
      if (provenance.status === "LIVE_VERIFIED") {
        task.status = "completed";
        task.receipt = provenance;
        state.trace.push({ taskId: task.id, at: this.#clock(), code: "LIVE_RECEIPT_VERIFIED" });
        return { status: "completed", taskId: task.id, dispatchOperations: 1, receipt: provenance };
      }
      task.status = task.attempts >= task.maxAttempts ? "dead_letter" : "queued";
      state.trace.push({ taskId: task.id, at: this.#clock(), code: task.status === "dead_letter" ? "DEAD_LETTER" : "RETRY_NO_RECEIPT" });
      return { status: task.status, taskId: task.id, dispatchOperations: 1, reason: provenance.reason };
    });
  }
}
