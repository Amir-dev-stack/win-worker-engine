# WIN Worker Engine

WIN is the on-demand backend and operations console for the WIN multi-sport research project. It researches and audits betting markets; it never places bets or handles stakes.

## On-demand request flow

1. ChatGPT invokes the connected WIN MCP tool after the user authorizes the private plugin.
2. WIN creates a run through the Executive Coordination Office.
3. Department 1 — Public Offer & Scouting — runs first. It searches bounded, publicly accessible sources, attempts official STS public-offer sources, records event identity/time/status and only captures STS prices that are genuinely visible.
4. The Worker Network Director creates a dynamic task graph from user-supplied and scout-reported candidates: sport → sport/country → competition → event → specialist assignments. Empty or unverified branches are not invented.
5. Departments 2–8 receive the scouting handoff and run separate OpenAI Responses API requests. Each department report covers its director's assigned teams and checklists.
6. Four separate challenge requests conduct FOR, AGAINST, market/settlement and quantitative/correlation review.
7. The single WIN Global Master receives the complete report pack and issues BET / WAIT / NO BET. Failed or empty required reports force NO BET.
8. The dashboard and MCP tools expose the actual worker reports, citations, dynamic network tree, handoffs, blockers and frozen forecast record.

A queued run is not a completed run. ChatGPT should read the run again until it reaches a terminal status and inspect the actual reports, not infer completion from the queue response.

## WIN organization embedded in the engine

### Command and orchestration

- **WIN Global Master Agent** — the only final decision authority.
- **Executive Coordination Office** — creates run scope, task ID, objective, date/time window and task constraints.
- **Independent Multi-Worker Operations & Federation Department (IMWFD)** — Worker Network Director, dynamic task graph, source/evidence routing, task statuses and department handoffs.

### Dynamic entity and event hierarchy

The graph creates only nodes supported by verified public sources or user-supplied material. Each identified entity receives a stable, persistent agent profile, activated only when needed:

- **Tier 0:** Worker Network Director.
- **Tier 1:** Sport Agent — sport-specific rules, formats, metrics and methods.
- **Tier 2:** Country Agent per relevant sport × country.
- **Tier 3:** League / Competition Agent per sport × country × competition/tour/series.
- **Tier 4:** Club / Team Agent — squad, management, tactics, results, home/away splits, availability and performance.
- **Tier 5:** Player / Athlete Agent — match-by-match record, minutes, role, goals/assists or sport-specific output, discipline/cards, injuries, availability and performance trends.
- **Tier 6:** Match / Event Agent — the complete event dossier connected to relevant club and player profiles.
- **Tier 7:** Event specialist assignments for identity/schedule, form, availability, tactics, competition context, venue/conditions, data quality, FOR, AGAINST, contrarian review, sport-specific statistics and price context.

The system does not invent full rosters or pre-create every unknown country, club or athlete. Stable agent profiles are created when an entity is actually identified in source material or supplied by the user. The entity agent is a persistent identity and scoped memory; its review is routed through the responsible department request, not misrepresented as a separate always-running model process.

### Eight main departments

1. **Public Offer & Scouting** — STS coverage, public offer capture, country/competition/fixture scouts, data coverage and market availability.
2. **Sport Analysis** — sport masters, performance/form, availability, tactics/technical matchup, context, sport-specific statistics, Small Chef A (FOR) and Small Chef B (AGAINST).
3. **Betting Markets & Settlement** — market taxonomy, sport-market specialists, market mapping, settlement/rules, price snapshot and Bet Builder/system review.
4. **Quantitative Research & Evidence** — source verification, statistical research, probability/calibration, price/value and uncertainty/sample quality.
5. **Strefa Inspiracji & Tipster Intelligence** — SmartBet, public tips, coupon decomposition, historical performance and contrarian inspiration review. Login-only content is not automatically accessed.
6. **Coupon Construction & Portfolio Risk** — coupon builder, portfolio/correlation auditor, alternatives, system-bet specialist and WIN Low-Risk Gate.
7. **Results, Learning & Knowledge Transfer** — outcome review, prediction audit, calibration/performance, root cause, teaching and learning ledger administration.
8. **Integrity, Source Governance & Responsible Play** — source provenance, freshness/conflict checks, Red Team/pre-mortem, privacy and responsible-play vetoes.

### Actual execution count

Each run makes up to **13 independent Responses API requests**:
- 8 main department reports, with Department 1 scouting first and Departments 2–8 receiving its handoff;
- 4 independent debate/challenge reports;
- 1 Global Master request.

