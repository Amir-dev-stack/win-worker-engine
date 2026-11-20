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

## Issue #81 C2 snapshot-envelope checkpoint — 2026-11-20

Branch `win-draft/c2-snapshot-archive-envelope-20261120` starts from main at
`844efeba8ad1d20dbe587e286ed5546b81eb5baa`. Implementation commit
`989c8a9` adds a disconnected, provider-neutral evidence boundary for typed
schedule, final-result and pre-event odds records. It requires explicit
provider and canonical identities, timezone-qualified event and observation
times, approved rights and attribution metadata, monotonic source revisions,
and deterministic SHA-256 content identities. Returned envelopes are deeply
frozen in memory.

The bounded batch validator fails closed for oversized input and quarantines
tampered, ambiguous, stale, future, unlicensed, candidate, conflicting-revision
or temporally invalid records. Exact replay is deduplicated and no automatic
retry is requested. Diagnostic output contains snapshot IDs and fixed codes,
not rejected payloads. Input order does not change accepted or rejected output.

Verified before this handover update: targeted envelope tests 13/13, full Node
tests 68/68, quality gates 108/108, build 64 required files plus 44 architecture
checks, and `git diff --check` passed. Re-run the same commands on the final
handover commit and use exact-head GitHub Actions as the remote evidence.

This checkpoint does not fetch provider data, activate a provider, create a
database, persist snapshots, schedule ingestion, settle bets, deploy, or prove
licensing for any source. Provider adapters, durable storage and live historical
coverage remain separate review-gated work. Do not describe this envelope as a
historical database or as live data ingestion.

## Issue #81 C4 prediction-ledger checkpoint — 2026-11-20

Branch `win-draft/c4-prediction-ledger-envelope-20261120` is stacked on draft
PR #93 exact `2e8d88249e31b75b96e735ac18f9e8f7374c1eaa` to preserve that
completed C2 work without independently editing the same build and handover
lines. Implementation commit `2fccf28` adds a disconnected content-addressed
prediction and independently verified outcome record boundary.

Predictions bind event, cutoff, model/artifact/source-code, market/selection,
settlement rule, probability, optional observed price and feature snapshot
availability into one deterministic frozen record. Model training, feature
availability and price availability must all precede the information cutoff;
the prediction must precede the event. Changed records reusing a ledger key are
quarantined. Exact replay is deduplicated.

Outcome records reference the exact prediction and result snapshot. Batch
validation requires the same event and settlement rule, a post-event result,
and a verifier distinct from the prediction producer. Missing predictions and
settlement mismatches fail closed. Rejected records expose only fixed diagnostic
codes and record IDs.

Verified before this handover update: targeted ledger tests 13/13, full Node
tests 81/81, quality gates 109/109, build 67 required files plus 44 architecture
checks, and `git diff --check` passed. Re-run those checks at the final handover
head and use exact-head GitHub Actions as remote evidence.

This boundary is not a durable ledger, database, ingestion or settlement
service, model-training system, live prediction path, or proof of calibration,
profitability, provider rights or historical coverage. Durable append-only
storage, concurrency, independently reviewed market settlement and prospective
evaluation remain separate work.

PR #94 review hardening commit `864356f` closes the prior-context boundary
reported in the independent draft review. Callers must now set a separate
`maxPriorPredictions` cap from zero through 500. Oversized prior context is
rejected before any entry is inspected or echoed. Prior and current predictions
are grouped together by ledger key; if one key has multiple content identities,
no version may authorize an outcome. Current conflicting predictions and every
outcome referencing a conflicted prior/current version are quarantined.

Adversarial tests cover an oversized prior array, two changed prior versions
with outcomes referencing each version, a prior/current collision with an
outcome referencing the prior, exact duplicate prior evidence, reversed input
and prior order, and unaffected clean evidence. Updated verification before the
handover commit is targeted 16/16, full Node 84/84, quality gates 109/109 and
build 67 required files plus 44 architecture checks. This remains an in-memory
offline boundary; it does not prove durable storage or cross-process history.

## Issue #81 C3 team-strength checkpoint — 2026-11-20

Branch `win-draft/c3-team-strength-snapshot-20261120` is stacked on accepted-for-
draft PR #94 exact `c1769e0aef86c9ff490ed43fc2045f9af494ac39`.
Implementation commit `473bdf3` adds a disconnected point-in-time team-strength
snapshot that consumes C2 final-result envelopes.

