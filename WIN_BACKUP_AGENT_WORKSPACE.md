# WIN Backup Agent Workspace — Primary Codex / Backup Ollama-OpenCode Handoff

**Owner instruction (2026-11-19):** When Codex is genuinely unavailable, authorized backup coding agents should be able to continue safe WIN development **in separate files on isolated branches**. When Codex returns, it must independently check the design, security, tests and integration quality; accept, repair or reject backup work rather than blindly merging it.

**State of this document:** Workflow specification and staging convention **only**. Creating this document does **not** start Ollama/OpenCode, run a persistent monitor, enable a cloud host, or deploy PR #35/#36. Follow the verified runtime/lease requirements below before claiming automatic takeover.

## 1. Source of truth and existing work — do not duplicate

- Project repository: `Amir-dev-stack/win-worker-engine`. Mainline code on `main` is **not** the backup scratchpad.
- Read `AGENTS.md`, `WIN_PROJECT_MEMORY.md`, `WIN_HANDOVER.md`, [coordination #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20), [incident #46](https://github.com/Amir-dev-stack/win-worker-engine/issues/46) before selecting work. Confirm remote `main` SHA and active draft PRs.
- Existing failover policy: [draft PR #35](https://github.com/Amir-dev-stack/win-worker-engine/pull/35) (`scripts/win-development-failover-policy.mjs`) — **policy-only**, no real dispatch.
- Existing cloud backup reviewer: [draft PR #36](https://github.com/Amir-dev-stack/win-worker-engine/pull/36) (`scripts/win-cloud-backup-review-worker.mjs`, optional adapter, tests, design) — **review proposal only**, not an authorized unattended writer or deployed worker. Preserve the historically frozen/dirty PR #36 worktree.
- Existing mock supervisor and issue #60 are complementary: do not build a parallel scheduler, duplicate model router, or pretend that an issue comment is a validated heartbeat/lock.

## Cloudflare Workers AI as an existing cloud backup candidate

**Do not overlook the preexisting implementation.** [Draft PR #36](https://github.com/Amir-dev-stack/win-worker-engine/pull/36) contains `scripts/win-cloudflare-free-adapter.mjs` and `scripts/win-cloudflare-free-adapter.test.mjs`, alongside the provider-neutral backup review worker. [Issue #65](https://github.com/Amir-dev-stack/win-worker-engine/issues/65) is a separate Cloudflare offline contract/test track. Read and reconcile those, plus [cloud-first inference issue #63](https://github.com/Amir-dev-stack/win-worker-engine/issues/63), **before** writing another Cloudflare adapter or provider selector.

- Proposed first model: `@cf/zai-org/glm-4.7-flash`. Cloudflare's July 28, 2026 changelog lists it among models eligible for Workers Free. That list is **not evidence of this owner's Cloudflare account eligibility or remaining quota**.
- Cloudflare's published Workers AI Free allocation is 10,000 Neurons/day, with further operations failing at the free limit. Some models require a Paid plan. **No paid fallback is allowed.** Recheck official model eligibility, terms and quota before any live request.
- **Inference is not a coding worker by itself.** A real PC-independent fallback also needs an authorized cloud execution host/scheduler, authenticated GitHub read/write rights limited to staging branches, trusted atomic primary/backup lease, task queue, bounded model context and output, proposal validation, CI/sandbox tests, and Codex return-review.
- Current PR #36 is **unmerged/unconnected** and only prepared a bounded read-only reviewer. It does not autonomously create code, run tests or submit backup PRs. Treat any later write-capable extension as a separate guarded implementation, validated with synthetic workloads first.
- A source snapshot/patch sent to Cloudflare is a third-party data transfer. First verify applicable license/privacy/retention requirements and safe approved content scope. Never expose secrets, private credentials or unfiltered source dumps.
- Until account-specific Free entitlement, hosting, required credentials, safe identity and lease control, privacy consent and end-to-end test are actually verified, label Cloudflare `CANDIDATE_UNVERIFIED`. **Never describe it as active automatic Codex backup.**

Official references: https://developers.cloudflare.com/workers-ai/platform/pricing/ and https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/ .

## Cost-aware Codex model routing — use the EXISTING single router

The owner clarifies: **do not use Astra (or the highest model) to draft architecture for every task**. Architecture-first is mandatory only for **new or substantially changed system design, cross-service contracts, high-risk security/storage/migrations, concurrency/leases, or work that would otherwise need a costly architectural rewrite**. A small bug fix, documentation change or straightforward feature should skip the Astra architecture step entirely.

The model-switching code belongs in the **existing** [draft PR #51](https://github.com/Amir-dev-stack/win-worker-engine/pull/51) router `scripts/win-model-router.mjs` and launcher `scripts/Start-WINAutoModels.ps1`. Do not create a second router or hardcode different assignments in PowerShell.

| Assignment | Preferred verified model / effort | Expensive architecture call? | Allowed outcome |
| --- | --- | --- | --- |
| Simple docs, small tests, mechanical fixes | Terra / low | No | Scoped changes and tests |
| Ordinary coding, isolated feature, routine debugging | Sol / medium or Terra if validated suitable | No | Scoped implementation and tests |
| Hard debugging, complex algorithms, constrained cross-file changes | Sol / high | Only if unresolved architectural risk is proven | Implementation and focused verification |
| Genuine major architecture or high-risk change | Astra / high or strongest *verified* suitable model, **one bounded read-only plan** | Yes, if adequate plan credit/quota exists | Architecture decision record: constraints, components, risks, acceptance tests, implementer task splits; **zero code changes** |
| Independent code/QA review | Sol / medium-high by default; Astra only by exceptional high-risk gate | Not automatically | Read-only, findings with evidence |

**Live model names, entitlement, supported reasoning effort, quota and costs must come from the authenticated `model/list` and verified usage/limits—not from names, past assumptions, or an assistant's ranking.** A previous read-only local Terra run was reported completed, but this does not verify Sol/Astra entitlement. Select before dispatch; switching after failed/partial writable work requires a clean checkpoint and duplicate-write protection. Do not automatically retry an exhausted model.

### Adaptive execution and economical escalation

1. **Classify first, without an expensive model call**: task scope, architectural novelty, security/data integrity, required reasoning, available model catalog and effective limit buckets. If classification is uncertain, choose safe analysis rather than invoking Astra speculatively.
2. **Skip heavyweight planning for routine tasks.** Terra or Sol directly edits a scoped isolated branch and runs targeted tests. For major tasks, use *one* read-only high-capability architecture call to produce `ARCHITECTURE.md` or an equivalent sanitized plan in the task branch, with acceptance criteria and change boundaries, before cheaper implementers write code.
3. Handoff the approved architecture/acceptance criteria to Sol/Terra. They may switch models **between bounded task stages**, based on actual complexity and fresh eligibility. Do not repeatedly use Astra to code, debug test failures, run mechanical fixes, or review every commit.
4. Allow Astra second-pass architecture clarification only when concrete evidence shows a design contradiction or high-risk unresolved choice, never on an unbounded loop; record why the call is justified, actual credit usage if known, and stop on exhausted/unknown quota.
5. Use tests, static gates and deterministic tools before invoking any expensive AI review. Routine review by Sol; independent Astra review is exceptional, not the default for `--review-after`.
6. When Codex is **truly unavailable**, attempt trusted backup failover under section 2: Cloudflare only if verified free-capable hosted runtime / lease / approved source transfer exists, otherwise OpenCode/Ollama only with PC online. Maintain a separate proposal branch. Do not equate switching Codex models with switching to an independent backup host.
7. On Codex return, independently audit backup output for alignment with the original architecture, tests and active main. `ACCEPTED`, `REPAIR_REQUIRED` or `REJECTED` follow the mandatory review gate; never merge backup branch automatically.

### Acceptance tests for PR #51 / failover integration

- Routine docs/feature/debug tasks **never call Astra automatically**; small work skips architecture.
- Significant architecture/security/migration cases request exactly one **read-only** architecture plan before implementation; the architect command cannot mutate source even if the prompt asks.
- Normal implementation is assigned a verified lower-tier model and can change tier only at a safe checkpoint; mismatch/expired model list fails closed.
- Unknown or exhausted quotas, unauthenticated session, paid API auth, unsupported effort, or unknown credit budget cannot initiate expensive calls.
- Reviewer selected by the JS router and PowerShell launcher is consistent; no unconditional Astra `--review-after`.
- A failed or partially completed write is never replayed on another model without verified resume/idempotency and ownership.
- Backup does not activate for momentary silence, absent cloud environment listing or active Codex lease; verified expired lease triggers at most one bounded takeover attempt when an independently authenticated runner is truly available.
- Backup commits remain isolated, Codex return performs independent code+architecture review, and acceptance is not automatic production merge.
- Report actual model invocations/credits per task when available; label quota, cost and cloud availability `UNVERIFIED` otherwise. Do not claim savings without before/after comparison or reliable cost data.

## 2. When backup is allowed to take an assignment

Backup may proceed ONLY if (a) a task is explicitly in WIN scope and authorized; (b) Codex has explicitly handed it off, completed it or a **trusted** primary lease has expired / an actual quota failure is verified; (c) the assignment is not already owned by an active primary or another backup; (d) the backup runtime, model, quota, repo access and working directory are verified; and (e) safety/cost and file-scope gates pass.

- **Do not infer unavailability merely from silence, GitHub inactivity, or a missing CLI environment list.**
- Until the trusted atomic lease/heartbeat and dispatcher are implemented and end-to-end tested, use an explicit dated issue #20 handoff naming the task, branch, backup agent and constraints. If no safe verified handoff exists, backup can research and prepare an offline proposal but must not claim exclusive takeover.
- Ollama/OpenCode on the owner's Windows PC can operate only while the PC and local runner are online. An agent that must continue while the PC is off requires a separately verified, authorized, free cloud host. The current draft cloud reviewer does not provide this.
- Do not transmit repository content to a third-party model unless source privacy, license, provider retention and user consent are verified; assume no new spending.

## 3. Strictly separate backup work from live project code

For each backup assignment create a **new isolated worktree/branch** based on the newest verified main commit, for example:

`backup/<agent>-<issue>-<yyyymmdd>-<short-slug>`

Keep all tentative implementations and evidence under:

`drafts/backup-agent-workspace/tasks/<task-id>/`

That task directory should contain:

| Artifact | Purpose |
| --- | --- |
| `MANIFEST.md` | Task owner, handoff evidence, current SHA, scope, allowed paths, intended source destinations, reason primary is unavailable, restrictions and state |
| `proposal/` | Candidate new or changed code files, preserving intended relative paths; **never** edit real `main` files to stage the proposal |
| `TEST_REPORT.md` | Exact commands, actual pass/fail/skipped counts, test environment, regressions and gaps |
| `REVIEW.md` | Codex's later decision and evidence (not pre-filled as approved) |

Only create these when a real assignment exists. Backup work should remain a **draft PR against main** and must not be auto-merged, deployed, or used by production runtime.

Do not write into the primary's dirty worktree, frozen PR #36, the existing PR #49 local worktree, secrets/config files, production DB or live services. Never blindly run `git add -A`, force-push, reset, or overwrite another agent's checkpoint.

## 4. Required MANIFEST.md fields for each task

Use this template, completing all fields with real evidence. An absent or unknown prerequisite must say `UNVERIFIED` — never fabricate it.

```md
# WIN backup task <task-id>
Status: PROPOSED | IN_PROGRESS | READY_FOR_CODEX_REVIEW | NEEDS_REPAIR | ACCEPTED | REJECTED
Assigned backup agent:
Runtime: LOCAL_PC_ON | VERIFIED_CLOUD | UNVERIFIED
Primary-unavailable evidence: (trusted lease / explicit handoff / confirmed quota error)
Handoff issue #20 comment URL:
Starting main commit SHA:
Backup branch:
Base SHA / expected integration SHA:
Task goal:
Allowed repo paths:
Excluded paths/production systems:
Design notes and architecture tradeoffs:
Source/privacy/cost gate result:
Proposed file paths:
Tests performed and exact results:
Remaining risks and missing evidence:
Next step:
```

Use sanitized paths; do not include credentials, environment variables with values, raw logs or private user data in GitHub. The repository's visibility is currently **public**; verify again before publishing.

## 5. Backup agent execution instructions

1. Before starting, read the latest #20 assignment, AGENTS.md, main SHA and branch/PR status. Record evidence that Codex is unavailable and verify the backup assignment is unique. If unverified, only create a proposal clearly marked `PROPOSED` — no primary replacement claim.
2. Create the isolated backup branch/worktree; keep candidate code in its **own** `proposal/` tree. Make small, reversible changes. Write `MANIFEST.md` and `TEST_REPORT.md` with real results, including limitations of testing staged files.
3. Run offline validation where possible using a disposable scratch/test copy, not the live main worktree. Never pass simulated green tests off as a fully integrated repository test.
4. Open or update a **draft PR** and post one concise checkpoint to issue #20 with exact branch/commit, tasks completed and blockers. Mark `READY_FOR_CODEX_REVIEW` only after evidence is saved. Backup must not merge its own code.
5. If interrupted, commit only sanitized staged candidate files, handover state and test reports; record whether changes remain only in a local worktree and hence are invisible to other agents. Never copy credentials, personal files or raw chat histories.

## 6. Codex return — mandatory independent architecture gate

When primary Codex is available, read the newest backup PR(s), task MANIFEST, candidate code, test report, relevant architecture and current main. For each task:

1. Verify agent provenance, valid handoff/ownership, precise base SHA, task scope and no overlap with current main/active PRs.
2. Perform security, licensing, dependency, privacy, budget, reliability and architecture review; reject duplicate modules/orchestrators and unproven integrations. Check interfaces, data integrity, backward compatibility, race/lease behavior and failure recovery.
3. Review each proposed file/diff. Do not execute untrusted backup code or install packages until vetted in an isolated environment.
4. **If sound:** manually transplant/selective-cherry-pick approved changes onto a *fresh integration branch* from current main, run exact-HEAD targeted + full tests/quality/build as applicable, independent review, and then merge only through established authorized repository gates. Do not merge a backup staging branch wholesale.
5. **If fixable:** write repaired code in a new isolated integration branch, rerun checks and document what was changed. Record `NEEDS_REPAIR` until validated.
6. **If unsafe, incorrect, redundant or unverified:** `REJECTED` with reproducible reasons and no integration.
7. Record the final decision in `REVIEW.md`, backup draft PR, and #20; close or archive the backup PR only when review trail and next steps are documented. The primary must never silently overwrite backup contributions.

## 7. Minimal status vocabulary and anti-conflict rules

- `PRIMARY_ACTIVE`: Codex has a verified live assignment; backup must not write that task.
- `BACKUP_ELIGIBLE`: verified handoff or trusted expired lease, allowed runtime and scope, no overlapping writer.
- `BACKUP_WORKING`: isolated branch/task directory; no product integration.
- `AWAITING_CODEX_REVIEW`: proposal/test evidence complete, draft PR ready.
- `CODEX_REVIEWING`: primary inspects and runs independent gates without overwriting staged work.
- `ACCEPTED`, `REPAIR_REQUIRED`, `REJECTED`: evidence-backed decision; only accepted code can proceed through normal integration gates.

One writer per task. Expiry/claim must be atomic in an authenticated trusted backend before claiming true automatic failover. Do not use a Markdown status change or GitHub comment as a locking primitive.

## 8. Implementation follow-up — real automatic activation

**This staging convention is ready to use manually, not automatic takeover.** For automatic operation, Codex must validate and integrate, rather than rewrite, the draft #35/#36 policy/reviewer work with a permitted scheduler/runner, trusted queue/lease identity, quota-unavailability detection, secure task assignment and results retrieval. Test Codex failure, backup claim, duplicate-writer prevention, bounded cancellation, model outage, interrupted backup, Codex return/review and accepted/rejected integration in a nonproduction environment. Verify actual provider cost and PC-off behavior before enabling.

No automatic paid fallback, credential extraction, billing controls, production deploy, destructive branch operation or live wagering. Keep OpenAI API cap USD 5/month and stricter operational stop USD 2.95; this is not approval to spend.