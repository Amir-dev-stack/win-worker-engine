# WIN master completion checklist

Updated 2026-11-26. The owner assignment defines A01–A20. [Issue #81](https://github.com/Amir-dev-stack/win-worker-engine/issues/81) defines execution order. [Issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20) records handoffs and [issue #46](https://github.com/Amir-dev-stack/win-worker-engine/issues/46) records incidents. Leave a box open until its acceptance conditions have independent evidence.

## Infrastructure

| Done | Requirement | Current evidence and next gate |
| --- | --- | --- |
| [ ] | A01 Cloud execution | CLI exposes list, create and status commands, but `codex cloud list --json --limit 1` is blocked by HTTP 403 `Domain forbidden` at `chatgpt.com/backend-api/wham/tasks/list`. This proves programmatic listing is blocked. Creation and status remain unverified because no task ID exists and no unsupported side effect will be attempted. [#87](https://github.com/Amir-dev-stack/win-worker-engine/pull/87) |
| [ ] | A02 Scheduler | Mock supervisor on main and offline dispatcher in [#85](https://github.com/Amir-dev-stack/win-worker-engine/pull/85). Need live execution adapter and dependency/resume acceptance. |
| [ ] | A03 Model routing | Offline policy drafts [#51](https://github.com/Amir-dev-stack/win-worker-engine/pull/51), [#64](https://github.com/Amir-dev-stack/win-worker-engine/pull/64) and [#69](https://github.com/Amir-dev-stack/win-worker-engine/pull/69). Verify model eligibility and zero-cost terms and keep Astra architecture preference. |
| [ ] | A04 Limit recovery | Mock supervisor and inference failover draft [#68](https://github.com/Amir-dev-stack/win-worker-engine/pull/68). Need supported Codex checkpoint/reset and actual no-spend fallback evidence. |
| [ ] | A05 Backup | Staging and reconciliation drafts [#67](https://github.com/Amir-dev-stack/win-worker-engine/pull/67), [#71](https://github.com/Amir-dev-stack/win-worker-engine/pull/71). Isolated PostgreSQL test verifies backup abstention when the original effect is uncertain. Need trusted reconciliation, safe reclaim and return to primary. |
| [ ] | A06 Agent roles | Role contract [#52](https://github.com/Amir-dev-stack/win-worker-engine/pull/52), separate secondary-worker claims in #20. Need durable role binding and independent approval controls in the executing scheduler. |
| [ ] | A07 Memory | AGENTS, project memory and handover loaded in this session. Need persistent linked performance records and recovery across separate agents and executions. |
| [ ] | A08 Handover | Issue #20 contains WIN_HANDOFF_V1 and coordination records. Need verified WIN_NEXT_V1 retrieval, issuer authentication, deduplication, acknowledgements and restarted consumption. |
| [ ] | A09 GitHub | Current [#72](https://github.com/Amir-dev-stack/win-worker-engine/pull/72) requires development task type and the exact approved source on both lease checks. [#83](https://github.com/Amir-dev-stack/win-worker-engine/pull/83) models atomic ref updates offline. Need scoped read credential, approved scanner, atomic effect-side fencing and exact-head independent security approval. Writer activation remains prohibited. |
| [ ] | A10 Ownership | [#72 isolated CI](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44502457140) and this branch’s disposable PostgreSQL test establish contention, revocation, expiry, stale fences and quarantine. Need approved takeover and coordinator crash/restart acceptance. |
| [ ] | A11 Detection | CI and incident ledger exist. Need bounded automated triage tied to verified signals. |
| [ ] | A12 Repairs | Draft-only validation exists. Need eligible repair assignment lifecycle, attempt limits and independent acceptance. |
| [ ] | A13 QA | Local suite and public CI evidence exist. Need exact-head independent CI and real cloud/failover/handoff verification. |
| [ ] | A14 Recovery | Mock snapshot restart and real DB quarantine/receipt probes exist. Need process crash recovery and trusted disposition of uncertain tasks. |
| [ ] | A15 Performance | Need durable performance evidence and measured improvement before adaptive routing is accepted. |
| [ ] | A16 Financial isolation | Existing controls and offline policies exist. Live eligibility and quota checks remain unverified. Allow zero new spend only. |
| [ ] | A17 Owner approvals | Issue ledger exists. Need supported mobile notifications and independently verifiable owner approvals. |
| [ ] | A18 Monitoring | Environment status reports connected cloud infrastructure. Native ChatGPT automation `WIN Cloud Development` is enabled for repository coordination, and its prompt explicitly states that it does not launch Codex. Durable Codex task, provider, quota and recovery observations remain unverified. |
| [ ] | A20 Acceptance | Needs genuine PC-off schedule, assignment, exact-head review, safe fallback, receipt and multiple cycles. |

## Product

A19 remains open. The secondary worker most recently handed off draft [#107](https://github.com/Amir-dev-stack/win-worker-engine/pull/107) at `4a4552ae6bc1dd4c6388b25942b35f7e3e1ef954` with [passing validation CI](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/45788331229). This is bounded D3 evidence. Product acceptance still requires the independent roadmap gates.

- [ ] C1–C4 Coverage, evidence ingestion, analytics and point-in-time ledger. Drafts #88–#95 include inventory, provenance and snapshot work.
- [ ] D1–D3 Baselines, research roles and verified market settlement. Drafts #96–#105 and #107 include offline validation and bounded settlement.
- [ ] D4–D6 Paper coupon construction, result feedback and learning/reliability acceptance.
- [ ] E-track Dashboard, operations, free-first controls and owner acceptance per #81.

## Checkpoint

The isolated test extends draft #86, head `2950f6fe9721b63442570d52573a7c2181781690`. The production checkout and the secondary worker’s branches were left intact. An independent agent inspected #72, #83 and #86 evidence and identified the gap between a pre-effect lease renewal and effect-time fencing. The new test exercises a synthetic effect in the same PostgreSQL transaction as the fence check. GitHub ref mutation and live provider calls remain outside the verified scope.

## Cloud access checkpoint — 2026-11-26

The managed environment is connected and reports a restricted network policy. The
installed Codex CLI supports `cloud list`, `cloud exec`, and `cloud status`.
`cloud list --json --limit 1` returned HTTP 403 `Domain forbidden` from the
`chatgpt.com/backend-api/wham/tasks/list` transport. This is a programmatic task
listing restriction. Task creation was not attempted because no supported
authorization path was verified, and task status cannot be tested without a real
task ID. No credentials were requested, no private endpoint was probed, and no
access restriction was bypassed.

The enabled native `WIN Cloud Development` ChatGPT automation is a supported
coordination fallback. Its own instructions explicitly distinguish it from Codex
dispatch and prohibit claiming that it launches Codex. It may continue safe
nonconflicting repository work while A01 remains blocked.

When a supported Codex execution mechanism is verified, arrange a two-hour
owner-PC-off window and record a real task ID, timestamps, workspace, branch,
commit, test evidence, and handoff before considering A01 or A20 complete.
