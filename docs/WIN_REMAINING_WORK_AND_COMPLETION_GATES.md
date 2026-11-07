# WIN remaining work and completion gates

Date: 2026-11-07
Branch: `docs/win-staged-build-roadmap`
Status: planning baseline; implementation and verification status must be refreshed from the current branch before release.

## Executive status

WIN has substantial architecture and safety foundations, but it is not an operationally complete autonomous sports-intelligence system. A module existing in the repository is not evidence that it is connected to real data, exercised end to end, or useful on unseen matches.

Do not report one completion percentage as if it were a measured engineering metric. The project has at least three different completion states:

- **Architecture foundation:** substantial. Governed LLM execution, owner-controlled budget reservations, task leases, learning/library workflows, immutable evidence patterns, football 1X2 model/trainer contracts, model artifact registration, shadow prediction, source registry, odds collection controls, CLV arithmetic and quote normalization exist.
- **Integrated evidence pipeline:** incomplete. Real provider data, point-in-time odds snapshots, prediction-to-quote binding, verified source licences, real settlement evidence, repeatable walk-forward evaluation and end-to-end reports remain to be demonstrated together.
- **Operational autonomy across sports:** early. Football 1X2 is the first target. Other sports, market families, player props, live markets, Bet Builders, dependence-aware accumulators and sport-specific settlement contracts remain separate work.

## Remaining work by workstream

### A. Build and CI reliability — release blocker

- Diagnose the current GitHub Actions failures from the exact latest attempt logs/annotations.
- Run the complete Node 22 test suite, architecture gates and build on the exact PR head.
- Preserve logs and exact commit SHA as verification evidence.
- Pin all dependencies and commit a lockfile; the current package manifest uses several `latest` dependencies and CI installs without a lockfile.
- Keep deployment credentials and production deploy steps out of validation CI.

**Exit gate:** all required checks pass on the exact head; failures are explained and reproducible; no source-level inspection is presented as an executed test.

### B. One real-data football pilot — highest priority

- Choose one competition, one season, one market (start with football 1X2) and one explicitly approved data source.
- Verify source terms, attribution, retention, model-training rights, historical depth, timestamp semantics and actual account quota.
- Build a pinned, reproducible import with raw response hashes, source revisions, stable event identity, bookmaker/market/selection mapping and explicit observation timestamps.
- Keep retrieval time separate from source observation time.
- Collect decision-time and subsequent odds snapshots; do not infer an executable price or true closing price from consensus probabilities or a late arbitrary poll.
- Independently reconcile fixtures, results and settlement rules.

**Exit gate:** a reproducible, licensed dataset with known coverage and missingness; every prediction and outcome traces to immutable source records; no future-data leakage.

### C. Odds and CLV evidence pipeline

Existing foundations: quote normalizer, price-based CLV calculator, odds evidence SQL schema, and isolated-branch schema verification are documented.

Still required:
- Connect an approved provider adapter to the normalizer and immutable quote persistence.
- Bind each prediction to the exact decision-time quote, model artifact and feature snapshot.
- Define and test a source-specific closing-snapshot policy.
- Verify database constraints and append-only behavior against the intended non-production Neon branch using synthetic records, then test provider persistence end to end.
- Build CLV aggregates by league, market, bookmaker and time horizon with sample counts, uncertainty intervals and missing-data rates.
- Separate retrospective evidence from quotes genuinely observed and ingested live.

**Exit gate:** independently reproducible decision/close quote pairs and CLV reports; no claim of profit based on CLV alone.

### D. Statistical model and evaluation

Existing foundations: deterministic football 1X2 logistic trainer, chronological split contracts, immutable model artifact registry, registered shadow inference, market evaluation registry and guarded market-anchored blending.

Still required:
- Obtain enough licensed, representative, point-in-time historical data.
- Run repeated chronological walk-forward experiments over multiple seasons and competitions.
- Compare simple baselines, de-vigged market probabilities and model/market blends on identical held-out events.
- Report Brier score, log loss, calibration, discrimination, uncertainty, sample size, coverage and CLV where authentic prices exist.
- Test model stability by league, season, odds band and market condition.
- Validate against a frozen untouched final test period after all labels are available.
- Keep fitting, shadow inference and production promotion as separate permissions.

