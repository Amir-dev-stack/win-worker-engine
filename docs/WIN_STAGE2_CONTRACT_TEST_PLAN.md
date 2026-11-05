# WIN Stage 2 — isolated contract-test plan (2026-11-05)

Status: the first CI run exposed a branch-boundary mistake in the initial test. PR #11 is based on `main`, while the 23-prefix Blobs-to-Neon mirror/backup/backfill/restore implementation audited in PR #10 is still on a separate, unmerged branch. Those files are therefore not present in this PR #11 checkout. The failing test was corrected to cover only storage ownership that exists on this branch. The 23-prefix cross-file contract test is deferred until the relevant implementation is integrated into a common testable branch; it must not be made to pass by silently skipping missing files.

## 1. Implemented contract tests

### Storage namespace ownership
File: `scripts/storage-namespace-ownership.test.mjs`

It reads source files only and checks:
- AI budget uses its direct `win-engine` storage namespace and retains lock/ledger responsibilities;
- OAuth uses its separate direct `win-oauth` namespace;
- OAuth does not depend on the structured-memory mirror allowlist or general `win-engine` namespace.

### Result partial-write retry
File: `scripts/results-isolated-retry.test.mjs`

It imports the real `/api/results` handler and shared store adapter, but installs a test-only in-memory adapter and a synthetic auth environment. It injects one failure between the canonical `results` write and the `library/settled-results` projection, then checks that:
- the partial state is visible before retry;
- a same-outcome retry completes the missing settlement and learning projections;
- stable learning keys avoid duplicate lesson/settlement-learning records;
- repeated same-outcome submission retains the canonical result ID;
- a conflicting outcome returns HTTP 409 and requires the explicit correction workflow;
- only synthetic keys are written to the isolated in-memory adapter.

These tests do not modify runtime files, production storage, a database, or stored records.

Deferred until the PR #9/#10 storage implementation is integrated:
- compare the 23-prefix structured-memory allowlist across `netlify/lib/store.mts`, `neon-memory-backup.mts`, `memory-backfill.mts` and `memory-restore.mts`;
- assert no duplicates, explicit `library/*/` boundaries, and exclusion of model-lab/research and separate AI-budget/OAuth collections.

## 2. Known result-submission gap

The handler still uses a read-before-write duplicate check and does not atomically claim a prediction result. The new test covers sequential retry after a partial write; it does **not** prove safety under simultaneous submissions. Concurrent same-prediction submissions, including a possible duplicate canonical result, remain unverified and are a required next test before any idempotency refactor. No lock/claim protocol should be introduced until the storage conditional-write semantics and existing correction workflow are covered.

## 3. Next contract tests — priority order

### A. Result submission concurrency and recovery
Use only an isolated in-memory store and stubbed dependencies. Add deterministic barriers and failure injection at each write boundary.

Required cases:
1. two simultaneous submissions for the same prediction and same outcome;
2. repeated identical submission after a completed write;
3. conflicting second outcome after an accepted result;
4. failure after result record write and before each downstream learning projection;
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

## 4. Execution policy

- Run tests in CI or a local isolated environment with no production credentials.
- Never set `WIN_STORE_TEST_MODE=1` in a production process.
- Do not change production storage routing, allowlists, schedules, or data in this stage.
- Keep PR #11 draft and unmerged; do not merge PR #8, #9 or #10 as part of this work.
- Record skipped tests and unavailable integration dependencies explicitly; do not report them as passed.

## 5. Exit criteria

Stage 2 is not complete until:
- the storage ownership manifest matches the implementation actually present in the integrated branch;
- results concurrency, retry and partial-failure cases are tested;
- storage adapter conditional-write and pagination contracts are tested;
- backup/restore synthetic round trip is tested;
- API/job route and security inventory is complete;
- CI passes, with skips and external limitations explicitly identified.
