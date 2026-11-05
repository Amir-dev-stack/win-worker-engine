# WIN Stage 2 — isolated contract-test plan (2026-11-05)

Status: first non-production contract test added on the documentation/roadmap branch. The test is wired into the existing `npm test` script because it already runs `scripts/*.test.mjs`. It has **not yet been executed in CI or locally**; do not describe it as passing until a workflow run confirms it.

## 1. First implemented contract test

File: `scripts/memory-prefix-ownership.test.mjs`

It reads source files only and checks:
- the 23-prefix structured-memory allowlist is identical in `netlify/lib/store.mts`, `neon-memory-backup.mts`, `memory-backfill.mts` and `memory-restore.mts`;
- there are no duplicate entries;
- every entry is an explicit `library/*/` collection prefix;
- the allowlist does not silently expand into excluded model-lab/research or separate AI-budget/OAuth collections;
- AI budget and OAuth keep their separate direct storage namespace responsibilities.

This test deliberately does not modify any runtime file, allowlist, storage provider, database or stored record.

## 2. Next contract tests — priority order

### A. Result submission idempotency and partial writes
Use only an isolated in-memory store and stubbed dependencies. Add deterministic failure injection at each write boundary.

Required cases:
1. two simultaneous submissions for the same prediction and same outcome;
2. repeated identical submission after a completed write;
3. conflicting second outcome after an accepted result;
4. failure after result record write but before each downstream learning projection;
5. retry after partial failure resumes missing projections without duplicate lesson/settlement records;
6. independent review/correction remains possible under its existing authorization rules.

Expected properties:
- at most one canonical result claim wins;
- retries are idempotent;
- projections are repairable/reconcilable;
- conflicting outcomes are not silently overwritten;
- partial completion is visible and recoverable;
- no production Blobs or Neon adapter is reachable during the test.

Do not implement a new lock/claim protocol until the exact conditional-write behavior and existing correction workflow are covered by tests.

### B. Storage adapter contract
Extend the existing isolated `win-store.test.mjs` adapter checks to cover:
- strong read after successful conditional write;
- conditional create races;
- conditional update races;
- pagination cursor/order and bounded read concurrency;
- missing, malformed and legacy JSON records;
- primary failure and secondary mirror failure behavior;
- mirror read precedence and reconciliation;
- deletion semantics and no accidental fallback resurrection.

Preserve the current ETag and read semantics. No provider routing change in this stage.

### C. Backup / restore synthetic round trip
Use a test-only memory adapter and synthetic records only:
- representative records for each of the 23 approved prefixes;
- one deliberately excluded model-lab record;
- synthetic financial account and ledger entries;
- encryption, compression, manifest, hashes and authentication-tag verification;
- corrupted ciphertext, wrong key, missing manifest, truncated payload, unsupported schema and disallowed key cases;
- restore retry and partial failure behavior.

Assert that only allowlisted records and explicit financial records are restored, and that Blobs-primary records are never overwritten. Do not use real production credentials, production storage, or production records.

### D. API and scheduled-job contract inventory
Before editing handlers, produce a machine-checkable route manifest containing:
- exact path and HTTP methods;
- authentication mechanism and required scopes/roles;
- request and response schema identifiers;
- read/write collections and external network calls;
- rate limits, background-function behavior and timeout constraints.

For every scheduled/background job, record:
- trigger source and schedule declaration;
- authentication and budget gates;
- lock key/lease and stale-lock recovery;
- idempotency key and retry ceiling;
- heartbeat/status record and failure visibility.

A cron expression in source is not evidence of active production configuration. Verify deployed schedules and execution history read-only before making changes.

## 3. Execution policy

- Run tests in CI or a local isolated environment with no production credentials.
- Never set `WIN_STORE_TEST_MODE=1` in a production deployment.
- Test fixtures must use synthetic IDs, synthetic teams/events and fake provider responses.
- No network request should be made unless explicitly stubbed to a known test host.
- No production Blobs, Neon, bookmaker, paid AI, or external sports API calls.
- No automatic deploy, merge, migration, import, schedule modification or secret change.
- If the isolation boundary cannot be proven, mark the test blocked rather than attempting it.

## 4. Stage 2 exit criteria

Stage 2 is complete only when:
- the memory ownership manifest and tests agree with all current readers/writers;
- result submission passes concurrency, retry and injected partial-failure tests;
- storage adapter semantics are protected by deterministic contract tests;
- backup/restore passes a synthetic round trip and corruption tests;
- API/job route manifest is complete and authorization is reviewed;
- CI reports the tests as passed, with skipped checks clearly distinguished from passed checks.

Only then should a storage or result-pipeline refactor be designed. Any production migration or routing change remains a separate approval gate.
