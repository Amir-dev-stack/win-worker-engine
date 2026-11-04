# SportScore live multi-sport API

## What WIN connects

The SportScore public widget API provides live/recent match rows for:
- Football
- Basketball
- Cricket
- Tennis

The public API also documents match details, team schedules, standings, top scorers, player statistics and brackets. WIN's first connector phase intentionally imports only the small live/recent match list; the other endpoints are not enabled yet.

Official developer page: https://sportscore.com/developers/
Open API terms (reviewed 5 November 2026): https://sportscore.com/developers/terms/

## Free-tier requirements

The published API terms say the public `/api/widget/` endpoints are available without an API key. The free tier is available to personal projects, open-source applications, non-commercial community tools and early-stage commercial projects that display attribution.

WIN must display this visible, crawlable, dofollow link on the same dashboard surface that shows the data:

`Powered by SportScore` → https://sportscore.com/ with `rel="dofollow"`.

The source asks for approximately 10,000 requests per 24 hours per IP, with 60-second edge caching. WIN adds its own 60-second per-sport cache and only queries after a user presses the dashboard button. There is no scheduled polling.

The terms allow caching responses and combining SportScore data with other sources in derived dashboards/analytics. They prohibit scraping/mirroring/re-hosting raw responses as a competing data feed, bulk raw data redistribution, and use that facilitates match-fixing or illegal gambling activity. Only use the connector in jurisdictions and use cases where lawful.

## Data reliability and WIN restrictions

SportScore says it aggregates data from upstream providers and does not guarantee that every score, statistic or fixture time remains unchanged. The API terms warn that results and statistics can change after publication and must not be the sole source for financial, legal or safety-critical decisions.

Therefore WIN:
- Treats SportScore as supplementary evidence, not a sole source of truth.
- Labels scores/time as source-reported and not independently verified.
- Does not send SportScore records into the settlement engine.
- Does not create predictions or coupons directly from this feed.
- Does not store a bulk historical archive; it caches only a normalized list for up to 60 seconds.
- Preserves missing scores and kickoff times as unavailable; it never converts them to zero or invents a UTC timestamp.
- Makes no AI calls and does not require an API key or paid account.

## How to use it

1. Open WIN's Learning / public result and historical data sources panel.
2. Choose Football, Basketball, Cricket or Tennis.
3. Press **Get live and recent matches**.
4. Check the returned match identity, score, source time and status against another trusted source before using it in any decision.

This first phase uses only the live/recent match list endpoint. If the API returns no match rows, that does not prove that there are no scheduled events.

## Request behaviour

- API: `GET https://sportscore.com/api/widget/matches/`
- Parameters: `sport`, `limit=15`, optional `src=win-worker-engine`
- API key: none
- Cache: 60 seconds per sport in WIN
- Trigger: authenticated manual dashboard action only
- Schedule: none
- Maximum response imported: 15 normalized matches per request
- Raw JSON redistribution: disabled

The upstream terms can change. Re-check the official developer terms before expanding to scheduled ingestion, wider caching, public exposure or a different product use.
