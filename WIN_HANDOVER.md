# WIN Handover — cloud-readable review draft

**Snapshot date:** 2026-11-18  
**Evidence scope:** owner-supplied Codex Desktop recovery reports and linked GitHub artifacts. **Not** a live repo/Windows status probe; local dirty changes have not been uploaded.

## Start here

1. Read [WIN_PROJECT_MEMORY.md](WIN_PROJECT_MEMORY.md) for standing goals, financial restrictions, historical accomplishments and evidence gaps.
2. Read the latest [issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20), including recent comments, plus any existing `AGENTS.md` at your checkout/ref. Resolve instruction conflicts conservatively.
3. Inspect exact repository branch/head, current changes, draft PRs and tests before any edit. Never assume local Desktop work is present in Cloud.
4. Respect scoped authorization: the approved operation producing this draft was **a documentation-only draft PR**, not permission to merge, deploy, alter billing or mutate production.

## Local state reported by Desktop recovery (not reproduced here)

- The reported active checkout was detached on [PR #49](https://github.com/Amir-dev-stack/win-worker-engine/pull/49) base `a2a9cd1626ac59c00452aaff63a79f0c82d5de74`, with separate **uncommitted** source, tests and draft-worker changes. This state is not represented by the remote PR head alone.
- A distinct dirty [PR #36](https://github.com/Amir-dev-stack/win-worker-engine/pull/36) review candidate remains frozen; its remote head differs from a historically tested local candidate. Do not modify or declare historical tests reproduced by switching to the remote ref.
- On 2026-11-18 Codex reported local PR #49 verification: Node tests **122/122**, quality gates **121/121**, build **66 required files + 45 architecture checks**, `git diff --check` success with a Windows line-ending warning. These are a **reported modified-worktree result**, not a reproducible GitHub-head result.
- [GitHub Actions run 44183511444](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44183511444) and [run 44183511526](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44183511526) were reported failed without started test jobs; historic diagnoses cite a billing-related workflow gate. Do not change billing or claim the code failed those tests.
- Documented local fixes include source payload limits, fail-closed quota handling, safe diagnostic codes, cache/fixture provenance, import replay, delayed result reconciliation, resumable review, and rolling coupon scanning. Existence/behavior of uncommitted versions is not guaranteed in cloud checkout.

## Cloud readiness — honest status

| Capability | Status on this snapshot |
|---|---|
| Desktop history summarized for cloud review | This draft PR; awaiting review/merge |
| PC-off coding via Codex Cloud | Not demonstrated for WIN |
| Durable 24/7 cloud supervisor | Prototype/design, no verified host |
| Scheduled cloud operations | Existing ChatGPT/GitHub coordination distinct from always-on worker |
| Quota-reset automatic resumption | Requires supported authenticated cloud dispatch and actual validation |
| Agent/model routing | Windows draft PR #51, not cloud activation |
| Bug self-repair | QA/building blocks exist; autonomous repair deployment unverified |
| Sports research + measurable learning | Partial data/review components; sustained live cloud loop unverified |

See [issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20) and the [Cloud Supervisor implementation contract draft PR #52](https://github.com/Amir-dev-stack/win-worker-engine/pull/52).

## Eight outstanding work areas from recovery

1. Remote PR #49 CI not started and preview absent.
2. Validate hosted storage Blobs retry semantics and >3,000-key scan behavior.
3. Validate simultaneous Neon queue claims, fencing, crash/restart and exactly-once semantics under real concurrent sessions; prior contention test returned `INVALID_ARGUMENT`.
4. Validate portable worker Linux lifecycle, signal handling, health checks and a genuinely authorized PC-off host.
5. Verify data-provider rights, allowed usage, licensing and cost limits for scheduled research.
6. Ensure sports forecasts/results produce independent quality metrics and detect data missingness/learning regressions.
7. Review integration/remediation for open PR #10.
8. Preserve and, if later available, reconcile frozen PR #36 exact historical test harness, including original PowerShell logs.

## Safe next task

Implement a **mock-only** durable supervisor state machine in an isolated branch: checkpoints, leases, deduplication, bounded retries, quota wait/resume after *simulated* reset, blocked-human approvals, model-unavailable fallback, abort/kill switch, crash/restart and audit redaction. Run exact-HEAD tests and report counts. Do not claim real Codex quota-resume or PC-off operation until a real authorized cloud smoke test proves it.

## Operational controls

- OpenAI API spending limit USD 5/month, with USD 2.95 recorded operating stop. No auto-recharge, new paid service, payment instrument access or financial actions.
- No live bets, secrets in commits or logs, sensitive unattended approvals, destructive operations, production deployment or database migrations under this draft PR authority.
- Never overwrite dirty Desktop worktrees or the frozen PR #36 candidate.
- Add current status, exact SHA, test commands/results, assumptions and blockers to issue #20 when appropriate; distinguish a proposal from a tested implementation.

## Recovery fidelity

The source review found 22 Desktop session exports, 5,320 extracted messages and 1,152 candidate owner-message entries; six sessions had no readable messages. The local report classified 12 owner decisions, 10 completed-scope tasks, eight unresolved issues and six uncertainties. Only a concise source-linked summary is published here. **The private raw transcripts, local paths, suspected credentials and personal content were deliberately excluded.**

## Issue #55 checkpoint — 2026-11-18 16:25 UTC

Branch `feat/55-mock-cloud-supervisor` starts from main at
`ca2b557945690951372c93815f5a43ea8f0a67e5`. The implementation is in
`drafts/cloud-supervisor-v1/supervisor.mjs` and its acceptance tests are in
`scripts/win-cloud-supervisor.test.mjs`. It adapts the lease, idempotency and
retry fields from PR #49 and the role-based routing tiers from PR #51. The
referenced Desktop `drafts/persistent-worker-v1/` directory is absent from the
available Git refs.

The prototype uses a local atomic snapshot with one writer process and a
scripted provider. Checkpoints, dispatch receipts and terminal status survive
process restart. Simultaneous writer processes, host power loss, and exactly-once
side effects with a real provider require additional design and verification.

Run `node --test scripts/win-cloud-supervisor.test.mjs`, `npm test`,
`npm run build` and `git diff --check HEAD^ HEAD`. The unchanged main baseline
already has two test import errors for missing `llm-contract.mts` and
`ml-football-season-coverage.mts`. See [issue #55](https://github.com/Amir-dev-stack/win-worker-engine/issues/55)
for the exact tested commit, clean worktree status and results.

Next verify official dispatch and auth support, then run a separately authorized
PC-off smoke test on a permitted host. The simulated quota tests establish
behavior only within the mock.

## PR #56 review hardening — 2026-11-18 16:30 UTC

The mock requires one writer transaction at a time on a local filesystem
with atomic directory creation and same-filesystem rename. All supervisor
instances using the same canonical file path share its `<snapshot>.lock`
directory. An overlapping mutation fails with `SNAPSHOT_WRITER_LOCKED`.
After a crash during a transaction, keep the lock until an operator confirms
the writer has exited and has exclusive access. Inspect the committed snapshot
before removing the empty lock directory, then restart. Temporary directories
left by a crash are never read or promoted. Direct edits and distributed
or mixed-version writers are outside the storage contract.

The writer flushes the new file and atomically renames it over the previous
snapshot. Linux SIGKILL tests cover both sides of rename and validate recovery
after manual lock clearance. Read-only inspection can see the previous or new
complete snapshot. No directory fsync or host power-loss guarantee is provided.
Snapshot validation rejects malformed tasks, leases, counters and audit events.
The storage directory must be trusted. Idempotency keys are stored in task
records, so use synthetic, non-sensitive keys. Audit events contain only task
ID, timestamp, state and a fixed diagnostic code.

The USD 2.95 operating stop is a mock input check at claim and dispatch.
Integer values from 0 through 294 cents are accepted. Invalid values or 295
cents and above block simulated dispatch. This does not account for spending
or reserve funds, and the prototype has no real provider call path.

Baseline reproduction uses a clean archive of
`ca2b557945690951372c93815f5a43ea8f0a67e5` and Node v24.22.1.
`node --experimental-strip-types --test scripts/llm-execution.test.mjs scripts/ml-football-season-coverage.test.mjs`
fails both imports with `ERR_MODULE_NOT_FOUND`. The baseline `npm test` reports
32 passed and 2 failed. The baseline tracks the importers introduced in
`674b341` and `2bba14f`, but lacks both imported modules. The module
introductions `d2f917a` and `3664733` are available in other Git refs.
This PR does not incorporate those unrelated changes.

Before the PC-off smoke test, review this draft, obtain separate owner
authorization for one bounded execution, and verify a permitted no-new-spend
cloud runtime, supported dispatch interface, and least-privilege authentication.
Define the task, timeout, stop and evidence criteria before running it.

Malformed supervisor claim inputs are rejected before the snapshot lock or state
file is touched. Null, missing, non-integer, non-positive and non-numeric task or
fence values return `false` from checkpoint and dispatch. The regression test
compares the serialized snapshot after every rejection and confirms no lock is
left behind. This is input hardening for the local mock and does not validate a
real provider adapter or distributed queue.

## Issue #57 missing-module repair — 2026-11-18

The isolated `fix/57-missing-modules` branch starts from main at
`ca2b557945690951372c93815f5a43ea8f0a67e5`. The two reported import failures
were an incomplete dependency recovery. The LLM execution test lacked its
provider-neutral contract. The season coverage test lacked the season module,
historical coverage assessment and strict timestamp validator. The recovered
source uses the latest compatible versions already present in repository
history. It keeps provider approval, pricing, quota, retention consent, privacy,
bounded execution and nonnegative reservation checks. No provider is called by
these tests.

Restoring the imports exposed a stale 10 ms timeout fixture below the contract's
existing 100 ms minimum. The test now uses 100 ms. Added regression checks prove
that an explicitly unverified quota or missing retention consent prevents
adapter execution and that an explicitly reserved zero-cost task is accepted.
The football coverage path remains descriptive, excludes invalid and post-kickoff
evidence, and never grants research or training approval.

Exact-HEAD evidence and the final clean commit are recorded in issue #57 and its
draft PR. The targeted tests pass 9/9, full Node tests pass 41/41, quality gates
pass 107/107, and the build passes 61 required-file plus 44 architecture checks.
No deployment, migration, external provider request or spending occurred.

PR #58 review hardening now requires `quotaVerified === true`. An omitted,
undefined or false value makes the provider ineligible before adapter lookup.
Request validation checks that provider allowlists are arrays before duplicate
inspection, so malformed runtime objects return fixed validation errors.
Regression coverage also passes malformed provider arrays, fields and a
non-array provider collection and verifies a fixed `no_eligible_provider`
result without adapter execution. Updated verification is targeted 10/10,
full Node 42/42, quality gates 107/107, and build 61 plus 44.

## Performance monitoring checkpoint — 2026-11-26

Branch `win-draft/agent-performance-metrics` adds a bounded performance ledger
in `scripts/win-agent-performance.mjs`. It records sanitized assignment
outcomes, computes success, recovery, review-rejection, duration and resource
metrics, and emits a single-attempt corrective assignment only after measured
deterioration with sufficient sample size. Targeted tests pass 3/3. This is
draft evidence and does not claim model learning improvement until durable
history and independent evaluation exist.

## Independent-process contention and crash recovery — 2026-11-27

Separate draft branch `win-draft/performance-process-contention-20261127`
extends PR #118's fenced performance ledger with child-process validation.
Four sustained rounds launched six independent processes against the same
file-backed ledger: each round produced exactly one claimant and five fenced
losers, with four persisted rows and no duplicate ownership. A crash simulation
left the lease active, rejected an immediate restart, then allowed a new
owner after expiry with fence `2` and one recovered row. No provider, Neon
database, production data, credentials, billing or deployment was used.

Verification: focused process suite 4/4; full Node suite 62/62; quality gates
107/107; build 61 required files plus 44 architecture checks; `git diff --check`
clean. This proves independent-process file-store behavior only; PostgreSQL
runtime-role authorization remains an external validation gap.

## Independent hosted verification — 2026-11-27

PR #121 merge-ref run `45931294240` completed successfully on GitHub-hosted
Ubuntu with read-only `contents` and `metadata` permissions. Job `validate`
checked merge ref `cab365300e8e2c53dea9d1e2dc9cea0e6341a84c`, passed the
61-file and 44-architecture build checks, executed all 62 tests with zero
skips, and passed all 107 quality gates. This independently verifies the
process-fencing proof in a PC-off hosted environment; it does not configure a
model executor or prove PostgreSQL runtime-role authorization.

## Neon isolated-branch read-only verification — 2026-11-27

Using the existing free Neon project `win-memory` (`little-feather-51279997`)
and non-default branch `win-pg-isolated-validation-20261117`
(`br-divine-art-banin3jl`), read-only inspection confirmed the branch is
`ready`, non-default, and has the expected WIN job/heartbeat/memory tables and
claim/checkpoint/complete/fail/heartbeat functions. The database owner is
`neondb_owner`; the application tables had no `public` or `token_roles`
grants, while the owner retains full table privileges. No separate
least-privilege runtime login role is present. No SQL writes, migrations,
financial-row reads, credentials, production branch access or paid resources
were used. No financial-row contents were read. This verifies provider-backed branch persistence and identifies the
runtime-role authorization gap; it does not claim PostgreSQL restart recovery.
