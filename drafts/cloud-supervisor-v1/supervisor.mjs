// Portable single-process mock. Every public mutation is synchronous and
// reloads the snapshot before committing it with an atomic rename.
import {
  closeSync, fsyncSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const minute = 60_000;
const maxBackoff = 60 * minute;
const routes = {
  simple: ['documentation', ['terra-low', 'sol-medium']],
  standard: ['implementer', ['sol-medium']],
  complex: ['debugger', ['sol-high', 'sol-medium']],
  review: ['reviewer', ['astra-high', 'sol-high']],
};
const outcomes = new Set(['completed', 'quota', 'unavailable', 'retry', 'failed', 'denied', 'missing_auth']);
const active = new Set(['queued', 'running', 'waiting_for_quota', 'blocked_human']);

function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function transition(state, task, status, code, now) {
  task.status = status;
  task.updatedAt = now;
  if (status !== 'running') task.lease = null;
  // Closed schema: never serialize provider responses, human identifiers,
  // idempotency input, or exceptions into audit events.
  state.audit.push({ taskId: task.id, status, code, at: now });
}

export class MockSupervisor {
  #file;
  #clock;
  #leaseMs;
  #script;

  constructor(file, { clock = Date.now, leaseMs = minute, script = [] } = {}) {
    if (!integer(leaseMs, 1, maxBackoff)) throw new Error('INVALID_LEASE');
    this.#file = file;
    this.#clock = clock;
    this.#leaseMs = leaseMs;
    this.#script = structuredClone(script);
  }

  snapshot() {
    try {
      const state = JSON.parse(readFileSync(this.#file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.tasks) || !Array.isArray(state.audit)) {
        throw new Error('INVALID_SNAPSHOT');
      }
      return state;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 1, stopped: false, tasks: [], audit: [] };
    }
  }

  #update(operation) {
    const now = this.#clock();
    if (!integer(now, 0, Number.MAX_SAFE_INTEGER - maxBackoff)) throw new Error('INVALID_CLOCK');
    const state = this.snapshot();
    const result = operation(state, now);
    const directory = mkdtempSync(this.#file + '.tmp-');
    const temporary = join(directory, 'snapshot');
    try {
      const fd = openSync(temporary, 'wx', 0o600);
      try {
        writeFileSync(fd, JSON.stringify(state));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, this.#file);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    return result;
  }

  enqueue({ idempotencyKey, jobType, maxAttempts = 5, runAfter, sensitive = false }) {
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(idempotencyKey)
      || typeof jobType !== 'string' || !Object.hasOwn(routes, jobType) || !integer(maxAttempts, 1, 20)
      || typeof sensitive !== 'boolean') {
      throw new Error('INVALID_TASK');
    }
    return this.#update((state, now) => {
      const duplicate = state.tasks.find(task => task.idempotencyKey === idempotencyKey);
      if (duplicate) return duplicate.id;
      const nextRun = runAfter ?? now;
      if (!integer(nextRun, 0, Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_RUN_TIME');
      const [role, models] = routes[jobType];
      const task = {
        id: state.tasks.length + 1, idempotencyKey, jobType,
        owner: 'mock-owner', reviewEligible: !sensitive && jobType === 'review',
        sensitive, role, modelIndex: 0, model: models[0],
        attempts: 0, maxAttempts, checkpoint: 0, nextRun, lease: null,
        quotaWaits: 0, dispatches: 0,
      };
      state.tasks.push(task);
      transition(state, task, state.stopped ? 'stopped' : 'queued', 'scheduled', now);
      return task.id;
    });
  }

  stop() {
    this.#update((state, now) => {
      state.stopped = true;
      for (const task of state.tasks.filter(task => active.has(task.status))) {
        transition(state, task, 'stopped', 'kill_switch', now);
      }
    });
  }

  #admit(state, task, controls, now) {
    if (state.stopped) {
      transition(state, task, 'stopped', 'kill_switch', now);
    } else if (!integer(controls.spendCents, 0, 294)) {
      transition(state, task, 'stopped', 'budget_stop', now);
    } else if (controls.authenticated !== true) {
      transition(state, task, 'blocked_human', 'missing_auth', now);
    } else if (task.sensitive) {
      transition(state, task, 'blocked_human', 'sensitive_approval', now);
    } else {
      return true;
    }
    return false;
  }

  claim(controls = {}) {
    return this.#update((state, now) => {
      for (const task of state.tasks) {
        if (task.status === 'running' && task.lease.expiresAt <= now) {
          const status = task.attempts >= task.maxAttempts ? 'dead_letter' : 'queued';
          transition(state, task, status, 'lease_expired', now);
        }
        if (task.nextRun > now || !['queued', 'waiting_for_quota'].includes(task.status)) continue;
        if (!this.#admit(state, task, controls, now)) continue;
        task.attempts++;
        task.lease = { fence: task.attempts, expiresAt: now + this.#leaseMs };
        transition(state, task, 'running', 'claimed', now);
        return { taskId: task.id, fence: task.lease.fence, checkpoint: task.checkpoint };
      }
      return null;
    });
  }

  #withLease(claim, operation) {
    return this.#update((state, now) => {
      const task = state.tasks.find(task => task.id === claim.taskId);
      if (task?.status !== 'running' || task.lease.fence !== claim.fence
        || task.lease.expiresAt <= now) return false;
      return operation(state, task, now);
    });
  }

  checkpoint(claim, step) {
    return this.#withLease(claim, (state, task, now) => {
      if (!integer(step, task.checkpoint, Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_CHECKPOINT');
      task.checkpoint = step;
      task.lease.expiresAt = now + this.#leaseMs;
      transition(state, task, 'running', 'checkpoint', now);
      return true;
    });
  }

  dispatch(claim, controls = {}) {
    return this.#withLease(claim, (state, task, now) => {
      if (!this.#admit(state, task, controls, now)) return false;
      // Script position and result commit together. The mock has no side
      // effects outside the snapshot and accepts no executable provider.
      const result = this.#script[task.dispatches] ?? { status: 'completed' };
      const status = outcomes.has(result.status) ? result.status : 'failed';
      task.dispatches++;
      if (integer(result.checkpoint, task.checkpoint, Number.MAX_SAFE_INTEGER)) {
        task.checkpoint = result.checkpoint;
      }
      this.#settle(state, task, status, result, now);
      return true;
    });
  }

  #settle(state, task, status, result, now) {
    if (status === 'completed' || status === 'failed') {
      transition(state, task, status, status, now);
      return;
    }
    if (status === 'denied' || status === 'missing_auth') {
      transition(state, task, 'blocked_human', status, now);
      return;
    }
    if (task.attempts >= task.maxAttempts) {
      transition(state, task, 'dead_letter', status, now);
      return;
    }
    if (status === 'quota') {
      task.quotaWaits++;
      const backoff = Math.min(maxBackoff, 5 * minute * 2 ** (task.quotaWaits - 1));
      const trustedReset = result.trustedReset === true
        && integer(result.resetAt, now + minute, Number.MAX_SAFE_INTEGER);
      task.nextRun = trustedReset ? result.resetAt : now + backoff;
      transition(state, task, 'waiting_for_quota', status, now);
    } else if (status === 'unavailable') {
      const models = routes[task.jobType][1];
      if (task.modelIndex + 1 >= models.length) {
        transition(state, task, 'stopped', status, now);
        return;
      }
      task.model = models[++task.modelIndex];
      task.nextRun = now;
      transition(state, task, 'queued', 'model_fallback', now);
    } else {
      task.nextRun = now + minute;
      transition(state, task, 'queued', status, now);
    }
  }
}
