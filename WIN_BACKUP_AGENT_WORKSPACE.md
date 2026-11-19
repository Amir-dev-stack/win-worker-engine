# WIN Backup Agent Workspace — Primary Codex / Backup Ollama-OpenCode Handoff

**Owner instruction (2026-11-19):** When Codex is genuinely unavailable, authorized backup coding agents should be able to continue safe WIN development **in separate files on isolated branches**. When Codex returns, it must independently check the design, security, tests and integration quality; accept, repair or reject backup work rather than blindly merging it.

**State of this document:** Workflow specification and staging convention **only**. Creating this document does **not** start Ollama/OpenCode, run a persistent monitor, enable a cloud host, or deploy PR #35/#36. Follow the verified runtime/lease requirements below before claiming automatic takeover.

## 1. Source of truth and existing work — do not duplicate

- Project repository: `Amir-dev-stack/win-worker-engine`. Mainline code on `main` is **not** the backup scratchpad.
- Read `AGENTS.md`, `WIN_PROJECT_MEMORY.md`, `WIN_HANDOVER.md`, [coordination #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20), [incident #46](https://github.com/Amir-dev-stack/win-worker-engine/issues/46) before selecting work. Confirm remote `main` SHA and active draft PRs.
- Existing failover policy: [draft PR #35](https://github.com/Amir-dev-stack/win-worker-engine/pull/35) (`scripts/win-development-failover-policy.mjs`) — **policy-only**, no real dispatch.
- Existing cloud backup reviewer: [draft PR #36](https://github.com/Amir-dev-stack/win-worker-engine/pull/36) (`scripts/win-cloud-backup-review-worker.mjs`, optional adapter, tests, design) — **review proposal only**, not an authorized unattended writer or deployed worker. Preserve the historically frozen/dirty PR #36 worktree.
- Existing mock supervisor and issue #60 are complementary: do not build a parallel scheduler, duplicate model router, or pretend that an issue comment is a validated heartbeat/lock.

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