# WIN master completion matrix

Updated 2026-11-26. Status values are evidence-based and remain open until the
acceptance criteria in issue #81 are independently met.

| Requirement | Status | Evidence / next gate |
| --- | --- | --- |
| A01 Cloud execution | BLOCKED | Supported CLI list/status calls return 403 `Domain forbidden`. Need real task receipts and PC-off runs. |
| A02 Scheduler | IN PROGRESS | Bounded local dispatcher drafts #85/#87 and lifecycle integration in [#112](https://github.com/Amir-dev-stack/win-worker-engine/pull/112). Live launch interface remains unavailable. |
| A03 Model routing | IN PROGRESS | PR #69 routes by verified catalog, capability and reasoning effort. Live account catalog remains unverified. |
| A04 Limit recovery | IN PROGRESS | [#109](https://github.com/Amir-dev-stack/win-worker-engine/pull/109) adds sanitized checkpoints, limit classification, reset wait and idempotent resume. Live reset observation remains unverified. |
| A05 Backup takeover | IN PROGRESS | State machine in [#110](https://github.com/Amir-dev-stack/win-worker-engine/pull/110) and lifecycle handoff in [#112](https://github.com/Amir-dev-stack/win-worker-engine/pull/112). Trusted takeover and restoration remain unverified. |
| A06 Agent roles | IN PROGRESS | Role and review contracts exist in draft #52. Executing scheduler integration remains open. |
| A07 Persistent memory | IN PROGRESS | Project memory and handover files exist. Neon `win-memory` and its disposable branches were inspected read-only in #112. Cross-session automatic loading and durable performance records remain open. |
| A08 Handover | IN PROGRESS | WIN_HANDOFF_V1 records exist in issue #20. Authenticated WIN_NEXT_V1 consumption remains open. |
| A09 GitHub security | IN PROGRESS | Drafts #72/#83 cover read-only leases and CAS design. Writer activation remains prohibited. |
| A10 Ownership / fencing | IN PROGRESS | #108 and #112 have isolated PostgreSQL/CAS evidence. Adapter-level cross-process crash and takeover acceptance remains open. |
| A11 Bug detection | IN PROGRESS | CI and incident ledger exist. Automated bounded triage remains open. |
| A12 Bug repair | NOT STARTED | No independently accepted automated repair loop. |
| A13 QA | IN PROGRESS | Deterministic tests and CI exist. Live cloud/failover evidence remains open. |
| A14 Crash recovery | IN PROGRESS | Snapshot and quarantine tests exist. Process crash and restart evidence remains open. |
| A15 Performance learning | IN PROGRESS | [#111](https://github.com/Amir-dev-stack/win-worker-engine/pull/111) records bounded outcome metrics and deterioration signals. Durable history and independent learning evaluation remain open. |
| A16 Financial isolation | VERIFIED (draft controls) | Free-first and no-spend gates are documented and tested offline. Live quota/cost evidence remains open. |
| A17 Owner approvals | NOT STARTED | No independently verified mobile approval workflow. |
| A18 Monitoring | IN PROGRESS | Environment status and native coordination schedule are observable. Codex task health remains blocked. |
| A19 Product development | IN PROGRESS | Draft product work continues across C/D/E queues. Product acceptance remains open. |
| A20 End-to-end acceptance | BLOCKED | Requires real task, model/backup transition, handoff and two-hour PC-off evidence. |

No row may be marked complete based solely on documentation, mocks, pull requests
or ChatGPT automation records.