The snapshot requires an explicit sport, competition, season ID, season start,
as-of instant, two team IDs, evidence caps, result freshness, minimum sample and
recent-window policy. It reports full-season W/D/L, points/game, goals,
home/away splits, bounded recent form and a transparent opponent-quality
context. The fixed schedule adjustment is descriptive and uncalibrated;
`predictiveConfidence` is always null.

Canonical events with contradictory identity or final scores are fully
quarantined. Agreeing provider results add provenance without increasing match
count. Future, stale, pre-season and out-of-scope results are excluded through
the C2 envelope validator plus the explicit season boundary. Availability
evidence is separately capped and timestamped; invalid, future or changed
replays cannot establish squad status. Missing availability is never treated as
a healthy squad and availability never silently changes strength.

Verified before this handover update: targeted C3 tests 15/15, full Node tests
99/99, quality gates 110/110, build 70 required files plus 44 architecture
checks, and `git diff --check` passed. Re-run on the final handover head and use
exact-head GitHub Actions for remote evidence.

This does not prove complete seasons, current injuries or real lineups,
tactical strength, cross-league comparability, calibration, prediction accuracy,
profitability, storage or production operation. No provider or live service is
connected by this checkpoint.

PR #95 review hardening commit `c3d87bb` makes availability trust fail closed at
the team level. Any changed replay makes the status `conflicted`, even when a
newer clean lineup exists. That clean record may remain visible only as
`latestUnconflictedEvidence` with `usableForStatus: false`; `latestEvidence`
remains null. A future or otherwise invalid version sharing a valid evidence ID
taints the ID as a replay conflict. Unrelated invalid evidence degrades an
otherwise clean record to `uncertain`, never `confirmed`. `trustStatus` exposes
the reason directly so consumers do not infer trust from an evidence object.

New input-order-invariant tests cover a conflicted ID plus a newer clean
confirmed lineup, a valid record plus a future version of the same ID, and a
clean record plus unrelated invalid evidence. Updated verification before the
handover commit is targeted 18/18, full Node 102/102, quality gates 110/110 and
build 70 required files plus 44 architecture checks. The evidence remains
synthetic and disconnected.

## Issue #81 D1 walk-forward evaluation checkpoint — 2026-11-20

Branch `win-draft/d1-walk-forward-evaluation-20261120` is stacked on draft PR
#95 exact `9a34fba8b4de72104e433e71a72f13df0d363d3e`. Implementation commit
`ec88104` adds a disconnected evaluation boundary that consumes accepted C4
prediction and independently verified outcome ledger entries.

Callers declare bounded, non-overlapping evaluation folds, a training cutoff,
an embargo, an evaluation as-of instant, fixed calibration bins and a minimum
sample size. A model trained after its fold cutoff, an outcome verified after
the report as-of time, a prediction outside declared windows, or missing and
conflicting outcomes cannot enter the score. Void and push outcomes are counted
but never coerced into wins or losses.

Reports calculate Brier score, natural-log loss and fixed-bin ECE by fold and by
an exact sport/competition/market/selection/model cohort. Meeting the minimum
sample only yields `measured_not_independently_validated`; the evaluator never
declares calibration or superiority. Closing-line value and distribution shift
remain explicitly unavailable because the required evidence is not supplied.

Malformed or tampered ledger rows expose only a safe record ID and fixed
diagnostic. A malformed replay that reuses a valid prediction ID taints that
prediction, so a clean copy cannot launder it into the scored set. Independent
clean evidence may remain usable. Output is bounded, deterministic, deeply
frozen and content-addressed, and requests no automatic retry.

Verification before this handover update: targeted D1 tests 13/13, full Node
tests 115/115, quality gates 111/111, build 73 required files plus 44
architecture checks, and exact-base `git diff --check` passed. Re-run all checks
on the final handover commit and use exact-head GitHub Actions as remote
evidence.

This does not prove real-season coverage, source correctness, settlement
accuracy, closing prices, calibrated probabilities, CLV, drift, accuracy,
profitability, model promotion, durable storage or production operation. It is
a synthetic offline D1 milestone, not completion of D1 or issue #81.

