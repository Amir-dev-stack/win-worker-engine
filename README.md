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

### Dynamic event hierarchy

The worker graph creates only nodes supported by the supplied brief or scouting results:

- **Tier 0:** Worker Network Director.
- **Tier 1:** Sport / Discipline Chief.
- **Tier 2:** Country Chief per relevant sport × country.
- **Tier 3:** League / Competition Chief per relevant sport × country × league/tour/series.
- **Tier 4:** Match / Event Chief for each distinct fixture or event.
- **Tier 5:** Event specialist assignments for identity/schedule, form, availability, tactics, competition context, venue/conditions, data quality, FOR, AGAINST, contrarian review, sport-specific statistics and price context.

These chiefs and specialist positions are tracked in the run's worker-network manifest and routed to the responsible department pass. They are not counted as extra autonomous model sessions. Each event's specialist checklist is covered by its department report.

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
