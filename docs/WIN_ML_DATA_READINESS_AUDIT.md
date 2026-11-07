# WIN Stage 1 — ML data-readiness audit (2026-11-05)

Status: source-code, repository-documentation and prior CI-audit review against combined PR #10 head `17dc194392de8ff4458dcd18a036d6dde99f315b`. This document does not assert that any source dataset has been imported into production memory. No import, model training, production read or write, or paid API call was performed for this audit.

## 1. Executive decision

**Do not start model training or create a required hosted ML service yet.** WIN has useful dataset adapters, a model-lab research pack, historical market benchmarks and a competition-frequency baseline, but source availability is not the same as a model-ready training table.

The next safe ML milestone is a reproducible, offline dataset inventory and feature/label contract. First choose one sport/market with:
- permitted and reproducible historical source records;
- stable event/team/player identifiers;
- reliable event timestamps and a known pre-match information cutoff;
- a target label with explicit settlement semantics;
- enough representative samples for chronological walk-forward evaluation;
- source/version/checksum and licence provenance on every row.

Do not train a universal cross-sport model. Start with one carefully bounded football market after the association-football data gap is addressed.

## 2. What the inspected source code and documents establish

### Association football

| Source | Data available / declared scope | Licence and automation status | ML readiness |
|---|---|---|---|
| OpenFootball `football.json` | Fixtures, results and competition metadata | Registry marks the specific football.json repository CC0 and automation-approved | Useful for fixture/result labels and basic historical form; does not provide rich team/player match statistics or pre-match feature history |
| OpenFootball World Cup JSON | Selected World Cup fixtures, results, goalscorers, lineups, substitutions, bookings, venues and player events | Specific repository CC0; approved with attribution | Narrow competition scope; useful for event/player outcome experiments, not representative broad-league training |
| StatsBomb Open Data | Selected competitions/seasons, match metadata, event records and lineups; bounded manual import | Private non-commercial research only; owner confirmation required for each import; no automatic ingestion or raw redistribution | Potentially the strongest detailed association-football research source, but import is not yet performed and coverage is selected rather than comprehensive |
| API-Football | Potentially broad fixtures, team/player statistics, lineups, ratings, events, injuries, odds and standings | Licensed commercial API; registry blocks use until rights/terms, key and data-domain approval | Do not call or train on it until approval; no API key or permission is assumed |
| UEFA, FotMob, ESPN, FootyStats | Reference-only candidate sources | Licence review required; automation disabled | Not connected data feeds; no scraping or automated training permitted |

The current NFL PBP adapter is American football, not association football. It must not be represented as solving the association-football xG, shot-map, player-rating, lineup, injury or pass-event gaps.

### American football

The repository's documented read-only audit reports:
- 2025 and 2026 seasons: 406 completed games;
- 69,962 source plays;
- 28,606 player match lines;
- 279,781,795 UTF-8 JSON bytes (about 256 MiB);
- full exact schedule joins for the two audited seasons and zero rejected PBP rows in those runs.

These are source-audit measurements, not evidence that the records were imported or stored in WIN. The PBP source is CC BY 4.0 with attribution. The source schema contains 372 columns; the adapter explicitly interprets 125 fields while retaining other non-empty source values losslessly. This is promising for a separate American-football model, but two seasons alone do not prove sufficient training coverage, and the measured payload size is material for storage planning. Do not bulk-import the full historical archive without a separate size, quota and ownership decision.

### Basketball

- SkillCorner Open Data covers ACB 2025/26 player-team-season aggregates for shots, drives and picks.
- The upstream README reports 293 of 327 games and offense-only aggregate coverage.
- This is season aggregate grain, not match-by-match observations; it cannot alone support reliable match-level player-prop or next-game prediction features.
- Preserve team rows separately from season-total rows, particularly for traded players.
- The registry keeps import manual and automation disabled.

The repository also lists NBA consensus opening/closing lines and settled outcomes. Those are market benchmarks, not player features or bookmaker-specific execution prices.

### Tennis and other sports

The provider registry includes a CC BY 4.0 ATP/WTA 2025 consensus dataset with 5,791 singles matches and fair/closing-price information. It can support a separate tennis market benchmark, but retired/walkover matches need explicit settlement handling and the best-price bookmaker identity is not supplied.

The registry also lists consensus datasets for basketball, ice hockey, baseball, football and American football. Most contain consensus opening/closing probabilities and settled market outcomes, not raw bookmaker identities or rich match/player features. They can benchmark market-implied probabilities and support settlement-aware evaluation; they should not be mislabelled as a source of independent sport performance features.

## 3. Existing ML-related implementation — what it actually does

