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


## Importer provenance hardening (2026-11-06)

The offline football-results importer now requires a pinned immutable `sourceRevision`; mutable aliases such as `main`, `master`, `latest`, `head` and `current` are rejected. The imported manifest records that revision and the SHA-256 of the exact input bytes, requires timezone-qualified strict timestamps, rejects impossible calendar dates, and prevents one manifest from mixing seasons or competition IDs. Credential-bearing source URLs are rejected. These controls improve reproducibility and fail-closed data quality; they do not approve this candidate, establish third-party rights, or independently verify source-reported results.


## Reviewed publisher identity and result corroboration (2026-11-06)

WIN now separates a provider's declared name/group from independently reviewed upstream ownership.

- `netlify/lib/ml-source-identity-registry.mts` is a server-owned catalogue. Each future entry must bind an exact provider ID to its upstream legal/publishing owner, feed/API product, independence group, reviewer, review timestamp, expiry, immutable evidence URL and SHA-256 evidence hash.
- The catalogue is intentionally **empty** until source ownership evidence is actually reviewed. Provider IDs and independence groups supplied in result records are not trusted metadata.
- Result-evidence registration and reads now require both providers to resolve from this catalogue, require the evidence record's group to match the reviewed group, reject expired/future reviews, and reject two feeds with the same upstream owner or independence group.
- A source can be independent only where the underlying publisher/owner is distinct. Separate APIs, websites, brands, resellers, data formats or provider IDs are not sufficient if they republish the same upstream result feed.
- Before adding a catalogue entry, a reviewer must inspect primary documentation or contractual/legal evidence identifying the publisher and the feed's upstream provenance; archive the exact reviewed evidence, calculate its SHA-256, record the reviewer and review window, and confirm no common upstream owner with the proposed corroborating source.
- Reviews must be renewed before expiry. A missing, malformed, expired or changed evidence record must remain unverified.

**Current operational effect:** all football result pairs are presently blocked from the durable corroboration registry because no provider ownership records have been reviewed and curated yet. The pure score-comparison helper remains an audit classifier, but it is not proof of source independence. No existing historical result pair is grandfathered into trusted corroboration, and no training approval is granted by this feature.

## Server-owned publisher identity review queue (2026-11-06)

The source identity layer now has a read-only review queue derived from the server-owned provider catalogue:

- Every registered provider with a result/settlement data domain is represented; the queue is not limited to sources already connected or imported.
- Football result sources are marked as the first review track. Other sports remain visible as later tracks so the eventual system can expand without pretending those feeds are validated today.
- Each entry exposes the provider's registered name, website, sport IDs and result domains, plus the evidence required for review.
- Upstream owner, exact feed-product identity and independence group remain null; review status remains unreviewed and identityVerified remains false until primary evidence has actually been assessed.
- The queue is derived from the provider catalogue at runtime, so a newly registered result provider cannot silently escape the review list.
- Tests assert complete provider coverage, fail-closed identity fields and football-first ordering.

This is an auditable work queue, not an approval mechanism. It does not connect providers, fetch or ingest data, change licence status, permit training, or populate the reviewed identity catalogue. Publisher ownership must be established from primary evidence and curated in server-owned code by an authorised reviewer. Caller-supplied names or independence labels remain untrusted.

## Football-first source coverage inventory (2026-11-06)

The source-review module now exposes a second, read-only inventory for every provider registered for football. It preserves each provider's declared data domains and groups them into fixtures/results, odds/markets, team/player statistics, predictions/probabilities, lineups/availability and other context. This is intended to support the actual coupon research workflow: a fixture/result feed alone is not enough to assess a selection; WIN also needs timestamped odds and relevant match context. The inventory retains each provider's access mode, licence-review status, historical-support claim and automation flag. Every entry explicitly remains `registry_only_not_connected` and `not_approved` for training. In particular, sources whose licence review is required or whose automation is disabled remain blocked; coverage classification is not evidence of data quality, live availability, legal permission or predictive value.

Regression tests compare the inventory against the complete football provider registry, preserve all declared domains, and assert that odds, results, statistics and prediction categories are visible without implying readiness.

## Football historical coverage assessment (2026-11-06)

A deterministic, offline coverage assessor now compares an explicitly supplied expected fixture universe with normalized result observations and odds snapshots. It reports result coverage, missing result event IDs, expected event/market combinations, pre-kickoff odds coverage, missing event/market pairs, post-kickoff snapshots excluded from usable pre-match coverage, and invalid/out-of-scope snapshots. Odds are counted only when the capture timestamp is strictly before the fixture kickoff and decimal odds are finite and greater than 1. Result observations must have strict timestamps and cannot be available before kickoff. Duplicate IDs, unknown result events, malformed kickoff timestamps and duplicate market identifiers are surfaced as reasons.

The expected fixture universe and required market list must come from an independently defined competition/season scope; this assessor does not prove that the supplied universe is complete. It also does not fetch feeds, establish source ownership, verify licences, determine bookmaker independence, or measure prediction quality. It always returns `completeForResearch: false` and `trainingApprovalGranted: false`. Coverage percentages are descriptive data-quality indicators, not model-readiness or coupon-confidence scores.

## Competition-season and odds-phase coverage (2026-11-06)

A second-level evaluator now partitions a supplied football fixture universe by explicit competition ID and season. Each competition-season receives its own result and pre-kickoff market coverage report, preventing strong coverage in one competition or season from hiding gaps in another. Event IDs reused across competition-season groups are treated as ambiguous and their results/odds are not assigned to either group. Invalid fixture metadata is counted and excluded.

Opening, intermediate and closing odds coverage is reported separately only when the incoming snapshot explicitly carries one of those phase labels. A snapshot must still have a valid decimal price and a capture timestamp strictly before kickoff to count. WIN does not infer that a price is an opening or closing price merely because it is the earliest or latest record in an incomplete sample. Phase coverage is a separate descriptive view; it does not establish bookmaker identity, a complete market history, or predictive value.

The report remains `completeForResearch: false` and `trainingApprovalGranted: false`. It is not evidence that any provider is connected, licensed, independent or ready for model fitting.

## Football odds quality diagnostics (2026-11-06)

A deterministic offline odds-quality assessor now checks each observation against an explicit fixture, expected market/outcome definition, bookmaker ID, source ID and snapshot ID. It reports invalid and duplicate snapshots, post-kickoff observations, stale prices when a caller supplies a maximum age, incomplete outcome sets for each event/market/bookmaker/source/line group, and implied-probability overround outside the configured or conservative default bounds.

Price movements are compared only within the same event, market, bookmaker, source, line and outcome, in timestamp order. Large relative movements are flagged for review and retained; they are not silently deleted or treated as errors. Missing time-series intervals are reported only when the caller supplies an expected capture cadence. A freshness threshold is likewise applied only when explicitly supplied; the evaluator does not invent a provider refresh schedule. Market overround is also withheld when the caller supplies a maximum outcome-timestamp skew and the latest prices for the market's outcomes exceed it; WIN does not combine materially asynchronous prices into one implied-probability check.

Bookmaker and source identifiers are preserved as labels only. Separate IDs do not establish independent publishers or feeds; `bookmakerIndependenceVerified` remains false. The report always remains `completeForResearch: false` and `trainingApprovalGranted: false`. These diagnostics do not connect feeds, validate licences, prove source ownership, or produce coupon probabilities.
