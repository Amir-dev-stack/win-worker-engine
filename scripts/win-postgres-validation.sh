#!/usr/bin/env bash
set -euo pipefail

# Opt-in validation only. Requires a disposable local PostgreSQL container.
container="${WIN_PG_CONTAINER:-win-pg-validation}"
psql() { docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d windev "$@"; }

psql -Atc "DROP TABLE IF EXISTS win_validation_queue; CREATE TABLE win_validation_queue (task_id text PRIMARY KEY, status text NOT NULL DEFAULT 'queued', owner_id text, fence bigint NOT NULL DEFAULT 0, lease_expires_at timestamptz, checkpoint text); INSERT INTO win_validation_queue(task_id) VALUES ('concurrent'),('interrupt');"

claim_a="$(psql -Atc "UPDATE win_validation_queue SET status='running',owner_id='worker-a',fence=fence+1,lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE task_id='concurrent' AND status='queued' AND owner_id IS NULL RETURNING owner_id,fence;")"
claim_b="$(psql -Atc "UPDATE win_validation_queue SET status='running',owner_id='worker-b',fence=fence+1,lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE task_id='concurrent' AND status='queued' AND owner_id IS NULL RETURNING owner_id,fence;")"
test "$claim_a" = "worker-a|1" || { echo "FAIL concurrent winner: $claim_a" >&2; exit 1; }
test -z "$claim_b" || { echo "FAIL duplicate claim: $claim_b" >&2; exit 1; }

checkpoint="$(psql -Atc "UPDATE win_validation_queue SET checkpoint=repeat('d',40) WHERE task_id='concurrent' AND owner_id='worker-a' AND fence=1 RETURNING checkpoint;")"
test "$checkpoint" = "dddddddddddddddddddddddddddddddddddddddd" || exit 1
psql -Atc "UPDATE win_validation_queue SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE task_id='concurrent';" >/dev/null
stale="$(psql -Atc "UPDATE win_validation_queue SET lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE task_id='concurrent' AND owner_id='worker-a' AND fence=1 AND lease_expires_at>clock_timestamp() RETURNING task_id;")"
test -z "$stale" || { echo "FAIL stale renewal: $stale" >&2; exit 1; }

(docker exec -e PGAPPNAME=win-validation-interrupt "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d windev -c "BEGIN; UPDATE win_validation_queue SET status='running',owner_id='interrupted',fence=fence+1 WHERE task_id='interrupt'; SELECT pg_sleep(20); COMMIT;" >/tmp/win-validation-interrupt.log 2>&1) & pid=$!
sleep 2
psql -Atc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='win-validation-interrupt' AND pid<>pg_backend_pid();" >/dev/null
wait "$pid" || true
rolled_back="$(psql -Atc "SELECT status || '|' || coalesce(owner_id,'') || '|' || fence FROM win_validation_queue WHERE task_id='interrupt';")"
test "$rolled_back" = "queued||0" || { echo "FAIL interrupted transaction rollback: $rolled_back" >&2; exit 1; }

psql -Atc "DROP TABLE win_validation_queue;"
echo "PASS distributed claim, stale fencing, checkpoint persistence and interrupted-transaction rollback"