PR #96 review hardening commit `8ee6c81` closes the rejected-outcome trust gap
reported by independent review. Rejected outcome-shaped records are inspected
only for a recoverable, hash-shaped prediction reference. When present, the
referenced accepted prediction is quarantined with
`REJECTED_OUTCOME_EVIDENCE`, even if another accepted outcome would otherwise
support scoring. Two changed outcome versions sharing a ledger key therefore
cannot be hidden behind a third clean verifier record.

Malformed outcome evidence with a recoverable prediction reference has the
same fail-closed effect. If a rejected outcome-shaped record has no trustworthy
prediction reference, the evaluator does not guess or echo it; `batchTrust`
becomes `degraded_unlinked_rejected_outcome` and reports only a count.
Independent clean predictions remain separately scoreable while the report's
degraded trust is explicit.

New order-invariant adversarial tests cover two conflicting same-key outcomes
plus a separate accepted outcome, an unaffected clean prediction, a malformed
outcome with a recoverable prediction reference, and an unlinked rejected
outcome with private payload. Updated verification before the handover commit
is targeted 16/16, full Node 118/118, quality gates 111/111 and build 73
required files plus 44 architecture checks. This remains synthetic,
disconnected and draft-only.

## Issue #81 D1 paired-baseline checkpoint — 2026-11-20

Branch `win-draft/d1-paired-baseline-comparison-20261120` is stacked on draft
PR #96 exact `3d9ab2a31d4db9f13eaf2f78a4485b247f938883`.
Implementation commit `5472c2a` adds a disconnected strict paired comparison
between one candidate-model walk-forward report and one reference baseline.

Walk-forward cohorts now bind producer, source-code hash, model ID/version and
artifact hash, so changed artifacts or code cannot be pooled under one label.
Each scored observation also exposes a model-independent, content-addressed
comparison-unit ID plus its Brier and log losses. The unit identity binds fold,
event/time, sport, competition, market/version, settlement rule, selection and
verified target without copying raw event identity into the comparison report.

The comparator recomputes source report content identities and requires exact
fold policy, accepted ledger-only trust, one candidate/reference per evidence
cohort, distinct model identities and identical comparison-unit/fold sets. A
tampered, degraded, ambiguous, missing or sample-mismatched cohort rejects the
whole comparison and returns no partial deltas.

Accepted comparisons report paired candidate-minus-reference Brier/log-loss
deltas, lower/tied/higher loss counts, sample dispersion and standard error. A
normal-approximation interval is withheld until at least 30 pairs and remains
explicitly descriptive. `promotionAllowed` is always false and
`superiorityConclusion` always null. Canonical identities prove integrity, not
producer authenticity or real-world evidence correctness.

Verification before this handover update: targeted evaluator/comparator tests
30/30, full Node tests 132/132, quality gates 112/112, build 76 required files
plus 44 architecture checks, and exact-base `git diff --check` passed. Re-run
all checks on the final handover commit and require exact-head GitHub Actions.

This does not prove representative season-out data, source/settlement
correctness, calibration, CLV, drift, statistical significance, predictive
superiority, profitability, model promotion, storage or production operation.
It is a synthetic offline D1 milestone, not completion of D1 or issue #81.

## Issue #81 D3 football settlement checkpoint — 2026-11-20

Branch `win-draft/d3-football-dnb-double-chance-20261120` is stacked on draft
PR #97 exact `547ef076a60dc8cc88ae97f46732609bb3bfa0dd`.

The existing pure full-time result adapter now evaluates conservative football
Draw No Bet and Double Chance inputs. DNB maps exactly one home/away selection,
returns `void` on a regulation draw, and rejects draw or conflicting selections.
Double Chance accepts only exact 1X, X2, or 12 combinations (including bounded
documented English/Polish labels). Ambiguous wording fails closed.

The pre-existing period guard continues to reject half/period, extra-time,
overtime, and shootout inputs before settlement. Asian handicaps, spreads,
quarter lines, cards, corners, player props, abandonment/postponement and
bookmaker-specific conventions remain unsupported. The adapter fetches no
results or odds, calls no paid API, writes no production data and places no bet.

Verification before this handover update: targeted settlement tests 12/12,
full Node tests 135/135, quality gates 113/113, build 77 required files plus 44
architecture checks, and exact-base `git diff --check` passed. Re-run these on
the final handover commit and require exact-head GitHub Actions as remote
evidence.

