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
