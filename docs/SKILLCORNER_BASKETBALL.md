# SkillCorner Open Data — ACB basketball 2025/26 aggregates

## What WIN imports

WIN can manually import three small player-season aggregate CSVs from the official SkillCorner Open Data repository:

- ACB 2025/26 shots aggregates.
- ACB 2025/26 drives aggregates.
- ACB 2025/26 picks aggregates.

The source repository README describes these as offense-only player-season aggregates covering 293 of the 327 ACB games for 2025/26. This is historical player-team-season data, not match-by-match statistics and not a live or current-season feed.

Official source: https://github.com/SkillCorner/opendata-basketball

## What is deliberately excluded

The repository also contains detailed event JSON and compressed 25fps player/ball tracking archives for a 10-game sample. The raw tracking files are large (about 30–46 MB per game) and are not part of this connector. WIN downloads only the three aggregate CSV files (about 1.6 MB together at the time of integration).

No tracking archive, per-frame coordinate stream or complete match dossier is imported.

## License, credit and usage boundary

The repository includes an MIT license file, and its README asks users to credit SkillCorner when using the data. WIN preserves the SkillCorner repository reference, CSV source URLs, retrieval timestamps and SHA-256 checksums. The dashboard displays a visible SkillCorner credit link.

The integration requires an explicit owner confirmation before each import. It is manual-only, private research/analysis oriented and has no scheduled refresh. Re-check the source repository and license before any redistribution, commercial data product or expanded use.

Attribution: SkillCorner Open Data — https://skillcorner.com/

## Data shape and correct use

The source rows are at player-team-season grain. A player who changed teams can have one row per team and an additional season-total row with team name `total`. Do not sum the per-team rows together with that season-total row.

The three aggregates have different metric families:
- Shots: attempts, makes, points, zones, shot types, and contest levels.
- Drives: volume, outcomes, directions, drive types, points and assists.
- Picks: handler and screener outcomes, including breakdowns by defensive coverage.

The data is offense-only. It does not supply opponent defensive tracking, all games, all events or current team/player availability. Some counts have specific source definitions (for example, fouled misses are not included in the standard field-goal attempt total, and only direct picks are counted in the picks aggregate). Follow the upstream data dictionary and primer before interpreting a metric:

- https://github.com/SkillCorner/opendata-basketball/blob/main/docs/PRIMER.md
- https://github.com/SkillCorner/opendata-basketball/blob/main/docs/aggregates_columns.md
- https://github.com/SkillCorner/opendata-basketball/blob/main/docs/data_dictionary/README.md

## WIN safeguards

- Manual button action only, requiring exact source-use confirmation.
- Three expected CSV files only; 2 MiB cap per file and 3 MiB total cap.
- Each source file is retained as a SHA-256 checksum and retrieved source URL; WIN stores parsed aggregate rows, not a raw bulk tracking mirror.
- Stored separately in `library/model-lab/player-season-aggregate-datasets`.
- Never counted as match-level results, match events or current form.
- Season-total rows are explicitly labelled and excluded from team-level leaderboards.
- No human coupon, prediction, settlement or betting execution records are changed.
- No paid AI calls or recurring background jobs.

## How to use it

1. Open WIN's Learning / public result and historical data sources panel.
2. Review the source scope and SkillCorner credit.
3. Press **Import SkillCorner ACB 2025/26 player aggregates**.
4. Confirm the manual research-use statement.
5. Check the Model Lab and provider status for the three imported aggregate groups and their row counts.

The import does not automatically make these data suitable for a prediction. It is historical, partial-season coverage and must be aligned with the correct player, team, competition and season before use.
