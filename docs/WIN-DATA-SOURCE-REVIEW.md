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


## nflverse NFL play-by-play validation boundary (updated 2026-11-04)

The nflverse-pbp-data adapter accepts the season play-by-play CSV only after structural validation. CSV headers must be non-empty and unique; every data row must have the same number of cells as the header. The row audit rejects missing game IDs, impossible calendar dates, invalid or identical team abbreviations, malformed non-empty integer scores, and every row belonging to a game ID that has conflicting date/home/away identity. The import summary records parsed, accepted and rejected row counts, rejection reasons, game counts, conflicting game IDs and games that did not produce a final scored record. A match is treated as completed only when its rows include an explicit `play_type_nfl = END_GAME` marker (or exact `END GAME` description) as well as both scores; a live/incomplete game with a non-null score is not promoted to a completed historical record. The raw source file SHA-256 and exact season release asset filename are retained with the import audit.

**Kickoff precision:** the PBP file's game_date is date-level data. WIN now stores it as eventDate with eventTimePrecision: date_only and leaves eventStart null. It must not fabricate midnight UTC and then treat that as a verified kickoff. Until an approved schedule source with documented rights is joined to the PBP game_id, date-only NFL rows must not enter kickoff-cutoff-sensitive pre-match form or exact-time target matching. This is an intentional conservative coverage gap, not a missing-statistic zero.

The validation audit is a schema/consistency filter, not an independent verification of nflverse scores or statistics. Source-reported outcomes remain sourceReportedNotIndependentlyVerified; no prediction accuracy, settlement learning, or profitability metric may be updated from this import alone.


## nflverse schedule join (updated 2026-11-04)

The nflverse schedule release is documented as CC BY 4.0 (subject to dataset-specific exceptions). Its schedule dictionary defines game_id as the primary cross-dataset identifier, gameday as the game date, and gametime as 24-hour Eastern Time. WIN now parses the schedule CSV separately and joins by exact game_id, then verifies date and canonical home/away team identities before enriching PBP records. Eastern kickoff is converted to UTC using the IANA America/New_York zone; the original local date/time/zone and schedule checksum are retained. Missing, invalid, mismatched or conflicting schedule rows leave the PBP record date-only. The schedule is not a source of final scores or PBP events, and no row is treated as independently verified merely because it appears in the schedule.

Release documentation: https://nflreadr.nflverse.com/articles/dictionary_schedules.html. Dataset license overview: https://github.com/nflverse.


### Schedule asset and identifier cross-check (updated 2026-11-04)

The upstream nflverse/nfldata release workflow publishes the schedule dataset under release tag `schedules`, file name `games`, in CSV, CSV.GZ, Parquet and RDS formats. The corresponding WIN CSV endpoint is `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv`. The upstream workflow upserts by `game_id` before publishing.

The schedule dictionary documents `game_id` as the human-readable season/week/away/home key, and `gametime` as 24-hour Eastern Time. Current nflreadr PBP examples show the same human-readable `game_id` format and keep the ten-digit legacy identifier in `old_game_id`. WIN therefore joins schedule to PBP on `game_id`, not `old_game_id`, then independently checks date and home/away teams. The current nflverse/nfldata repository's 2026 schedule rows and nflverse-pbp-internal released-game identifiers use the same human-readable format.

The schedule pipeline is reported by nflreadr to update every five minutes during the season. That is source availability cadence, not a guarantee that every schedule value is final or that PBP is already complete.

DST policy: convert Eastern wall-clock times only when they map to exactly one UTC instant. Nonexistent spring-forward times and ambiguous fall-back times remain date-only for WIN's kickoff purposes rather than selecting an arbitrary UTC interpretation.

Validation boundary: public documentation, release-workflow source and current indexed schedule rows support the schema, asset naming and key choice. The full live schedule CSV has not yet been downloaded and row-count/checksum audited by WIN, and no PBP/schedule bulk import has been run.


### Read-only upstream identifier spot-check (2026-11-04)

WIN inspected the current `nflverse/nflverse-pbp-internal/released_games.csv` manifest through the GitHub repository connector without importing or persisting it. It contained 7,395 game IDs, all unique, including 121 IDs for the 2026 season. The manifest includes `2026_08_CAR_GB`.

The upstream `nflverse/nfldata` schedule-data commit `9764ee0c94f8b98dae35419b6b3f18eb9cf2658a` shows the matching schedule row: `2026_08_CAR_GB`, gameday `2026-10-29`, gametime `20:15` Eastern, away `CAR`, home `GB`. This is a real-source, read-only key/date/team/time spot-check and supports the chosen exact `game_id` join.

This is not a full PBP row ingestion or a full schedule CSV audit: the released-games file is a game-ID manifest, not play-level records, and the schedule evidence above is a source commit diff row. No PBP or schedule bulk file was imported, and no WIN storage was written.


### PBP source-native field retention (updated 2026-11-04)

The NFL event normaliser now retains every non-empty source-native column value on each play as `sourceFields`, alongside the selected normalised event fields. Each match record also stores the source schema field names and count, and identifies the source grain as one row per play. This prevents WIN from silently discarding PBP columns that are not yet mapped into its standard metric catalogue. It does not imply every source field is a validated metric or that every field is available for every play; consumers must still inspect null/absence and source definitions.