This is the actual count of independent model API requests. The event chiefs and Tier 5 roles are tracked task assignments covered inside the relevant department reports, not extra independent sessions. The dashboard shows the real request/report counts.

## Expanded WIN agent federation

Every identified sports entity receives a stable, persistent, on-demand agent identity and a scoped dossier. The graph is built from confirmed/user-supplied entities; it does not fabricate a complete world roster or pre-create every unknown athlete.

| Tier | Persistent agent identity | Research remit |
| --- | --- | --- |
| T0 | Worker Network Director | Scope, task graph, source routing and handoffs |
| T1 | Sport Agent | Sport rules, metrics, formats, tactical and statistical methods |
| T2 | Country Agent | Country context, governing bodies and local competition structure |
| T3 | League / Competition Agent | Format, standings, incentives, schedule and historical context |
| T4 | Club / Team Agent | Squad, management, tactics, results, home/away splits and availability |
| T5 | Player / Athlete Agent | Match-by-match record, minutes, goals/assists or sport-specific output, discipline, injury, availability and performance trends |
| T6 | Match / Event Agent | Event-specific dossier combining all relevant entity reports |
| T7 | Event specialists | Identity, form, availability, tactics, conditions, evidence, FOR/AGAINST and price checks |

These are persistent agent identities and profiles activated on demand. The entity-specific task is routed through the relevant department report; the system does not pretend that every profile is a separately running AI process or an independent API session. If a named club or player is not present in reliable or user-supplied sources, its agent is not fabricated.

## WIN Knowledge Library — mandatory for coupon writers

The shared library uses the existing private, site-wide Netlify Blobs store `win-engine` in `eu-central-1`. It does not require a separate database subscription or a continuously running worker.

| Library collection | What is stored |
| --- | --- |
| `library/winning-coupons` | Human or WIN coupons with verified winning settlement |
| `library/losing-coupons` | Human or WIN coupons with verified losing settlement |
| `library/pending-coupons` | Unsettled, void, partial, cancelled or otherwise unclassified coupons |
| `library/coupons` | Canonical coupon record and complete selection details |
| `library/coupon-history` | Append-only coupon import and settlement history |
| `library/lessons` | D7 reports, agent notes and lesson proposals; only explicitly validated lessons are treated as established knowledge |
| `library/entity-profiles` | Stable profiles for sport, country, league, club, player and event agents |
| `library/agent-profiles` | Persistent specialist agent identities and missions |
| `library/agent-observations` | Run-linked observations written to each relevant entity agent's history |
| `library/agent-notes` | Full department, challenge and Global Master reports |
| `library/research-runs` | Archived full run brief, reports, debate, network, citations and decision |
| `library/coupon-research-cases` | Coupon build, audit and comparison case files |
| `library/archive-failures` | Audit records when library archiving itself fails |

### Mandatory learning checkpoint

Before a coupon can be approved, the worker engine loads relevant winning coupons, losing coupons, validated lessons and entity profiles from the library and includes that real data in every department brief. D6 Coupon Construction and D7 Results/Learning must both return a machine-readable `WIN_LIBRARY_REVIEW_JSON` receipt listing reviewed record IDs and empty collections. If either receipt is missing/invalid, the deterministic Low-Risk Gate returns **NO BET**.

D7 may write proposed lessons to the library, but they remain `candidate_for_validation` and are not supplied as proven knowledge until an authorized reviewer validates them with evidence. Settled human coupons are imported with `save_human_coupon` and moved to the winning or losing section only through `record_coupon_outcome` with a settlement source. Void/partial/cancelled cases are not mislabeled as wins or losses.

Every completed or failed run is archived with its worker reports, four challenge reports when available, Global Master decision, citations, network and entity observations. Coupon research cases are retained even when the final decision is WAIT or NO BET.

### Library access

The authenticated REST endpoint is `GET|POST /api/library`. The OAuth-protected MCP tools are:
- `search_win_library`
- `save_human_coupon`
- `record_coupon_outcome`
- `save_win_entity_profile`
- `save_win_learning_note`
- `validate_win_lesson`

All library access is private and requires authenticated WIN access. The library is persistent storage, not a 24/7 AI process: no cron/scheduler or paid always-on worker is used. Records remain stored between runs and deploys. However, a free hosting plan cannot guarantee uninterrupted API availability: if Netlify pauses the team after its monthly credits are exhausted, the library API cannot be reached until the site resumes. Storage and API use remain subject to the host's quotas. Netlify Blobs is key/value object storage, not a transactional relational database; this remains a single-operator MVP.

