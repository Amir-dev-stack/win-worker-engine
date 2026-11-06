# StatsBomb Open Data — WIN research adapter

## What this connector does

WIN can manually import selected competition/season match records from the public StatsBomb Open Data repository:

- Competition and season catalogue.
- Match metadata and scores where supplied.
- Match event JSON, including shots, passes, pressure, carries, duels, fouls and other event types available in the source.
- Lineups where supplied.
- Event-derived player counts and shot xG totals, with provider definitions retained.

The imported data is stored only in WIN's historical Model Lab collection. It does not enter the human coupon library, create a prediction, create a coupon, settle a bet or trigger an AI call.

## Access and usage limits

The upstream repository makes selected leagues and seasons publicly available for research projects and genuine interest in football analytics. It does not publish a general-purpose Creative Commons data licence for the dataset.

Accordingly, WIN treats this source as **private, non-commercial research only**:

- The user must confirm this use before every import.
- Imports are manual; there is no automatic schedule or background crawler.
- Each import is limited to 15 recent matches from one selected competition/season.
- File size is limited to 12 MiB per source file and 48 MiB per import.
- Requests run with concurrency limited to two.
- Raw dataset redistribution is not enabled.
- If derived research or analysis is published, shared or distributed, cite StatsBomb and use the official StatsBomb logo, as requested by the source repository.
- Do not use this connector for a commercial product or commercial data service without separate permission from StatsBomb.

Source repository and terms: https://github.com/hudl/open-data

## Time and evidence integrity

StatsBomb match records contain a match date and a local kick-off clock without a timezone. WIN preserves the date as date-only and keeps the local kick-off string separately. It does not invent a UTC timestamp.

StatsBomb event-derived counts and xG remain labelled as StatsBomb metrics. WIN does not assume that provider xG, pressure, pass or event definitions are identical to other providers' definitions.

A missing event or lineup file is recorded as missing; it is never interpreted as zero events, zero minutes or a non-participating player.

The source match score is not treated as a bookmaker settlement instruction. WIN's existing market-specific settlement controls remain separate.

## How to use it

1. Open WIN's Learning / public result and historical data sources panel.
2. Select a competition and season from the public StatsBomb catalogue.
3. Choose a bounded sample of up to 15 recent matches.
4. Review the non-commercial research and attribution notice and confirm before importing.
5. Check the research status panel for the import status, match count, event count and source coverage.

The catalogue is read-only. Import happens only after the explicit confirmation and a manual button click.

## What this does not provide

- Live scores or live event streaming.
- Every competition or every season.
- Full optical tracking for every match.
- A bookmaker odds feed.
- Guaranteed complete lineups or event files.
- Official player ratings or minutes unless a source actually supplies those fields.
- Proof that any prediction or betting strategy has an edge.

The adapter is a source connection, not a model validation result. Historical research must still use chronological tests, independent result checks and prospective paper tracking.
