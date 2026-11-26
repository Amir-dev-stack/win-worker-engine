/**
 * Opt-in isolated PostgreSQL integration test.
 * Runs ONLY with WIN_LEASE_LOCAL_PG_TEST=run and a LOCAL test DB named
 * win_lease_test_*. No Neon, network cloud branch, or production mutation.
 * Requires a locally installed psql client and reachable local PostgreSQL.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { LEASE_SQL, createFencedLeaseStore } from "./win-development-lease-store.mjs";
import { inspectLocalPgConfig } from "./win-development-lease-pg-config.mjs";

import { createLeaseSupervisor } from "./win-supervisor-lease-coordinator.mjs";

const run = process.env.WIN_LEASE_LOCAL_PG_TEST === "run";
const exec = promisify(execFile);
const sourceDir = dirname(fileURLToPath(import.meta.url));
function config() {
  return inspectLocalPgConfig(process.env.WIN_LEASE_TEST_DATABASE_URL);
}
async function sql(config, statement) {
  try {
    const result = await exec("psql",[...config.options,"-c",statement],{
      env:config.environment,timeout:12000,maxBuffer:65536,windowsHide:true
    });
    return result.stdout.trim();
  } catch (error) {
    // Report only known-safe failure codes; stderr can contain credentials.
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const reason = /password authentication failed|no password supplied/i.test(stderr)
      ? "AUTH" : /connection refused|could not connect to server/i.test(stderr)
        ? "CONNECT" : /could not translate host name|could not resolve/i.test(stderr)
          ? "HOST" : /permission denied|must be owner/i.test(stderr)
            ? "PERMISSION" : /syntax error/i.test(stderr)
              ? "SYNTAX" : "OTHER";
    throw Error("LOCAL_POSTGRES_TEST_QUERY_FAILED_" + reason);
  }
}
const quote=value=>"'"+value.replaceAll("'","''")+"'";
test("real local PostgreSQL permits only one competing worker, quarantines expired lease, rejects stale fence",{
  skip: !run
},async()=>{
  const db=config(); // checked before any DB call
  const schema="win_lease_"+randomUUID().replaceAll("-","").slice(0,24);
  const prefix="SET search_path TO "+schema+",public; ";
  const ddl=readFileSync(join(sourceDir,"../db/draft_win_dev_fenced_lease.sql"),"utf8");
  // Fresh random test-only schema on a separately named, local test database.
  await sql(db,"CREATE SCHEMA "+schema);
  try {
    await sql(db,prefix+ddl);
    const sourceSha="a".repeat(40);
    await sql(db,prefix+"INSERT INTO win_dev_lease_tasks (task_id,source_commit_sha,task_type,approved) VALUES ('win-local-test',"+quote(sourceSha)+",'read_only_review',true)");
    const claim=(worker)=>sql(db,prefix+"PREPARE lease_claim(text,text,integer) AS "+LEASE_SQL.claim+
      "; EXECUTE lease_claim('win-local-test',"+quote(worker)+",120)");
    const [alpha,beta]=await Promise.all([claim("worker-alpha"),claim("worker-beta")]);
    assert.equal([alpha,beta].filter(Boolean).length,1,"exactly one claim may succeed");
    const owner=alpha?"worker-alpha":"worker-beta";
    const lease=await sql(db,prefix+"SELECT owner_id,fence,status FROM win_dev_lease_tasks WHERE task_id='win-local-test'");
    assert.match(lease,new RegExp("^"+owner+"\\|1\\|running$"));
    // Revoking an active task must immediately block every owner mutation,
    // even while its original lease is still unexpired.
    await sql(db,prefix+"UPDATE win_dev_lease_tasks SET approved=false WHERE task_id='win-local-test'");
    const deniedRenew=await sql(db,prefix+"PREPARE denied_renew(text,text,bigint,integer) AS "+LEASE_SQL.renew+
      "; EXECUTE denied_renew('win-local-test',"+quote(owner)+",1,60)");
    assert.equal(deniedRenew,"","revoked task must not renew");
    const deniedCheckpoint=await sql(db,prefix+"PREPARE denied_checkpoint(text,text,bigint,text) AS "+LEASE_SQL.checkpoint+
      "; EXECUTE denied_checkpoint('win-local-test',"+quote(owner)+",1,'"+sourceSha+"')");
    assert.equal(deniedCheckpoint,"","revoked task must not checkpoint");
    const deniedComplete=await sql(db,prefix+"PREPARE denied_complete(text,text,bigint) AS "+LEASE_SQL.complete+
      "; EXECUTE denied_complete('win-local-test',"+quote(owner)+",1)");
    assert.equal(deniedComplete,"","revoked task must not complete");
    // Reenable solely for the remaining isolated expiry/fencing scenario.
    await sql(db,prefix+"UPDATE win_dev_lease_tasks SET approved=true WHERE task_id='win-local-test'");
    // Expired worker cannot renew. A third worker cannot steal it as queued.
    await sql(db,prefix+"UPDATE win_dev_lease_tasks SET expires_at=clock_timestamp()-interval '1 second' WHERE task_id='win-local-test'");
    const renew=await sql(db,prefix+"PREPARE lease_renew(text,text,bigint,integer) AS "+LEASE_SQL.renew+
      "; EXECUTE lease_renew('win-local-test',"+quote(owner)+",1,60)");
    assert.equal(renew,"");
    const third=await claim("worker-third");
    assert.equal(third,"","expired running lease must not be automatically stolen");
    const quarantine=await sql(db,prefix+"PREPARE lease_quarantine(text) AS "+LEASE_SQL.quarantineExpired+
      "; EXECUTE lease_quarantine('win-local-test')");
    assert.match(quarantine,/win-local-test\|2\|blocked_uncertain/);
    const oldComplete=await sql(db,prefix+"PREPARE lease_finish(text,text,bigint) AS "+LEASE_SQL.complete+
      "; EXECUTE lease_finish('win-local-test',"+quote(owner)+",1)");
    assert.equal(oldComplete,"","stale fenced worker must not complete work");
    const state=await sql(db,prefix+"SELECT owner_id IS NULL,fence,status FROM win_dev_lease_tasks WHERE task_id='win-local-test'");
    assert.equal(state,"t|2|blocked_uncertain");
  } finally {
    await sql(db,"DROP SCHEMA IF EXISTS "+schema+" CASCADE");
  }
});

test("real PostgreSQL fences a supervisor effect after renewal and preserves a durable receipt after lost acknowledgement", {
  skip: !run
}, async () => {
  const db = config();
  const schema = "win_lease_" + randomUUID().replaceAll("-", "").slice(0, 24);
  const query = (statement) => sql(db, "SET search_path TO " + schema + ",public; " + statement);
  const store = createFencedLeaseStore({
    async query(statement, values) {
      const args = values.map(value => typeof value === "number" ? String(value) : quote(value));
      const result = await query("PREPARE operation AS WITH affected AS (" + statement +
        ") SELECT row_to_json(affected) FROM affected; EXECUTE operation(" + args.join(",") + ")");
      const rows = result ? result.split("\n").map(line => JSON.parse(line)) : [];
      return { rows, rowCount: rows.length };
    }
  });
  const sourceSha = "a".repeat(40);
  const input = {
    taskId: "lost-ack", actorId: "worker-primary", ttlSeconds: 60,
    operationId: "test-effect", checkpointSha: sourceSha
  };

  await sql(db, "CREATE SCHEMA " + schema);
  try {
    await query(readFileSync(join(sourceDir, "../db/draft_win_dev_fenced_lease.sql"), "utf8"));
    await query("CREATE TABLE test_effects (task_id text PRIMARY KEY, operation_id text NOT NULL)");
    await query(`INSERT INTO win_dev_lease_tasks (task_id, source_commit_sha, task_type, approved)
      SELECT task_id, '${sourceSha}', 'draft_only_development', true
      FROM (VALUES ('stale-effect'), ('lost-ack')) AS tasks(task_id)`);
    const expire = taskId => query(`UPDATE win_dev_lease_tasks
      SET expires_at = clock_timestamp() - interval '1 second' WHERE task_id = ${quote(taskId)}`);
    // This SQL receipt stands in for an effect that shares PostgreSQL's transaction.
    async function recordEffect({ taskId, fence, operationId }) {
      return query(`WITH current_lease AS (
        SELECT task_id FROM win_dev_lease_tasks WHERE task_id = ${quote(taskId)}
          AND fence = ${fence} AND status = 'running' AND approved
          AND expires_at > clock_timestamp()
        FOR UPDATE
      )
      INSERT INTO test_effects SELECT task_id, ${quote(operationId)} FROM current_lease
      ON CONFLICT (task_id) DO NOTHING RETURNING operation_id`);
    }
    const stale = await createLeaseSupervisor({ store, effects: {
      async apply(operation) {
        await expire(operation.taskId);
        assert.equal((await store.quarantineExpired(operation.taskId)).status, "blocked_uncertain");
        assert.equal(await recordEffect(operation), "");
        return { status: "rejected" };
      }
    }}).run({ ...input, taskId: "stale-effect" });
    assert.equal(stale.reason, "EFFECT_NOT_CONFIRMED");
    assert.equal(await query("SELECT count(*) FROM test_effects"), "0");

    const lost = await createLeaseSupervisor({ store, effects: {
      async apply(operation) {
        const receipt = await recordEffect(operation);
        if (receipt !== input.operationId) return { status: "rejected" };
        throw Error("synthetic lost acknowledgement");
      }
    }}).run(input);
    assert.equal(lost.reason, "EFFECT_ACK_UNKNOWN_QUARANTINE_REQUIRED");
    await expire(input.taskId);
    assert.equal((await store.quarantineExpired(input.taskId)).status, "blocked_uncertain");
    const backup = await createLeaseSupervisor({ store, effects: {
      apply() { assert.fail("quarantined task must not be replayed"); }
    }}).run({ ...input, actorId: "worker-backup" });
    assert.equal(backup.reason, "LEASE_NOT_ACQUIRED");
    assert.equal(await query("SELECT task_id, operation_id FROM test_effects"), "lost-ack|test-effect");
  } finally {
    await sql(db, "DROP SCHEMA IF EXISTS " + schema + " CASCADE");
  }
});
