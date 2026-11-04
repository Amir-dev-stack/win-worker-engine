# WIN external data source review: TipsAudit track record

## Disposition

**Research candidate only — not connected, downloaded, or approved for automation.**

- Repository: https://github.com/tipsaudit/track-record-public
- Dataset: `datasets/tipsaudit-predictions-all.csv`
- Snapshot collection: `data/track-<UTC timestamp>.json`
- Declared licence: CC BY 4.0
- Attribution requested by the repository: TipsAudit, https://tipsaudit.com
- Sports/markets: football, full-time 1X2
- Potential use: external comparison of pre-match probabilities, bookmaker prices, closing-line movement and calibration methodology.

The repository README says that predictions are logged before kick-off and publishes daily snapshots which are not overwritten. It also describes a SHA-256 manifest and OpenTimestamps proof files. These are useful provenance signals, not proof that every field is complete, that every result is independently correct, or that the publisher has cleared every underlying third-party right.

## Required checks before any adapter is enabled

1. **Pre-match point-in-time validation.** Use an archived snapshot whose filename timestamp precedes the actual scheduled kick-off. Do not rely on the regenerated monthly CSV alone. Compare the snapshot's SHA-256 with the matching manifest row. Treat a new `.ots` proof as pending until its timestamp attestation can be verified.
2. **Schema and result semantics.** The CSV's `result` is an outcome code (`1`, `X`, `2`), not a score. Exclude void rows. Preserve the record identifier and `record_hash`; do not assume that this hash covers closing odds, results, or every value column.
3. **Odds and CLV semantics.** The repository describes `prediction_clv_pct` as raw Pinnacle price versus raw Pinnacle close, including margin. It is not devigged CLV. Preserve its calculation label; do not compare it directly with a margin-free CLV metric.
4. **Bookmaker identity and time leakage.** Best-soft prices include exchanges. The repository documents earlier periods where best-soft selection could use a price observed at a different time and a Betfair sportsbook/exchange labelling mix through 2026-10-15. These rows need separate flags or exclusions, not silent normalization.
5. **Independent results.** The source-reported outcome and CLV may be benchmark fields, but must not be counted as independently verified WIN settlements. Reconcile outcomes against an independent result source before any supervised training or trusted learning metric.
6. **Rights review.** Confirm the repository's CC BY 4.0 grant covers all included data and any third-party bookmaker feed/database rights needed for WIN's intended use. Retain attribution and the exact source/version/hash with every imported record.

The provider registry therefore sets `accessMode: research_candidate`, `licenceReview: required`, and `automationAllowed: false`. A public URL, declared open licence, or user approval for adapter design does not automatically satisfy the ingestion gate.

## Scope

This source is limited to football 1X2. It does not provide broad multi-sport coverage, and its predictions are one publisher's model output rather than a consensus or an independent ground-truth label. It can be useful for external benchmarking after the above checks, but should never be merged into WIN's own forecast track record.


## Active adapter gate (added 2026-11-04)

The four public import adapters call `assertProviderImportAllowed` before their first upstream request. The check requires an exact registry provider (with one explicit identifier alias for the OpenFootball football.json adapter), `automationAllowed: true`, `licenceReview: approved`, an open-download/open-API access mode, an HTTPS licence reference, attribution text, and every required data domain. TipsAudit and commercial candidates remain blocked. A registry flag change blocks the import on its next run instead of leaving a hidden hard-coded path active.

The gate is an operational safeguard, not a legal opinion or independent proof of upstream rights. Dataset-specific rights, source methodology and third-party data restrictions remain under review. No newly discovered metadata candidate is automatically connected or ingested.


## Consensus catalogue scope and semantics

The current consensus-market adapter contains 12 Hugging Face datasets spanning American football, basketball, ice hockey, baseball, football and tennis. Each item now declares its own required registry data domains. Tests validate all 12 source IDs and their permissions. The dataset cards describe consensus probabilities/closing lines; most do **not** preserve each bookmaker's individual price identity. These records must remain classified as consensus benchmarks, not raw bookmaker offers.

Current-season datasets are partial snapshots and can have small sample sizes. They must not be presented as completed season coverage, and any calibration or strategy assessment must preserve the source's exact season, capture window and field definitions.
