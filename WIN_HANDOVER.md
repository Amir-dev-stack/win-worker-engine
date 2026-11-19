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

## Issue #20 GitHub commit reader checkpoint — 2026-11-19 09:45 UTC

The starting checkout was clean on `work` at `844efeba8ad1d20dbe587e286ed5546b81eb5baa`, matching remote main. The isolated branch `win-draft/github-commit-reader-20261119` starts at `01c6171800d005a2b325267e73e2d706757706ff` from [draft PR #73](https://github.com/Amir-dev-stack/win-worker-engine/pull/73). GitHub reported success for [Netlify validation](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44499022731) and [worker engine checks](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44499022607) at that base.

This checkpoint adds `scripts/win-github-commit-reader.mjs` and its tests. The reader takes a host-provided GitHub credential and makes a bounded GET for one exact WIN commit. It returns the SHA, parent and file paths and discards any attestation claims in the response. The draft inspector still requires separate source and secret-scan evidence.

Local verification used Node v24.22.1. `node --test scripts/win-github-commit-{reader,inspector}.test.mjs` passed 15/15. `npm test` passed 70/70 tests and 107/107 quality gates. `npm run build` passed 61 required-file checks, 44 architecture checks and 107/107 gates. The adapter tests use a simulated GitHub response. The local GitHub CLI reported its configured authentication invalid, so a live authenticated adapter smoke test remains open. A separately verifiable Codex Cloud task URL or PC-off execution record was unavailable in this session.

Next task: verify one live read using an existing authorized read-only host credential and compare the parent and paths with the GitHub connector. Source approval and secret-scan integration require independent evidence before the inspector can return verified.

## Trusted commit evidence checkpoint — 2026-11-19 10:12 UTC

Issue #20 assigned removal of caller-supplied provenance and scan attestations. The isolated branch `win-draft/trusted-commit-evidence-20261119` is stacked on draft PR #74. The commit inspector now requires two independently supplied read-only operations: exact GitHub commit metadata and scanner evidence. Fields named `sourceVerified` or `secretScanPassed` in commit metadata no longer authorize verification.

The new `scripts/win-github-security-evidence-reader.mjs` queries GitHub check runs for the exact commit using a host-provided read-only credential and a deployment-pinned scanner app ID and check name. It accepts exactly one completed successful matching check for the exact SHA with valid timestamps. Missing, duplicate, paginated, failed, pending, wrong-app, wrong-commit and malformed responses fail closed. The returned inspector summary includes the pinned scanner identity and completion time.

Local targeted tests passed 29/29. `npm test` passed 84/84 tests and 107/107 quality gates. `npm run build` passed 61 required-file checks, 44 architecture checks and 107/107 quality gates. These tests use simulated GitHub responses. A real scanner app identity, authenticated live read and independent confirmation that the pinned check performs an adequate secret scan remain deployment prerequisites. No GitHub write, database, production, merge, deployment, paid API or secret operation occurred.

## Trusted inspector composition checkpoint — 2026-11-19 10:54 UTC

Issue #20 accepted PR #77 for draft review and assigned one trusted construction boundary. The isolated branch `win-draft/trusted-inspector-factory-20261119` starts at PR #77 exact SHA `f424b73ab49bcda61a2569df1ea104b53893e815`. The new `scripts/win-github-trusted-commit-inspector.mjs` constructs both authenticated readers once from host configuration and exposes only `inspect(input)`. Per-task requests cannot supply readers, credentials, scanner app IDs or check names.

Adversarial tests attempt a forged per-call evidence reader and scanner identity, plus wrong app/check/commit, incomplete pagination and malformed timestamps. All stop with zero writes. Local targeted tests passed 37/37. `npm test` passed 92/92 tests and 107/107 quality gates. `npm run build` passed 61 required-file checks, 44 architecture checks and 107/107 quality gates. Tests use simulated GitHub responses. Scanner adequacy, a real pinned scanner identity and an authenticated live smoke test remain unverified. No GitHub mutation, database, production, merge, deployment, paid API or secret operation occurred.

## Draft authorization preflight checkpoint — 2026-11-19 12:06 UTC

Issue #20 accepted PR #78 for draft review and assigned a read-only evidence-to-CAS authorization preflight. The isolated branch `win-draft/draft-cas-preflight-20261119` starts at PR #78 exact SHA `ccb33f4e26d8ca51f8641829bbb8de8fd78f05ea`. The new preflight privately composes the trusted inspector with a host-provided lease reader. It validates `draft_only_development`, approval, exact source head, actor, fence, expiry and no-production/no-paid flags before inspection, then repeats the complete lease check immediately afterward.

The only successful status is `READY_FOR_SEPARATE_ATOMIC_WRITER`; the module has no writer and reports `writeOperations: 0`. Adversarial tests cover forged per-task readers/scan flags, wrong app/check/commit, mismatched lineage and paths, incomplete pagination, malformed timestamps, expired/revoked leases and owner/fence/source changes between reads. Local targeted tests passed 43/43. `npm test` passed 98/98 tests and 107/107 quality gates. `npm run build` passed 61 required-file checks, 44 architecture checks and 107/107 quality gates. Scanner adequacy, live authenticated reads and server-side atomic writer semantics remain unverified. No GitHub mutation, database, production, merge, deployment, paid API or secret operation occurred.

## Read-only GitHub smoke checkpoint — 2026-11-19 12:22 UTC

Issue #20 accepted PR #79 for draft review and assigned a no-write authenticated smoke harness. The isolated branch `win-draft/read-only-smoke-harness-20261119` starts at PR #79 exact SHA `507c303344ed7d15e0412ab0926632deeb1f5f0b`. The harness reads only the dedicated `WIN_GITHUB_*` configuration, never falls back to a general `GH_TOKEN`, and emits redacted `LIVE_VERIFIED`, `MOCK_ONLY` or `BLOCKED_AUTH` diagnostics. It never returns credentials, request headers, response bodies, file contents or path names.

Deterministic tests cover 401/403/404, missing and duplicate scanner evidence, pagination, wrong SHA/app/check and redaction. Local targeted tests passed 49/49. `npm test` passed 110/110 tests and 107/107 quality gates. `npm run build` passed 61 required-file checks, 44 architecture checks and 107/107 quality gates. The actual cloud invocation returned `BLOCKED_AUTH / CREDENTIAL_NOT_CONFIGURED` before any network request because `WIN_GITHUB_READ_TOKEN` is absent. A real pinned scanner identity and scanner adequacy also remain unverified. No credential was requested or exposed, and no GitHub mutation, database, production, merge, deployment or paid operation occurred.

## Secret provenance audit checkpoint — 2026-11-19

Issue #81 A2 / issue #43 adds a local-only redacted history scanner and explicit coverage map on isolated branch `win-draft/secret-provenance-audit-20261119`, based on PR #80 exact head `c70e34bf5ac4081624df460811d37e7bb5759ab1`. The scanner records only commit, path and credential type; matched values never enter its output and value-derived hashes are never created. It covers every ref and reachable commit legitimately present in the checkout, including tracked docs, workflows and committed bundles.

Issue/PR comments, Actions logs/artifacts, untracked deployment bundles, provider logs, mirrors, deleted remote-only refs and unavailable local archives remain explicitly unverified. Live GitHub metadata checked on 2026-11-19 reports the repository as **public**, contradicting issue #43's older private observation; reachable GitHub content must therefore be treated as publicly accessible. No real secret-scanner application identity, rule set or scope is configured, so a generic green CI check is not treated as adequate scanner evidence. PR #80 live verification remains blocked on secure installation of a dedicated read-only credential and independently reviewed scanner identity.

After fetching all accessible remote branches and tags, the bounded scan covered 2,329 commits across 62 refs. It identified no OpenAI-key, GitHub-token, AWS-access-key-ID, private-key-header or literal bearer-authorization pattern. Seven credentialed-URL paths were sanitized-review fixtures using only loopback or IANA-reserved documentation hosts; no credible tracked secret was identified. This conclusion applies only to the detector set and fetched Git history, not the explicit external coverage gaps above.