This is a synthetic offline mapping improvement. It does not establish event or
score provenance, independently verify evidence, prove compatibility with a
live provider, or demonstrate historical coverage, settlement accuracy,
profitability, deployment or production readiness. It is not completion of D3
or issue #81.

Independent review of PR #98 identified an ambiguity regression in the shared
1X2 path: compound picks containing a home marker and draw marker could be
reduced to home. The hardening update now rejects compound connectors, other
settlement-family terms and contradictory outcome/team markers before mapping a
single 1X2 outcome. Exact team names, `Home win`, `X` and away-team selections
remain supported. Adversarial tests cover Home-or-Draw, Home-or-Away,
Home-win-or-Draw, conflicting team names, and mixed DNB/Double Chance market
families. Final exact-head verification and CI evidence must be reported after
the hardening commit.

Verification before the hardening handover commit: targeted settlement tests
13/13, full Node tests 136/136, quality gates 113/113, build 77 required files
plus 44 architecture checks, and exact-base `git diff --check` passed.

## Issue #81 D3 Asian handicap settlement checkpoint — 2026-11-20

Branch `win-draft/d3-asian-handicap-settlement-20261120` is stacked on
independently accepted draft PR #98 exact
`80e55bef0cb212dd50c888799c03c3618e7eae7e`.

The existing observed-market Asian handicap calculation is reconciled with the
shared pure result adapter through one selected-side helper. It accepts an
explicit finite line or one signed line in the selection, settles regulation
whole/half lines by adjusted goal margin, and preserves `void` on a zero margin.

Quarter and other split lines remain unsupported because the coupon outcome
model has no safe half-win/half-loss representation. European three-way
handicap, half/period, extra-time, compound, ambiguous-line/side and implicit
provider-orientation cases fail closed. No result, odds or provider data is
fetched by the helper, and no coupon or bet is created.

Verification before this handover update: targeted settlement tests 15/15,
full Node tests 138/138, quality gates 114/114, build 78 required files plus 44
architecture checks, and exact-base `git diff --check` passed. Re-run on the
final handover commit and require exact-head GitHub Actions.
This synthetic offline settlement slice does not prove score provenance,
bookmaker compatibility, historical coverage, settlement accuracy,
profitability, deployment or production readiness, and does not complete D3.

Independent review of PR #99 identified unsafe score coercion in the newly
exported helper: null, blank and fractional score fields could be converted and
settled. The hardening update requires present non-negative safe-integer number
fields and explicitly rejects digit strings, missing/null/blank, fractional,
negative, nonfinite and malformed values through both the direct helper and the
shared full-time entry point. Valid zero-zero, nonzero whole/half-line
win/loss/void behavior remains covered. Final exact-head evidence must be
reported after the hardening commit.

Verification before the hardening handover commit: targeted settlement tests
16/16, full Node tests 139/139, quality gates 114/114, build 78 required files
plus 44 architecture checks, and exact-base `git diff --check` passed.

## Issue #81 D3 European handicap settlement checkpoint — 2026-11-20

Branch `win-draft/d3-european-handicap-settlement-20261120` is stacked on
independently accepted draft PR #99 exact
`f518f121b52457bfd5e40f6e28e5a1f270cc721a`.

The shared pure result adapter now supports regulation European three-way
handicap only when callers provide explicit bounded integer home and away
adjustments. The adjusted score determines a home/draw/away result and one
unambiguous 1X2-style selection settles won or lost.

Provider notation such as `(1:0)` is never interpreted because label
orientation is not typed evidence. Missing/string/fractional/out-of-range
handicaps, malformed scores, compound selections or markets, and period,
extra-time or Asian cases fail closed. The helper performs no provider call,
storage write, coupon construction or betting action.

Local verification: targeted settlement tests 18/18, full Node tests 141/141,
quality gates 115/115, build 79 required files plus 44 architecture checks,
and exact-base `git diff --check` passed. GitHub Actions run `44758594377`,
job `136364823073`, succeeded for implementation commit
`58ba76a7b025beb9851f5d2109220546d48f8627`; exact-head CI will be reported
after this handover-only evidence update.

This synthetic arithmetic does not prove score provenance, provider rules,
historical coverage, settlement accuracy, profitability or production
readiness, and does not complete D3 or issue #81.
