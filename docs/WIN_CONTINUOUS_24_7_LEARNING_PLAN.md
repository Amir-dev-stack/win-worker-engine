# WIN Continuous Learning: Unattended 24/7 Operations — Draft V1

## Mission and no-deletion policy

The owner's core requirement from the project's inception is **unattended, ongoing 24/7 cloud operation, persistent autonomous research/validation/learning and durable knowledge** with the PC OFF. This is **not** achieved by a Netlify website remaining online, a manually clicked Cloudflare AI review, or merely creating GitHub coordination issues.

**Preserve all existing work, original dirty Windows checkout, 96-path isolated Codex candidate, memory and backups.** Never delete/overwrite/reset files, cloud memory, branches, untracked artifacts, or project resources without a specific independent owner approval and verified recoverable backup. Use additive checkpoints and append-only/versioned knowledge.

## Present reality (November 8, 2026)

- Netlify hosts existing WIN application and APIs; production storage defaults to Netlify Blobs. Neon transactional adapter is opt-in and not proven live for these jobs.
- Cloudflare `win-cloud-backup-agent` was created and independently verified by owner: `AI` binding works with `@cf/zai-org/glm-4.7-flash`, restricted GitHub token reads repo, `/tasks` retrieves issue #20/PRs #35-36 and manually triggered `/review` returned advisory text. Cloudflare Access protects traffic. **No cloud tick/cron or autonomous task executor was verified running.**
- Codex candidate worktree contains local uncommitted changes. Its reported verification is not deployed CI or proof of uninterrupted cloud operation.
- No cloud job lease, durable execution queue, authenticated write actor, independent recovery, paid-spend firewall, training compute, prediction accuracy proof or 24-hour PC-off soak test is yet verified end-to-end.

## Required split: supervisor versus bounded workers

1. **Cloud supervisor (Cloudflare scheduled Worker, candidate 5-minute tick).** Read authenticated durable job checkpoints; compute due work; atomically claim tasks; submit bounded, approved jobs to an executor; persist completion; report staleness and retries. Cloudflare cron is event-driven, **not** a permanently executing process. Configure schedule only after verified prerequisites and separate owner approval. No data deletion.
2. **Durable job queue and history (Neon, after migration plan).** Stores job definitions, immutable execution history, last successful completion, quota reservations, lease fencing tokens, retry count/backoff, source provenance, checkpoint hashes and recoverable memory manifests. Transactionally check concurrent claims. Preserve archival/history across restarts. Design additive schema, rollback and cost checks first.
3. **Compute workers.** Perform permitted fetching, validation, model testing, learning-record generation and periodic integrity checks within free quotas. Avoid an indefinite serverless process. Long CPU-intensive model training needs an appropriate separate compute runtime; Cloudflare Workers AI is inference, **not guaranteed free 24/7 ML training**.
4. **Memory acceptance gates.** Persist raw/unreviewed observations separately from validated accepted research; hash and source each record. Never self-promote model forecasts or overwrite trusted memory just because a new AI response is generated. Version every model release and store walk-forward evaluation with log-loss, calibration and CLV where available.
5. **Health and recovery.** Surface last successful data ingestion, last completed model validation, journal age, queue backlog, expired lease, missing coverage, last memory backup and whether processing has stopped. An alert must not be misrepresented as operational self-recovery.

## Draft planner implementation

`scripts/win-continuous-learning-supervisor.mjs` exports `planContinuousLearningTick(input, nowMs)`. It defines five workstreams:

| Workstream | Candidate cadence | Condition |
|---|---|---|
| Odds/source ingestion | 5 minutes | Only if licensed/reliable sources and bounded quotas |
| Results reconciliation | 15 minutes | Must be time-stamped and provenance-verified |
| Walk-forward evaluation | 60 minutes | Only valid fresh data; no blind model promotion |
| Research-memory integrity | 60 minutes | Versioned, append-only, accepted-vs-private separation |
| Recovery checkpoint | 15 minutes | Secret-safe, owner-scoped, no destructive cleanup |

These are **proposal intervals only**. Actual source terms, amount of data, model runtime, daily limits and Cloudflare/Netlify/Neon account quotas must be measured before using them.

The planner **does not read or write storage, schedule cron, call any model, connect to Cloudflare, or run 24/7**. It refuses to propose jobs unless the trusted environment provides explicit approved activation, verified free quotas, authenticated supervisor, persistent checkpoint/memory store, atomic lease and backup readiness. It never proposes paid or production-writing work; exhausted retries stay blocked for owner-visible investigation. It does not by itself authorize or validate externally claimed approval; the trusted caller must verify every required fact.

## Real activation gates — all required

1. **Preserve candidate work**: secret-safe inventory/manifest and verified restore path for all existing changed/untracked files.
2. **Review code with exact-head tests**: focused `node --test scripts/win-continuous-learning-supervisor.test.mjs`, complete WIN suite, quality gates, build checks, and independent security reviewer in an isolated checkout.
3. **Transactional durable memory**: approve additive Neon schema and migrate only following validated backup, rollback, free-usage and authorization plan. Do not interpret provider-ordered 200-row Blob samples as complete history.
4. **Authenticated supervisor + atomic lease**: signed worker service principal, owner-approved work scope, freshness/fencing, idempotent writes, concurrency/crash testing. GitHub comments are NOT heartbeats or leases.
5. **Safe source collection**: documented legal data licenses, HTTPS, historical point-in-time correctness, dedupe and reproducible data integrity.
6. **Free-tier enforcement**: track Cloudflare AI neurons and requests, GitHub/Netlify/Neon usage, plus OpenAI's strict owner-approved $5 USD/month maximum and fail-closed cutoffs. No automatic paid fallbacks.
7. **PC-off trial**: run short synthetic jobs first while PC off, observe at least 24 hours of scheduled cloud completions, injected failure/restart and no lost history; measure job cadence and alerts. Do not call continuous operation ready until proved by actual cloud logs.
8. **No unauthorized release**: changes remain draft; no production deploy, cron activation, merge, billing changes, secret transfer, payment access or destructive operation without owner review.

## Intended acceptance metrics

- Successful job completions per hour/day (not merely Worker responding).
- Workstream freshness and queue lag measured from persisted events.
- Number of stale expired leases, recoveries and duplicate attempts.
- Per-provider daily usage and hard-stop counts.
- Memory record count, checksum verification, archive restore success and historical query coverage.
- Number of tested model candidates, baseline comparisons and independently accepted improvements.

Related: [WIN coordination issue #20](https://github.com/Amir-dev-stack/win-worker-engine/issues/20), draft PR #35 (failover policy), draft PR #36 (Cloudflare backup agent). No migration or deployment is performed by this document.
