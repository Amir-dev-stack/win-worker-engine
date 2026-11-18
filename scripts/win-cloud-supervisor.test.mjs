import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MockSupervisor } from '../drafts/cloud-supervisor-v1/supervisor.mjs';

const minute = 60_000;
const controls = { authenticated: true, spendCents: 0 };

function fixture(t, script = [], options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'win-supervisor-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'state.json');
  let now = 0;
  const reopen = () => new MockSupervisor(file, { clock: () => now, script, ...options });
  const supervisor = reopen();
  return {
    file, supervisor, reopen, setTime: time => { now = time; },
    enqueue: fields => supervisor.enqueue({ idempotencyKey: 'schedule-1', jobType: 'standard', ...fields }),
    task: () => supervisor.snapshot().tasks[0],
  };
}

function dispatch(supervisor) {
  const claim = supervisor.claim(controls);
  assert.ok(claim);
  assert.equal(supervisor.dispatch(claim, controls), true);
  return claim;
}

test('trusted simulated reset preserves the checkpoint and resumes exactly once', t => {
  const { enqueue, supervisor, reopen, setTime, task } = fixture(t, [
    { status: 'quota', trustedReset: true, resetAt: 10 * minute, checkpoint: 7 },
    { status: 'completed' },
  ]);
  enqueue();
  dispatch(supervisor);
  assert.equal(task().status, 'waiting_for_quota');
  const restarted = reopen();
  setTime(10 * minute - 1);
  assert.equal(restarted.claim(controls), null);
  setTime(10 * minute);
  assert.equal(dispatch(restarted).checkpoint, 7);
  assert.equal(supervisor.claim(controls), null);
  assert.equal(task().status, 'completed');
  assert.equal(task().dispatches, 2);
});

test('unknown or untrusted resets use sparse capped backoff and dead-letter at the limit', t => {
  const { enqueue, supervisor, setTime, task } = fixture(t,
    Array.from({ length: 7 }, () => ({ status: 'quota', resetAt: 1 })));
  enqueue({ maxAttempts: 7 });
  let now = 0;
  for (const delay of [5, 10, 20, 40, 60, 60]) {
    dispatch(supervisor);
    now += delay * minute;
    assert.equal(task().nextRun, now);
    setTime(now - 1);
    assert.equal(supervisor.claim(controls), null);
    setTime(now);
  }
  dispatch(supervisor);
  assert.equal(task().status, 'dead_letter');
  assert.equal(supervisor.claim(controls), null);
});

test('process exit recovers the durable checkpoint and fences stale and duplicate delivery', t => {
  const { file, enqueue, supervisor, setTime, task } = fixture(t, [], { leaseMs: 10 });
  const id = enqueue();
  const module = new URL('../drafts/cloud-supervisor-v1/supervisor.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { MockSupervisor } from ${JSON.stringify(module)};
    const s = new MockSupervisor(process.argv[1], { clock: () => 0, leaseMs: 10 });
    const claim = s.claim({ authenticated: true, spendCents: 0 });
    if (!s.checkpoint(claim, 3)) process.exit(1);
    process.exit(17);
  `, file]);
  assert.equal(child.status, 17);
  assert.equal(enqueue(), id);
  setTime(9);
  assert.equal(supervisor.claim(controls), null);
  setTime(10);
  const claim = supervisor.claim(controls);
  assert.deepEqual(claim, { taskId: id, fence: 2, checkpoint: 3 });
  assert.equal(supervisor.dispatch({ ...claim, fence: 1 }, controls), false);
  assert.equal(supervisor.checkpoint({ ...claim, fence: 1 }, 4), false);
  assert.equal(supervisor.dispatch(claim, controls), true);
  assert.equal(supervisor.dispatch(claim, controls), false);
  assert.equal(task().dispatches, 1);
  assert.equal(task().status, 'completed');
});

test('sensitive tasks and provider denials stay blocked for human review', t => {
  const { enqueue, supervisor } = fixture(t, [{ status: 'denied' }]);
  enqueue({ sensitive: true, jobType: 'review' });
  enqueue({ idempotencyKey: 'another-review', jobType: 'review' });
  dispatch(supervisor);
  assert.equal(supervisor.claim(controls), null);
  assert.deepEqual(supervisor.snapshot().tasks.map(task => [
    task.status, task.reviewEligible, task.dispatches,
  ]), [['blocked_human', false, 0], ['blocked_human', true, 1]]);
});

test('review routing has one bounded fallback and then stops', t => {
  const { enqueue, supervisor, task } = fixture(t, [
    { status: 'unavailable' }, { status: 'unavailable' },
  ]);
  enqueue({ jobType: 'review' });
  assert.equal(task().role, 'reviewer');
  assert.equal(task().model, 'astra-high');
  dispatch(supervisor);
  assert.equal(task().model, 'sol-high');
  dispatch(supervisor);
  assert.equal(task().status, 'stopped');
  assert.equal(supervisor.claim(controls), null);
});

test('missing auth, budget stop and persisted kill switch prevent mock dispatch', t => {
  const { enqueue, supervisor, reopen } = fixture(t);
  enqueue();
  assert.equal(supervisor.claim({ spendCents: 0 }), null);
  assert.equal(supervisor.snapshot().tasks[0].status, 'blocked_human');
  enqueue({ idempotencyKey: 'budget' });
  const claim = supervisor.claim(controls);
  assert.equal(supervisor.dispatch(claim, { ...controls, spendCents: 295 }), false);
  enqueue({ idempotencyKey: 'stop' });
  const stoppedClaim = supervisor.claim(controls);
  supervisor.stop();
  const restarted = reopen();
  assert.equal(restarted.dispatch(stoppedClaim, controls), false);
  assert.equal(restarted.claim(controls), null);
  assert.deepEqual(restarted.snapshot().tasks.map(task => [task.status, task.dispatches]),
    [['stopped', 0], ['stopped', 0], ['stopped', 0]]);
});

test('audit records only allowlisted status metadata', t => {
  const { enqueue, supervisor } = fixture(t,
    [{ status: 'unexpected-provider-text', details: 'synthetic-detail' }]);
  enqueue({ idempotencyKey: 'synthetic-schedule-input' });
  dispatch(supervisor);
  assert.deepEqual(supervisor.snapshot().audit, [
    { taskId: 1, status: 'queued', code: 'scheduled', at: 0 },
    { taskId: 1, status: 'running', code: 'claimed', at: 0 },
    { taskId: 1, status: 'failed', code: 'failed', at: 0 },
  ]);
});