- `netlify/lib/model-lab.mts` reads historical event, market-consensus, observed-market, calibration, player-event, settlement and player-season aggregate collections.
- `runOpenFootballBaselineLab` calculates competition/season frequency probabilities for 1X2 and goal lines. It requires at least 30 scored matches and splits each dataset chronologically 70/30.
- Its baseline is frequency-based, not feature-trained Logistic Regression, Poisson or CatBoost.
- It reports accuracy, Brier score and log loss for the test segment; its own limitations say no historical bookmaker execution prices exist in OpenFootball and no ROI/CLV can be calculated from that source.
- `netlify/lib/market-calibration.mts` evaluates historical consensus market probabilities against settled outcomes. This is market benchmark evaluation, not calibration of a trained WIN predictor.
- `netlify/lib/backtest.mts` evaluates strategy/selection outcomes when authentic source price and settlement provenance exist. This is not model training.
- The model-lab research pack also builds match evidence with source-level provenance, data coverage, and a pre-match cutoff. Date-only records are conservatively treated to avoid same-day leakage.
- The model-lab reads data collections; code presence does not prove those collections currently contain imported records.

Therefore: a useful research/evaluation framework exists, but the inspected baseline does not establish a trained, validated, autonomous ML prediction model.

## 4. Dataset and feature risks that block premature training

1. **Source availability vs. import state:** adapters and CI audits can exist while historical data collections remain empty or unpopulated. Record import status separately from source capability.
2. **Time leakage:** retain event time, source publication/capture time, retrieval time and prediction cutoff. A closing market price or confirmed lineup is not a valid feature for a forecast timestamp before it was available.
3. **Label semantics:** define each market's win/loss/push/void/retirement/walkover rules before training. A full-time result cannot be used as a generic label for every market.
4. **Identity matching:** match provider event IDs, competition/season IDs, participant IDs and team aliases exactly; reject ambiguous joins.
5. **Coverage bias:** selected tournaments, partial seasons and manual imports are not representative random samples of all competitions.
6. **Consensus leakage/circularity:** consensus market probabilities are useful benchmark features only if they were captured before the decision cutoff. When used as a benchmark target, do not claim WIN has independently predicted what the consensus itself already states.
7. **Bookmaker price provenance:** consensus prices are not individual executable bookmaker prices. Do not calculate execution ROI, CLV or expected value from consensus data as though it were an actual offered price.
8. **Player props:** season totals and partial player events do not provide reliable match-level minutes, role, availability or participation context.
9. **Rights and attribution:** a registry flag is an operational gate, not a legal opinion. Keep dataset-specific licence, attribution, usage purpose and raw redistribution restrictions with the dataset snapshot.
10. **Payload and quota:** the two-season NFL audit alone serialized about 256 MiB of event JSON. Training storage and compute must be planned from measured imported data, not assumed free/unlimited.

## 5. Recommended first model experiment

The first experiment should be **association-football 1X2 or goals only after an approved historical dataset import**. Prefer a single competition/season with exact kickoff timestamps and a clearly defined target.

Minimum pipeline:
1. Build an immutable dataset manifest: provider, source URL, licence/attribution, import time, event-time precision, season, row count, schema version and raw checksum.
2. Normalize one row per completed match with exact home/away IDs and final score.
3. Construct only point-in-time team features (prior results, goals for/against, home/away split and rest) from matches strictly before kickoff.
4. Use a chronological rolling/walk-forward split; keep the final chronological holdout untouched.
5. Fit a simple Poisson attack/defence model for score/goal distributions and a Logistic Regression baseline for 1X2.
6. Compare with the existing frequency baseline using Brier score, log loss, calibration and confidence intervals.
7. Add CatBoost only after representative sample size, feature completeness and reproducible baseline evidence exist.
8. Save model artifact, dependency versions, seed, feature schema, dataset checksum, cutoff rule, fold definitions, metrics and known limitations.
9. Keep predictions in shadow mode until a separate approval gate is met.

If the permitted association-football sample is too narrow or sparse, report `INSUFFICIENT_DATA` and continue data acquisition research rather than train a misleading model.

## 6. Data readiness by sport

| Sport | Current best evidenced data path | Main blocker | Decision |
|---|---|---|---|
| Association football | OpenFootball results; optional manual StatsBomb Open Data; API-Football candidate | Detailed historical match/player coverage, exact kickoff and licence scope | First priority, but training gated |
| American football | nflverse PBP + schedule | Only two seasons in audited sample; large payload; broader history/import state not verified | Separate future model candidate |
| Basketball | NBA consensus market datasets; SkillCorner ACB season aggregates | No broad match-level team/player feature dataset evidenced | Market benchmark only for now |
| Tennis | ATP/WTA consensus benchmark | Limited independent player-performance feature coverage; settlement edge cases | Separate benchmark experiment possible |
| Ice hockey / baseball | Consensus market datasets | Market labels without sufficiently rich independent sport features | Benchmark only |
| Other sports | SportScore live/recent feed | Supplementary live data; not historical training-grade evidence | Do not train from this feed alone |

## 7. Next implementation gate

Before creating a Python workspace or installing ML libraries:
- inventory the actual dataset records available in isolated/test memory without exposing production data;
- report counts by provider, sport, competition, season, row grain, timestamp precision, label coverage and checksum;
- prove that each imported dataset's licence/automation status matches the registry;
- define one feature schema and one settlement-aware label schema;
- establish a local reproducible experiment using a synthetic fixture first, then a separately approved real historical sample.

No Python runtime, paid provider, model service, production import, schedule, database migration, or prediction-policy change is authorized by this audit.