The current adapter still calculates only a subset of derived team/player box-score totals. Player ratings, confirmed full snap participation, injuries, lineup positions and provider metrics absent from the PBP release remain unavailable or require separate licensed/appropriate feeds. No live PBP season import has been run to measure actual record sizes or validate all current source columns end to end.


### Read-only full-season NFL source audit runner (updated 2026-11-04)

WIN now has an authenticated `POST /api/nflverse-audit` endpoint and an isolated GitHub Actions audit runner. Both invoke the read-only audit path, which downloads the selected season's processed PBP CSV and the current schedule CSV, validates the full row sets, joins by exact `game_id`, and measures the UTF-8 JSON payload shape used by the historical-event importer. The audit reports source byte counts, SHA-256 hashes, response ETag/Last-Modified values, PBP schema fields, accepted/rejected rows and reasons, schedule join coverage/conflicts, completed-match/play/player-line counts, and per-match payload-size distribution (average, median, p90, p95, maximum and largest records).

The audit path does not call Blob storage, update scheduler state, create historical datasets, or call AI. The API endpoint requires dashboard authentication and explicit `action: "audit_read_only"` plus `confirmReadOnly: true`. The CI runner uses GitHub Actions on PR changes to the NFL adapter/audit files and can also be manually dispatched for a selected season. The audit is source-reported validation only; it is not independent verification of NFL results or statistics.

The audit has been implemented but its first real upstream run is pending successful CI execution. No full-season PBP file has yet been processed by this audit runner, and no import was run.


### NFL raw-field compact encoding and play-count integrity (updated 2026-11-04)

The read-only 2026 source audit measured the current per-game JSON object shape at 146,958,204 UTF-8 bytes across 121 completed games (average 1,214,531 bytes; median 1,202,131; p90 1,345,508; p95 1,405,025; maximum 1,513,130). This is the pre-optimization measurement, not billed storage. The raw PBP CSV was 42,470,035 bytes and the current schedule CSV was 2,188,861 bytes. All 21,191 PBP rows passed the current row checks, all 121 game IDs joined to schedule rows, and no identity conflicts were found. The audit used current 2026 releases retrieved 2026-11-04; its SHA-256 values and ETags are printed in the GitHub Actions audit log.

The measurement exposed a timeline counting bug: synthetic quarter-end timeline markers reused their source play ID and were included in `playCount`. Synthetic quarter-end markers now have `playId: null`, so only source play IDs contribute to play counts.

To reduce storage duplication while retaining every non-empty source-native field, each event's `sourceFields` is now encoded as a flat sequence of alternating schema-index/value entries. The match-level `sourceSchemaFields` array maps each numeric index back to its exact original CSV column name, and `sourceFieldEncoding` identifies the version as `schema_index_value_pairs_v1`. Consumers must decode these pairs against the match-level schema; values are not discarded. A fresh full 2026 audit is required to measure the optimized payload size before any import decision.


### Post-optimization full 2026 audit (2026-11-04)

A second read-only run against the same 2026 PBP release after compact field encoding produced the following result:

- PBP: 42,470,035 bytes; SHA-256 `c2f54775e6d54bedf003af2776987eddce7eb2eaf35f05a4039fc7268b44675e`; 372 schema fields.
- Schedule: 2,188,861 bytes; 7,548 total rows, 272 rows for 2026; SHA-256 `239ad19b914eeff0c44f7ca51ada1d137b90b7f7c2b56106fb02b40f1b4e7506`.
- 21,191 PBP rows accepted, 0 rejected; 121 games accepted; all 121 exact game IDs joined to schedule; 0 conflicting IDs.
- 121 completed matches; 21,191 source plays; 7,768 player match lines; 0 date-only matches after exact schedule enrichment.
- Compact JSON payloads: 81,141,863 bytes total; average 670,594; median 662,936; p90 743,917; p95 773,993; maximum 832,496 bytes.
- Compared with the previous object-key encoding (146,958,204 bytes), the compact representation reduced measured JSON payload size by 65,915,974 bytes (44.85%) without removing non-empty source fields.
- Synthetic quarter-end markers no longer reuse source play IDs, so play counts now align with source rows.

These are exact JSON serialization measurements from the audit runner, not billed storage usage. No Blob writes, scheduler-state updates, production data changes or AI calls occurred. The 2025 and 2026 full-season audits are now both complete. The 2025 run (2026-11-04) found a 97,951,481-byte PBP CSV with SHA-256 `8ce0001826f0f7b895b7a1068e4db7f43696c699db7064ccb1201855768fd06c`, 48,771 rows accepted, 0 rejected, 285 games, 285 completed match records, 285/285 schedule joins, 0 identity conflicts, 48,771 source plays and 18,120 player match lines. Its 285-game compact JSON payload measured 187,482,518 bytes total; average 657,833; median 654,282; p90 718,362; p95 740,962; maximum 833,576 bytes.

