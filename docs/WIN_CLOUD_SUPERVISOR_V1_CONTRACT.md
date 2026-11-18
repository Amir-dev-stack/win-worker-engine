# WIN Cloud Supervisor V1 — implementation contract

Status: DESIGN ONLY / NOT DEPLOYED. Owner scope recorded in issue #20, 2026-11-18.

## Goal
Coordinate all 10 requested capabilities in ONE cloud-hosted, PC-independent system. Never claim 24/7 availability or Codex quota-reset resumption without an authenticated real cloud test.

## Required capabilities and acceptance tests

| # | Capability | Minimum observable acceptance evidence |
|---|---|---|
| 1 | Work with PC off | One authenticated cloud coding task completes with local PC powered off; commit and logs linked |
| 2 | Continue long-term goals | Persist goals, dependencies, branch refs, checkpoints, and next action; recover after service restart |
| 3 | Scheduled cloud tasks | Cloud scheduler triggers idempotent research/health/test jobs in specified timezone |
| 4 | Eligible approval auto-review | Low-risk isolated code/test approvals via supported native policy; sensitive permissions deny/escalate |
| 5 | Coordinate coding agents | Durable task assignments and bounded handoffs among developer, QA, debugger, security, research, learning |
| 6 | Choose task models | Configurable verified model IDs, low-cost task classifier, fallback when supported; no inferred account entitlement |
| 7 | Resume after quota reset | On actual quota signal persist waiting_for_quota, use trusted reset or sparse backoff, then authorized resumption test without clicking Continue; if unsupported stay BLOCKED |
| 8 | Run continuously | Provisioned cloud host, durable queue, heartbeats, watchdog, graceful shutdown, dead-letter queue and recovery; no uptime guarantee |
| 9 | Detect and safely repair WIN bugs | Reproducible incident, isolated branch, test failure -> fix -> test pass -> draft PR; no automatic production merge |
| 10 | Analyze sports and evaluate learning | Source-attributed sports data, pre-match timestamped forecasts, post-match outcomes, calibration, log-loss, CLV where odds exist, data-coverage and learning regression reports |

## Proposed modules
- **Scheduler + supervisor:** cloud container/service, lease-based queue worker, job deduplication and heartbeat; no dependence on Windows local sessions.
- **Durable state:** Neon PostgreSQL (only after existing schema/permissions verified); GitHub for issues, PRs, code/checkpoints. No secrets in either.
- **Task router:** classify cost/complexity; specialist handoffs; PR #51 Windows router is research material, not cloud runtime. Terra/Sol/Astra names are conceptual until actual accessible model IDs confirmed.
- **Quota state machine:** queued -> running -> waiting_for_quota -> queued; or blocked_human, failed, completed, dead_letter. Backoff bounded, max attempts fixed. Never circumvent plan limits or scrape tokens.
- **Development lane:** code/tests on isolated branches; peer/security review after required quality gates; owner-visible draft PR. Respect frozen PR #36 and dirty local PR #49.
- **Research/learning lane:** ingest licensed/free data with provenance, coverage and timestamps; paper-only outcome tracking; measured walk-forward evaluation; detect drift or missing player/team statistics.
- **Audit and kill switch:** no-secret event log, per-job usage caps, manual stop, rollback and escalation.

## Safety invariants
1. Zero new spending, no auto-recharge, no changes to payments/billing, and preserve $5/month OpenAI API ceiling if API ever used.
2. No real wagering, financial transactions, production writes or destructive changes by autonomous worker.
3. No credential extraction from local desktop, copied sign-in state or credential sharing in repository.
4. No unbounded retry/model loops; every external call must have a retry, deadline and cost policy.
5. No auto-approval for secrets, payments, sandbox escape, deployment or irreversible operations.
6. Provider/task dispatch and cloud authentication must be officially supported and tested before activation.

## Implementation phases and gates
**Gate A — Cloud prerequisites:** Verify Codex cloud environment, repository permissions and actual supported task interface; audit hosting options without provisioning paid infrastructure. Establish owner-authenticated sandbox cloud smoke test. If cloud provider unavailable, document blocker.

**Gate B — Durable supervisor core:** Implement queue, state transitions, idempotency, heartbeats, retry caps, kill switch and mock adapters. Tests: crash/restart, duplicate delivery, stop, denied permission.

**Gate C — Agent routing and quota handling:** Mock provider adapter; classify roles/models, save state on 429/quota, sparse backoff, simulated reset/recovery, unavailable model and human-approval block. Actual resumption conditional on official cloud API/auth support.

**Gate D — Autonomous QA + continuous research:** Isolated bugfix PR flow, scheduled data ingestion, outcome reconciliation, walk-forward learning, calibration and missing-statistic incidents.

**Gate E — Real end-to-end PC-off proof:** Provision a genuinely free/authorized cloud host, run bounded tasks, log uptime/heartbeat and failures, confirm alarms and no-production/no-spending limits.

## Initial next engineering action
On a separate development branch add a runtime-neutral queue schema, a mock-only supervisor and Node tests for:
- quota-exhaustion -> checkpoint -> waiting_for_quota -> simulated reset -> exactly-once resume;
- worker restart, duplicate task delivery, model unavailable, denied approval and budget/kill-switch blocks.

These are acceptance tests, not claims that real Codex or 24/7 hosting is operational. Report exact tested commit and command before enabling anything.
