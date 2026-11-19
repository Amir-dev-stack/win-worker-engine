# WIN Development Continuity and Codex Backup — Draft v1

## Why this exists

WIN's development must continue despite Codex usage exhaustion, a stalled task, local PC shutdown, expired session, unavailable provider, or a lost conversation. **No single assistant's chat or uncommitted local workspace is durable project memory.** A cloud coding session can continue without the PC only while the cloud task actually runs; it cannot be assumed to work forever or restart itself.

This is a **failover architecture proposal**, not a running watchdog or automatic Codex replacement.

## Roles and takeover hierarchy

| Role | First choice | Limitations |
| --- | --- | --- |
| Primary developer | Codex (existing authorized WIN task) | Quota limits, local-vs-cloud execution, transient task lifetime |
| Backup project coordinator/reviewer | ChatGPT Work when entitled and launched; otherwise a manually approved independent cloud worker | Requires a supported cloud environment, credentials and available quotas; does not inherit Codex local uncommitted files |
| Backup coding worker | OpenCode + Ollama on owner's Windows machine | Stops when the PC is off; constrained to isolated branches/workspaces with explicit permissions |
| Last-resort project recovery | Owner + GitHub private repo + reviewed durable WIN handover + backups | Repository alone may not contain uncommitted code or full memories |
| Durable coordination | GitHub issue #20, focused task issues, draft PRs; proposed Neon task/memory system | Issue comments are evidence/history, not an atomic execution lock or complete production memory |

An inactive Codex task does **not** automatically create a license for another agent to edit its branch or use the owner's PC. The user controls sensitive access and expenses. All takeovers must preserve the currently reported dirty local WIN checkout, untracked files and GitHub draft/prod boundaries.

## Required durable checkpoint before and during a task

Each approved development task should have:
- Unique task ID and repository; approved scope and explicitly allowed paths.
- Primary worker ID, an **authoritative signed/authenticated heartbeat source** and an expiring atomic lease from a trusted shared store (eventually Neon). A new GitHub comment is not a heartbeat.
- Base branch and exact commit SHA; intended head branch, PR link, current test results, unresolved failures, next reproduction command, relevant source artifacts, and redacted design decisions.
- A scrubbed, versioned handover record in GitHub and durable WIN memory, plus backups of worktrees containing *approved, non-secret* unpublished edits. A draft PR should be committed only after owner-acceptable safe staging; never blindly add ignored files or credentials.
- Explicit ownership/independent reviewer boundaries, no payment or billing access, strict $0 backup calls unless separately approved.

## Loss-of-Codex procedure

1. Detect **suspected stall**: expired authoritative heartbeat or reported quota exhaustion. Check whether the primary is **still active**. Do not infer current activity from elapsed time, the Codex UI text alone, or lack of GitHub commits.
2. Confirm authoritative task lease expiration or explicit revocation. If the lease is still active, **hold** rather than overlapping two workers.
3. Recover last durable checkpoint from GitHub issue #20, the task issue, exact draft PR and shared cloud memory. Inventory local-only work separately; do not claim it exists in GitHub.
4. Require approval for the specific backup principal, task ID, previous lease ID, allowed paths and expiry; authenticate the backup via a trusted service. Never take the owner's conversational instruction as an API credential.
5. The trusted supervisor atomically claims a new lease in shared storage and records an auditable handoff. **The V1 module does not execute steps 1–5**; it only proposes a read-only handoff if the externally asserted conditions are satisfied.
6. Run backup read-only evaluation and tests on an isolated branch. Submit a draft PR proposal or issue comment. An independent reviewer checks it before any actual write-enabled worker or merge.
7. When Codex returns, it reads the exact same checkpoint and leases, avoiding duplicated work or divergent branches. Preserve review history, do not silently overwrite competing changes.

### Windows PC off

Local Ollama and OpenCode **cannot run**. Only an actually scheduled/started supported cloud worker can resume cloud-safe tasks. ChatGPT Work/Codex cloud availability and usage are account-dependent; GitHub/Neon storing state do not themselves execute tasks. There is currently **no verified always-on cloud coding backup**.

### Fail-closed policy prototype

`scripts/win-development-failover-policy.mjs` exports `proposeDevelopmentFailover(input, nowMs)`, a pure deterministic decision helper. It returns `hold_and_report` unless the task is explicitly approved and draft-only, the primary is no longer healthy, its lease expired, the backup is different, isolated/read-only, available, and the time-limited takeover is explicitly authorized for the same lease. An eligible result is a **proposal, not execution**, and must still be verified and atomically claimed in trusted storage.

Run locally in an isolated checkout:

```powershell
node --test scripts/win-development-failover-policy.test.mjs
```

No GitHub Actions workflow, scheduled job, Netlify function, database migration, or paid provider was added. The reported tests are **not yet executed** on this draft head.

## Acceptance tests before real failover

1. Prove task records and checkpoint recovery work after local sessions end.
2. Test missing heartbeat, stale-but-leased worker, concurrent takeover race, replayed approvals, invalid principal and PC-off scenarios with an isolated fake store.
3. Demonstrate that the backup cannot access project secrets, billing, personal files, unreviewed memory or production deployments.
4. Validate local OpenCode read-only execution only when PC online; validate cloud-capable independent backup separately when available.
5. Test a crash + restart + lease recovery with correct attribution, no double work, secret-free audit logs and owner-readable status.
6. Run focused, full repository and integration checks, followed by independent review. Do not enable automatic write access until all gates pass.

## Owner-visible outcome

- **Now:** Durable plan, decision policy and tests. No automatic takeover running.
- **Next:** Trusted shared task/lease store, safe cloud executor, independent reviewer and tested status notifications.
- **Goal:** Codex can stop and WIN can resume approved work safely from the latest persistent checkpoint, without requiring the owner's PC for cloud-safe tasks.

WIN coordination: [Issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20).
