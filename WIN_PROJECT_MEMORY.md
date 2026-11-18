# WIN Project Memory — reviewed sharing draft

**As of:** 2026-11-18  
**Status:** Owner-authorized, draft PR only. This document summarizes a local Codex Desktop recovery report; it is **not** a verbatim export, proof of deployment, or approval to execute production actions.

## Provenance and evidence rules

The owner recovered 22 local Codex session exports and derived 5,320 readable messages. The local reviewer reported **12 owner-decision themes, 10 completed tasks within specified scope, 8 unresolved issues, and 6 uncertain findings**. These are reviewer-classified counts, not a claim that every historical conversation was reconstructed. Six session files yielded no readable messages. Raw transcripts and unsanitized records remain local and must **never** be pushed to GitHub.

Use GitHub PRs, commits, issues and exact tested worktree identities as stronger evidence of code state than historical conversation summaries. A reported local test is not a verified remote check or production deployment.

## Owner goals and standing constraints

1. **WIN scope:** football-first, eventually multiple sports, with all viable markets and flexible paper coupon construction (including large coupons). Research should evaluate fixtures, teams, players, injuries, lineup availability, event and market rules, source confidence, historical context, odds and correlation; do not present high confidence as a guarantee.
2. **Research and learning:** source-attributed, time-stamped data; pre-match predictions; post-match reconciliation; walk-forward evaluation, calibration and log-loss; CLV only where valid odds and closing data exist. Report data gaps, regressions and incidents, not just successes.
3. **Cloud autonomy target:** an integrated, PC-independent supervisor for persistent goals, scheduled tasks, multiple agents, model routing, quota-aware pause/recovery, safe approval review, runtime monitoring, automated development QA and ongoing paper research. All ten requirements are recorded in [issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20); they are **requirements, not validated running capabilities**.
4. **Financial isolation:** free/open-source first; OpenAI API ceiling **USD 5/month**, with a stricter recorded **USD 2.95 operating stop**. No purchases, auto-recharge, changed billing settings or access to financial instruments. Stop if spending limits are reached.
5. **Safety:** no live wagering or monetary transactions; preserve source licensing, user authorization, review and data integrity. Do not expose secrets, API keys, tokens, personal identifiers or raw exception payloads.
6. **Development boundaries:** preserve uncommitted work and frozen review branches; use isolated branches, bounded tests and audit trails. Do not silently merge, deploy, run production migrations, alter sensitive permissions or destroy data.
7. **Authorization precedence:** The recovered local AGENTS.md report says commits/pushes/merges/deploys require explicit owner authorization, while later owner conversations authorize bounded autonomous project work. **Resolve this conflict in current scope before acting:** this particular owner authorization permits a **draft documentation PR only**, without merging or deploying; high-risk actions always require explicit authorization. Do not infer access from instructions.
8. **Coordination:** GitHub [issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20) is a primary project ledger. Future agents should read current repository instructions, handover, current PR discussions and relevant issue comments before proposing work.

## Historical architecture / agent roles (reported, not independently retested here)

- Netlify application provides dashboard and server-side API/MCP surfaces; older research and scheduler state used Blobs. Neon/PostgreSQL is the proposed durable worker queue; isolated validation is not production migration.
- Departmental research design: D1 public fixtures/scouting; D2 sport and participant analysis; D3 market/settlement definitions; D4 quantitative evidence and uncertainty; D5 source/tipster research; D6 paper portfolio construction and correlation; D7 outcome verification and learning; D8 integrity/responsible play. Independent reviewer validates outcomes and lessons separately.
- Cloud supervisor should coordinate implementer, QA, debugger, security reviewer, research and learning agents using durable assignments, checkpoints, heartbeats, idempotency, bounded retries, a kill switch and human escalation.
- The optional Windows model router prototype is [draft PR #51](https://github.com/Amir-dev-stack/win-worker-engine/pull/51). Model names/entitlements, real automatic switching and cloud execution are **unverified** until tested against a supported authorized interface.

## Reported engineering accomplishments and evidence

| Scope | Evidence | Meaning |
|---|---|---|
| GitHub coordination and incident ledger | [Issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20), [issue #46](https://github.com/Amir-dev-stack/win-worker-engine/issues/46) | Auditable discussion exists |
| StatsBomb initial adapter | [Draft PR #10](https://github.com/Amir-dev-stack/win-worker-engine/pull/10) | Proposed code; not necessarily merged or live |
| Fail-closed agent coordination design | [Draft PR #29](https://github.com/Amir-dev-stack/win-worker-engine/pull/29) | Proposed foundation |
| Backup coding-review worker | [Draft PR #36](https://github.com/Amir-dev-stack/win-worker-engine/pull/36) | Remote head differs from preserved dirty local candidate; do not equate |
| Bounded StatsBomb reader / research work | [Draft PR #49](https://github.com/Amir-dev-stack/win-worker-engine/pull/49) | Recorded remote head `a2a9cd1626ac59c00452aaff63a79f0c82d5de74`; local uncommitted work is additional |
| Local safety fixes and post-match regressions | [Issue #20 checkpoints](https://github.com/Amir-dev-stack/win-worker-engine/issues/20) | Reader, immutable replay, cache provenance, pending results, resumable review and rolling coupon scan reported tested on modified PR #49 checkout |
| Persistent worker draft | [Worker checkpoint](https://github.com/Amir-dev-stack/win-worker-engine/issues/20#issuecomment-6976380093) | Service/queue/health prototype, **not a verified 24/7 cloud host** |
| Isolated database checkpoint | [Neon contention record](https://github.com/Amir-dev-stack/win-worker-engine/issues/20#issuecomment-6976282918) | Sequential resume/fencing evidence; simultaneous claims unresolved |

The local recovery report says the modified PR #49 checkout passed **122/122** tests, **121/121** gates, and build checks **66 required files + 45 architecture checks** on 2026-11-18. These are reported local results, not tests run for this documentation PR, and do not certify a remote/cloud environment.

## Priority gaps

1. CI for PR #49 failed before recorded job starts; do **not** infer test failure or resolve via billing changes.
2. PR #49 lacked a confirmed equivalent hosted preview; hosted Blobs retry/window behavior is not verified.
3. Separate Neon sessions contending for a claim returned `INVALID_ARGUMENT`; exclusive ownership and cross-process recovery remain unproven.
4. Portable worker's Docker/systemd/Linux lifecycle and PC-off execution still lack real authorized host proof.
5. Sports-data rights, source coverage, timestamp accuracy, provider limits, post-match quality and statistical learning must be validated before enabling continual ingest.
6. PR #10 remediation, PR #36 historical candidate reproducibility and missing Desktop session evidence remain open.

## Future-agent reading protocol

Read this document with [WIN_HANDOVER.md](WIN_HANDOVER.md), the repository's actual AGENTS.md when available, [issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20), and the current PR/commit before starting work. Never assume cloud session access to Desktop history or to uncommitted local files. Update proposed memories only with evidence links, dates, claimed versus verified status and explicit permission boundaries.