Across 2025 and 2026 together, the validated sample covers 406 games, 69,962 source plays and 25,888 player match lines. The exact JSON payload total is 268,624,381 bytes (about 255.86 MiB), averaging about 661,636 bytes per match. Both seasons had zero rejected rows and complete exact schedule joins. These are two full-season samples, not all 28 seasons since 1999, and JSON payload bytes are not a billed storage measurement.

### Post-normalisation full-season audit (2026-11-04)

The read-only 2025/2026 matrix was rerun after adding the normalized team efficiency metrics. Both season jobs passed again:

- 2026: 42,470,035-byte PBP CSV, 21,191/21,191 rows accepted, 121 completed games, 121/121 schedule joins, 21,191 plays, 7,768 player lines. Compact JSON: 81,141,863 bytes total; average 670,594; median 662,936; p90 743,917; p95 773,993; maximum 832,496 bytes.
- 2025: 97,951,481-byte PBP CSV, 48,771/48,771 rows accepted, 285 completed games, 285/285 schedule joins, 48,771 plays, 18,120 player lines. Compact JSON: 187,482,518 bytes total; average 657,833; median 654,282; p90 718,362; p95 740,962; maximum 833,576 bytes.
- Combined: 406 games, 69,962 plays, 25,888 player lines and 268,624,381 UTF-8 JSON bytes (about 256.18 MiB). All row and schedule identity checks passed; zero writes and zero AI calls.

The increased payload relative to the prior audit is the cost of adding explicit normalized team efficiency values and denominators. These figures supersede the previous compact-payload values above; they remain JSON serialization measurements, not billed Blob storage.

### NFL play-by-play derived metric normalisation (updated 2026-11-04)

The adapter now derives an additional, explicitly denominator-aware team efficiency layer from the source play fields:

- `epa_total`: sum of non-null source `epa` values for plays attributed to the team's possession.
- `epa_per_play`: `epa_total` divided by the number of those plays with non-null EPA.
- `success_rate`: successful source `success = 1` plays divided by all plays with a non-null source `success` value.
- `air_yards_per_attempt`: mean non-null `air_yards` across pass attempts.
- `yards_after_catch_per_completion`: mean non-null `yards_after_catch` across completed passes.
- `win_probability_added`: sum of non-null source `wpa` values.

The corresponding counts and totals are retained in team statistics so a consumer can see the denominator behind each rate. A metric remains null when its denominator is zero; missing source values are not converted to zero. The standard team metric catalogue and regression tests now include these normalized values.

This is a targeted extension, not a claim that all 372 source columns have been normalized. Every non-empty source value remains available in the compact event `sourceFields` encoding, while other fields remain raw evidence until their definitions, attribution rules and aggregation semantics have been reviewed. In particular, source-level player ratings, confirmed snap participation, player position/starting status and injury data are not manufactured from PBP rows. The official nflreadr PBP dictionary documents the 372-field schema and should remain the field-definition reference: https://nflreadr.nflverse.com/articles/dictionary_pbp.html.

The 2025/2026 payload-size sample implies a rough long-history storage planning estimate of approximately 4.86–4.96 GB of UTF-8 JSON if the 7,395 game IDs in the previously inspected PBP manifest were all stored at the two-season sample's observed per-game average (about 658–671 KB/game). This is a planning extrapolation only: historical field density and season schema differences may change the actual size, and JSON bytes are not billed Netlify Blob storage. Do not use this estimate as approval for a bulk import.

### NFL player-level advanced and special-teams normalisation (updated 2026-11-04)

The PBP adapter now also exposes source-defined player metrics where attribution is clear:

- Quarterbacks: average `qb_epa` per play, average `cpoe` across attempts with a source value, air yards per attempt, and summed WPA.
- Rushers: EPA per rush and summed WPA.
- Receivers: actual yards after catch per reception, plus completed-pass xYAC model outputs (expected YAC EPA, expected YAC yards, expected success probability and expected first-down probability).
- Kickers: field-goal attempts/makes, extra-point attempts/makes and kickoffs, using nflverse's `kicker_player_id` / `kicker_player_name` fields.
- Punters: punt count and punt distance using the source `punter_player_id`, `punter_player_name` and `kick_distance` fields.

The quarterback `qb_epa` definition credits the passer through the point where a receiver loses a fumble, and CPOE is completion percentage over expectation. nflfastR documents the expected-YAC fields as model expectations from the catch point; WIN aggregates them only for completed passes when describing post-catch performance. These remain provider-derived performance statistics, **not player ratings**. The nflverse PBP release does not provide an independent player-rating scale, player position/starting status, full snap participation or injury status. Those require separately sourced roster, participation, snap-count, injury or rating feeds, with their own coverage and rights review.

Defensive player attribution now also includes additional assisted tacklers (up to the source's fourth assist slot), tackles for loss, quarterback hits, passes defended, forced fumbles and blocked-player credits where the PBP row supplies a player ID/name. The player metric catalogue and regression tests now cover QB, rusher, receiver, defensive and special-teams fields. The source's non-empty raw values remain retained per play so additional fields can be normalized later without discarding evidence.
