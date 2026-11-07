# WIN — adoption of the independent architecture review

Date: 2026-11-07  
Status: accepted architecture guidance and implementation backlog  
Scope: additive changes on PR #11; preserve existing WIN code and draft PR boundaries.

## Decision

Adopt the review's central principle: WIN must earn trust through reproducible, chronological evaluation. Agents, models, data sources and coupon construction are not considered effective merely because their code exists or a test fixture passes.

The review changes the priority of work, not the product objective. WIN remains a multi-sport autonomous research and coupon-proposal system. The user's final decision to bet or not remains with the user. A requested coupon must not be silently suppressed by an internal NO BET rule; WIN must report evidence gaps, probability estimates, uncertainty and risk transparently.

## What already exists on PR #11

The current branch contains foundations for:
- Provider-neutral, budget-governed LLM execution and bounded agent orchestration.
- LLM/statistical-model separation and football-first market implementation.
- Versioned dataset manifests, source/licence evidence and point-in-time feature/label checks.
- A deterministic football 1X2 logistic baseline, frozen model artifacts and shadow-only inference.
- Immutable market-evaluation records bound to the exact model test cohort, source records, event identities and prediction cutoffs.
- Brier score, log loss and expected calibration error for the current three-class market benchmark.
- Coupon candidate archiving, leg-probability calibration research and explicit warnings when joint coupon probability is not validated.

These are implementation foundations, not proof of a profitable model, a complete odds history, a validated accumulator model or production-ready automated betting.

## Adopted principles

### 1. Evaluation before expansion

The first quantitative release must be a narrow, reproducible vertical:
- Sport: association football.
- Initial market: pre-match 1X2.
- Competition: choose only a competition with sufficient licensed, timestamped historical records and verified result coverage.
- Evaluation: chronological walk-forward folds plus a final untouched later holdout.
- Baselines: de-vigged bookmaker consensus and simple statistical baselines.
- Metrics: multiclass Brier score, log loss, calibration/reliability, sample counts, uncertainty, coverage and data-quality exclusions.
- Price evaluation: closing-line value only where opening, decision-time and closing prices are authentic, timestamped, comparable and have documented margin/settlement semantics.

No model is described as better unless it is compared against the same exact event cohort, cutoff times and eligible labels. Model and market evaluations must be immutable and bound to their dataset/source revisions.

### 2. Statistical models own numeric probabilities

LLM agents may:
- Extract structured injury, lineup, suspension, schedule and news evidence.
- Normalize entities and reconcile conflicting sources.
- Summarize research with citations, timestamps and uncertainty.
- Identify missing information and propose features for later validation.
- Challenge statistical assumptions and explain model/market disagreement.

LLM agents may not invent or self-certify calibrated probabilities, fabricate statistics, create training labels from narrative, or override registered model output. Numeric estimates must identify whether they are market-implied, statistical-model, calibrated-model, or unverified analyst estimates.

### 3. Narrow coverage, broad discovery

WIN may discover candidates across its registered sports catalogue, but model claims and probability-qualified recommendations remain limited to the sport/competition/market cohorts with sufficient verified data and evaluation. Expand one market at a time. Do not imply that every sport, league, player or market has equal coverage.

### 4. Timestamped odds and rights

Build an immutable odds-snapshot contract that records:
- Provider and source-record identity; licence and permitted-use evidence.
- Event, bookmaker/market, selection and line identity.
- Opening, decision-time and closing snapshot timestamps, preserving source timestamp precision.
- Raw decimal prices, market suspension/availability state and source payload hash.
- Overround and the documented de-vig method/version.
- Retrieval time separately from the provider's event/snapshot time.

Do not infer a closing price from the latest available price. Missing or stale snapshots remain missing. Check provider quotas, retention rules, redistribution restrictions and commercial-use terms before activation or import.

### 5. Fit infrastructure to workload

- Netlify: dashboard, short authenticated APIs and bounded orchestration only.
- Neon: structured records, manifests, model metadata and curated memory within quota.
- Object storage: immutable raw historical datasets and Parquet partitions where appropriate.
- GitHub Actions or a separately approved worker: bounded offline validation and training jobs; account for free-minute limits and do not assume GPU availability.
- Local open-weight inference: optional, measured against the user's actual hardware and concurrency needs; do not make it a prerequisite.

No provider migration, paid plan, production secret change or deployment is implied by this design note.

### 6. Continuous learning is not automatic promotion

Every prediction must preserve the feature/evidence snapshot available at its decision cutoff, model version, code/config version, market snapshot references and generated time. Settlements must be independently evidenced and corrections separately reviewed.

Retraining may create a challenger artifact. It must not replace the champion automatically. Require later chronological holdout evidence, baseline comparison, calibration and minimum sample criteria; then run shadow inference and human review. Production promotion remains separately gated.

## Required implementation sequence

1. **Odds and evaluation contract:** audit current source adapters and historical consensus records; identify whether authentic opening/decision/closing prices exist. Add a backward-compatible versioned odds-snapshot and CLV evaluation contract. Do not alter existing immutable evaluation records.
2. **Real-data readiness:** choose one eligible football competition only after licence, timestamp precision, event joins, settlement and coverage are verified. Produce a dataset manifest and quality report before training.
3. **Walk-forward benchmark:** evaluate market baseline and statistical model on identical frozen cohorts; persist immutable fold and holdout evidence, Brier/log-loss/calibration and CLV where supported.
4. **Shadow/paper-trading ledger:** record timestamped recommendations and available prices without placing wagers. Reconcile results independently; report performance by market and period with uncertainty. A review period of 8–12 weeks is a planning target, not a guarantee of statistical sufficiency.
5. **LLM feature experiments:** introduce structured news/lineup extraction only as a separately versioned feature source. Compare the same model with and without each feature on later held-out data.
6. **Broader sports and coupon structures:** expand only when each sport/market has its own data, settlement, calibration and joint-probability evidence. Mixed-sport and multi-leg coupon probabilities remain unquantified until validated joint modelling exists.

## Release and safety gates

- Preserve existing branches, PRs, dashboard, agent hierarchy, memory and user-visible coupon boards.
- Keep AI spending locked unless the owner explicitly approves it. No automated budget reset, refresh, unlock or increase.
- No paid API activation, provider credential use, commercial data import, production migration, deployment or bet placement as part of this plan.
- No automated bookmaker placement.
- Do not claim model profitability or a high winning rate from synthetic tests, in-sample results or small samples.
- Display probabilities, basis, uncertainty, sample size, odds and evidence limitations separately.
- The system can always produce a research proposal when requested, but must label unsupported or unquantifiable probabilities honestly.

## Immediate next engineering task

Inspect the existing historical consensus-market provider schema and source records. Determine, with source-backed evidence, whether opening, decision-time and closing prices are available for the same football 1X2 events. Then implement the backward-compatible timestamped odds/CLV evidence contract and isolated tests. If the source does not contain the required prices, report the exact gap instead of manufacturing CLV.
