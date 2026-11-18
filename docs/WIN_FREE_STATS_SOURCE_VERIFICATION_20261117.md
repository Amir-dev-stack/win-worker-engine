# WIN free statistics source validation — 2026-11-17
**Research-only. No data imported, scheduler activated, account opened or money spent.**

## Directly inspected public source metadata

### openplay — high-volume historical source
- Source: https://github.com/nlbair/openplay
- Release: https://github.com/nlbair/openplay/releases — `data-v0.1.0` preview, 2026-11-03
- Dictionary: https://github.com/nlbair/openplay/blob/main/DATA_DICTIONARY.md
- Python reader: https://github.com/nlbair/openplay-py
- Publisher's declared release: 26,536 in-scope matches with events; 41.6 million event rows; approx. 780k player-match and 53,094 team-match records; 125 competition-season event Parquet files. These are **maintainer-reported**, not independently counted.
- Documented detailed player actions include passes/completions/key passes, xA, xG, dribbles, tackles/interceptions, errors leading to goals, GK saves, yellow/red cards, minutes/lineups, event locations and timelines.
- Historical snapshot ends **2025/26**; **NOT** a daily updated 2026/27 provider.
- Publisher declares **CC BY 4.0** data attribution `openplay (Noah Bair)`, packages MIT. Confirm upstream data rights, acceptable training/betting/commercial use and obligation to attribute before broad ingestion/public reuse.
- The release describes `checksums.json`, `SHA256SUMS.txt`, `known_gaps.csv`, `data_issues.csv`. Release and dictionary metadata were accessible; downloadable binary Parquet content and hashes were **not** verified in this environment (GitHub release download blocked; container lacks external DNS).
- Data quality: official openplay README notes 39 missing in-scope matches and 58 with a known issue. The separate dictionary notes **1,606 rows in known_gaps.csv, 69 rows in data_issues.csv**, because the raw metadata covers more than the core v1 scope. Do NOT conflate these denominators.
- Dataset caveats: xG is produced using openplay's own model; expanded minutes include added time; fixture scores can include extra time; shots and team stats can differ from other providers; some event IDs repeat with `event_id_sub`.

**Validated now**: reachable repository README and dictionary, release announcement, published declared license and source schema. **Not validated**: actual binary downloads, per-file integrity and match-level factual accuracy, or usage rights of underlying sourced events.

### PitchAPI — candidate for fresh current-season match/player data
- Documentation: https://pitchapi.dev/ . Published claim: 77 leagues, free unlimited regular API requests, historical matches since 2021, shots/event logs, xG/xGOT and advanced features. Requires server-side `X-API-KEY` from user's account.
- No authenticated endpoint request performed; cannot claim working, up-to-date or complete 2026/27 fixtures.
- Third-party provider comparisons note unclear data origin and unspecified storage, commercial/betting and redistribution rights. Request written terms/confirmation before integration; an MIT-licensed SDK does not establish data-use rights.
- Treat rate limits as possible: docs disclose fair-use 429 and Retry-After behavior; do not run unbounded ingestion.

### API-Football — documented fallback
- Official pricing: https://www.api-football.com/pricing/ ; official developer docs: https://www.api-football.com/documentation-v3
- Free account advertised as **100 calls/day and 10/min**; all endpoint families listed including fixtures, standings, stats, injuries and lineups, **historical seasons restricted on free tier and per-competition field coverage variable**.
- No account/API key is connected to WIN, no authenticated call made. Official terms: https://www.api-football.com/terms
- Account registration/approval and secret storage required; never put tokens in GitHub comments, logs or source files.

### StatsBomb Open Data — existing isolated draft PR #49
- https://github.com/hudl/open-data : selected open historical competitions and event JSON, no guaranteed fresh daily statistics. Reader in draft PR #49 is **NOT deployed**, exact branch tests and attribution/use policy pending review.

## Recommended data route
1. Verify published openplay release assets on a rights-cleared, network-enabled environment, choosing a small metadata/Parquet sample rather than bulk download.
2. Compare manifest-listed SHA-256 checksums to downloaded files. Inspect schemas and row counts with read-only DuckDB or PyArrow, compare 5–10 source-backed official match results, player IDs, source times, known gaps/issue rows and xG definitions. Exclude or quarantine known problematic matches.
3. Trial ONE authorized free current-season feed in server-side sandbox with account-owner connection. Check one completed fixture's team and player stat fields, and its daily update age. Check owner-authorized storage/training/financial use rights before any live ingestion.
4. Add source-specific coverage, freshness, normalized player/fixture IDs, versioned provenance and bounded retry/429/quotas on existing WIN ingest interfaces. Do not create an unreviewed parallel provider stack.
5. Only then plan dry-run daily collection and verified cloud PC-off scheduler. No live daily data job is currently established.

## Next hard blockers
- Binary openplay asset download/integrity testing unavailable in current environment.
- Authenticated current-season API trial requires an approved provider account and server-held API token plus verified use rights.
- Production data import and daily unattended collection remain unauthorized/unverified.