**Exit gate:** repeated out-of-sample improvement over a strong market baseline with uncertainty and calibration evidence; a human-reviewed shadow period. Synthetic tests alone do not satisfy this gate.

### E. Coupon construction and dependence

- Preserve the user's policy: WIN should produce requested coupon proposals and show estimated probability/risk/uncertainty; the final bet/no-bet decision belongs to the owner.
- Support singles, accumulators, system products and Bet Builders as distinct ticket types.
- Calculate joint probabilities using dependence-aware methods; do not multiply marginal probabilities as if every leg were independent.
- Validate same-game correlations, cross-match dependence, void/push/half-settlement rules, operator payout calculations and stake/exposure summaries.
- Compare different coupon sizes and odds bands without imposing a blanket minimum combined odds threshold.
- Show each leg's probability, source, price timestamp, model version and key uncertainty.

**Exit gate:** independently tested coupon probability and settlement calculations, with clear uncertainty and no fabricated odds or evidence.

### F. Learning, review and integrity

- Verify the existing win/loss archive, lesson-review and independent-review flows against real provider storage semantics, not only in-memory adapters.
- Complete reviewed result correction/reconciliation with append-only evidence and independent authorization.
- Ensure only independently verified outcomes become training labels.
- Verify recovery from partial writes, duplicate submissions and concurrent operations on the real storage provider.
- Measure whether lessons change future forecasts on later unseen events; do not equate number of stored lessons with learning quality.

**Exit gate:** reproducible result-to-review-to-lesson-to-future-evaluation chain, with auditability and correction safety.

### G. Multi-sport expansion

After the football pilot passes:
- Add sports one by one with separate source, event, market, feature, model, settlement and evaluation contracts.
- Prioritize coverage according to data availability and validated value, not simply the number of agents.
- Add tennis, basketball, ice hockey, baseball and other sports only when their source and settlement requirements are satisfied.
- Add player props and live markets as separate projects after pre-match markets are validated.

**Exit gate:** each sport/market has its own real-data coverage report, point-in-time validation, calibrated model and settlement tests.

### H. Production operations and autonomy

- Verify dashboard health, authentication, task scheduling, retries, queue leases, alerts and persistent storage.
- Test owner budget limits and provider-side hard limits before any live LLM spending.
- Add provider outage handling, quota-aware scheduling, circuit breakers and stale-data alarms.
- Verify backups, restore, retention and free-tier usage limits.
- Keep deployment, model promotion, paid providers and betting execution owner-controlled. No automatic bet placement is in scope.

**Exit gate:** sustained monitored shadow operation, tested recovery, transparent costs and explicit owner approvals.

## Recommended build order

1. Repair CI and establish a verified baseline on one exact commit.
2. Complete one football 1X2 real-data pipeline, including source approval, event mapping and result reconciliation.
3. Connect quote persistence, prediction-time quote binding and genuine CLV.
4. Run walk-forward model-vs-market evaluation and calibration.
5. Connect calibrated predictions to transparent coupon construction and dependence-aware joint probability.
6. Complete provider-backed learning/review/correction verification.
7. Expand to further football markets and then other sports.
8. Run sustained shadow operations before considering production promotion.

## Completion estimates — planning ranges, not measured facts

- A narrow **football 1X2 research pilot** can be considered complete only after steps 1–4 have passed on real licensed data. This is materially smaller than the full WIN vision.
- A dependable **football coupon research assistant** additionally needs steps 5–6 and a sustained shadow evaluation period.
- The **full multi-sport WIN vision** requires step 7 market-by-market and step 8 operationally. It is an ongoing staged programme, not a single final coding task.

Do not translate these workstreams into a percentage without first defining the target release scope. Report completion as verified gates, not file counts, agent counts, lines of code or synthetic test totals.

## Safety boundary

This roadmap does not authorize production deployment, paid data or AI providers, provider credentials, budget unlocks, real model fitting, production model promotion or bookmaker execution. Keep the current PR draft and unmerged until the exact-head checks and owner review are complete.