## On-demand coupon task modes

The MCP tool `start_research_run` supports:

- `build_latest_coupon` — discover current publicly available pre-match candidates and propose a coupon only from eligible verified selections;
- `audit_existing_coupon` — audit the coupon text supplied by the user;
- `compare_coupons` — compare the supplied coupon with a separately built WIN alternative;
- `research_event` — investigate a named event.

Optional parameters include existing coupon text, sport, country, competition, date/time window, markets, target combined odds and maximum legs. An odds target is subordinate to evidence and the Low-Risk Gate.

## ChatGPT ↔ WIN MCP connection

MCP endpoint:

`https://win-worker-engine.netlify.app/mcp`

The private plugin package is configured to use Streamable HTTP MCP with OAuth authorization-code flow, PKCE S256, dynamic client registration and an owner-consent page. Discovery endpoints:

- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`
- `/oauth/register`
- `/oauth/authorize`
- `/oauth/token`

The owner authorizes on the WIN domain using the private WIN internal token. The token is not embedded in the plugin. ChatGPT receives scoped access tokens (`win:read`, `win:research`).

MCP tools:

- `start_research_run`
- `get_run`
- `list_runs`
- `list_human_tips`
- `list_predictions`

The updated plugin must still complete its first ChatGPT OAuth authorization handshake before the connection can be considered fully verified.

## Required Netlify environment variables

Set these in Netlify → win-worker-engine → Project configuration → Environment variables. Keep secrets scoped to Functions/Runtime.

| Variable | Required | Purpose |
| --- | --- | --- |
| OPENAI_API_KEY | Yes | OpenAI API key. API usage is billed separately from a ChatGPT subscription. |
| OPENAI_MODEL | Yes | A model ID enabled for the OpenAI API account. |
| WIN_INTERNAL_TOKEN | Yes | Private bearer token for REST/dashboard and owner consent. Keep secret. |
| WIN_ENABLE_WEB_SEARCH | No | Set to true to enable Responses API web search; defaults to true. |

Never put these values in the browser bundle, GitHub, chat messages, or netlify.toml.

## STS data access boundary

There is no official STS API or private STS-account connection in this project. WIN does not bypass STS login, CAPTCHA, anti-bot checks, session protections or private account access. Research can use public web sources through the research workers. Exact STS prices and login-only Strefa Inspiracji material must be supplied by the account holder or connected later through a licensed and authorized feed. Third-party prices must never be presented as current STS prices.

If exact current STS odds are unavailable or unverified, WIN must mark them BLOCKED / NOT VERIFIED and must not present the candidate as a placement-ready STS coupon.

## Research integrity and risk rules

1. Initial department reports are separate API requests; later debate requests receive the reports and must challenge them.
2. Failed or empty required department/challenge reports force NO BET.
3. Global Master cannot force an odds target by adding weak selections.
4. A tipster hit rate or popularity count requires verified historical odds/results, sample size and time window.
5. A source URL alone does not prove a claim.
6. A pre-event forecast is frozen with a timestamp; result records remain separate.
7. No automated bet placement, deposits, account access, session-cookie handling, login bypass or stake change.
8. Do not encourage chasing losses, borrowing or risking essential funds.

## API

All REST routes require `Authorization: Bearer <WIN_INTERNAL_TOKEN>`, except health. MCP uses OAuth for ChatGPT; owner testing can use the private internal bearer token.

- GET /api/health
- GET|POST /api/runs
- GET /api/runs/:id
- GET|POST /api/tips
- GET /api/predictions
- POST /api/results
- POST /mcp

## Current limitations

- Public STS availability may not include every market or price. The system reports its scan scope and gaps; it is not a complete authenticated STS offer feed.
- Strefa Inspiracji is not automatically scraped. Import public/authorized tip details or include login-only material supplied by the account holder.
- The user-supplied settlement evidence remains necessary until an official results/settlement provider is integrated.
- Netlify Blobs is object storage, not a relational/transactional database. This remains a single-operator MVP; migrate to managed Postgres before high-volume concurrent use.
- ChatGPT plugin OAuth authorization and a real research run still need an end-to-end live test before the integration is described as fully verified.

## Deploy and local development

The project deploys from GitHub `main` to Netlify. Build command: `npm run build`. Publish directory: `public`. Functions directory: `netlify/functions`.

Local development requires Node.js 20.12.2+ and Netlify CLI:

    npm install
    netlify dev

Use an untracked `.env` file or Netlify environment variables for local secrets. Do not commit credentials.
