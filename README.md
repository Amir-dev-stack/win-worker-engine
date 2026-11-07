# WIN Worker Engine

WIN is the on-demand backend and operations console for the WIN multi-sport research project. It researches and audits betting markets; it never places bets or handles stakes.

## OpenAI Research Network and persistent memory

The WIN research network is provider-neutral and free-first. A bounded OpenAI assignment executor, a local Ollama runner, and opt-in Cloudflare/Gemini adapters have been added in code. They remain disabled until owner-side configuration, quota checks and deployment are complete. The owner has authorized additional agent frameworks and model providers when they are genuinely free and sustainable. The planned order is local Ollama first, then verified free Cloudflare/Gemini quotas for public non-sensitive tasks, with OpenAI as a bounded paid escalation route under the existing owner-authorized ceiling. The current OpenAI SDK integration remains supported; other providers are not considered connected until their adapters, credentials/runner and quota controls are actually implemented and verified.

Each specialist has private persistent memory for its own tasks, experiments, failed approaches and source trail. Independently reviewer-accepted findings enter a shared research-network memory that all agents can consult. This shared research memory is still separate from WIN's trusted production knowledge: promoting a finding into a validated WIN lesson, model, strategy or production code requires the normal independent validation and owner-controlled promotion process.

The owner has authorized bounded OpenAI API spending for this research network. Preserve the existing WIN application spending stop of USD 2.95 and owner lock, with no auto-recharge. Each task must have its own model/tool-call ceilings, cost reservation, actual usage reconciliation and stop condition. OpenAI-hosted tools are not assumed free. Do not start unbounded or continuous agent loops. Research agents can submit artifacts and pull requests, but cannot deploy, merge to production, unlock budgets, change credentials or place bets.

See [the research network architecture](docs/WIN_EXTERNAL_RESEARCH_NETWORK.md), [the free-first provider plan](docs/WIN_FREE_FIRST_AGENT_PROVIDER_PLAN.md), [the local Ollama runner setup](docs/WIN_LOCAL_RESEARCH_RUNNER.md), [the persistent assignment manager](docs/WIN_RESEARCH_ASSIGNMENT_MANAGER.md), and [the API credit activation plan](docs/WIN_OPENAI_CREDIT_ACTIVATION_PLAN.md).

## On-demand request flow

1. ChatGPT invokes the connected WIN MCP tool after the user authorizes the private plugin.
2. WIN creates a run through the Executive Coordination Office.
3. Department 1 — Public Offer & Scouting — runs first. It searches bounded, publicly accessible sources, attempts official STS public-offer sources, records event identity/time/status and only captures STS prices that are genuinely visible.
4. The Worker Network Director creates a dynamic task graph from user-supplied and scout-reported candidates: sport → sport/country → competition → event → specialist assignments. Empty or unverified branches are not invented.
5. Departments 2–8 receive the scouting handoff and execute through WIN's versioned, provider-neutral LLM policy. The currently approved OpenAI runtime uses the TypeScript Agents SDK; provider/model selection, data classification, output limits, cancellation and budget reservation are checked before execution. Each department report covers its director's assigned teams and checklists.
6. Four separate challenge requests conduct FOR, AGAINST, market/settlement and quantitative/correlation review.
7. The single WIN Global Master receives the report pack and returns a recommendation with estimated probability, confidence/uncertainty, supporting evidence, counterarguments, price context and any proposed coupon structure. Missing or failed reports are disclosed as evidence gaps; they do not silently erase a requested draft proposal or make up a probability. The user alone makes the final BET / WAIT / NO BET decision.
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
- **Tier 2:** One persistent Country Agent per country, shared across the sports represented in its research scope.
- **Tier 3:** League / Competition Agent per sport × country × competition/tour/series.
- **Tier 4:** Club / Team Agent — squad, management, tactics, results, home/away splits, availability and performance.
- **Tier 5:** Player / Athlete Agent — match-by-match record, minutes, role, goals/assists or sport-specific output, discipline/cards, injuries, availability and performance trends.
- **Tier 6:** Match / Event Agent — the complete event dossier connected to relevant club and player profiles.
- **Tier 7:** Event specialist assignments for identity/schedule, form, availability, tactics, competition context, venue/conditions, data quality, FOR, AGAINST, contrarian review, sport-specific statistics and price context.

The system does not invent full rosters or pre-create every unknown country, club or athlete. A country has one persistent country-agent identity shared across its sport branches. Stable club, player and event profiles are created when an entity is identified in reliable source material or supplied by the user. When available, source-provided provider IDs anchor canonical identity and aliases are retained; without an ID, ambiguous same-name entities are not automatically merged. A player profile can follow a transfer across clubs when a stable provider ID supports the link. The entity agent is a persistent identity and scoped memory; its review is routed through the responsible department request, not misrepresented as a separate always-running model process.

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

Each run makes up to **13 independent worker passes** through the governed LLM execution path:
- 8 main department reports, with Department 1 scouting first and Departments 2–8 receiving its handoff;
- 4 independent debate/challenge reports;
- 1 Global Master request.

These are worker passes, not a guaranteed count of billable HTTP requests: an SDK pass may use more than one model turn and optional hosted tools, subject to the configured caps. The persistent Sport, Country, League, Club, Player and Match/Event agent identities are activated on demand and their entity-specific work is routed through the responsible department reports. Tier 7 event specialist assignments are also covered inside those department passes. They are not extra always-on processes. The dashboard and budget ledger must report observed model usage rather than assuming one pass equals one request.

## Expanded WIN agent federation

Every identified sports entity receives a stable, persistent, on-demand agent identity and a scoped dossier. Each country has one shared identity across sports. The graph is built from confirmed/user-supplied entities; it does not fabricate a complete world roster or pre-create every unknown athlete. Provider IDs and sourced aliases are retained when available to support canonical identity and historical club/player relationships.

| Tier | Persistent agent identity | Research remit |
| --- | --- | --- |
| T0 | Worker Network Director | Scope, task graph, source routing and handoffs |
| T1 | Sport Agent | Sport rules, metrics, formats, tactical and statistical methods |
| T2 | Country Agent | One shared identity per country across sports; governing context, governing bodies and local competition structure |
| T3 | League / Competition Agent | Format, standings, incentives, schedule and historical context |
| T4 | Club / Team Agent | Squad, management, tactics, results, home/away splits and availability |
| T5 | Player / Athlete Agent | Match-by-match record, minutes, goals/assists or sport-specific output, discipline, injury, availability and performance trends |
| T6 | Match / Event Agent | Event-specific dossier combining all relevant entity reports |
| T7 | Event specialists | Identity, form, availability, tactics, conditions, evidence, FOR/AGAINST and price checks |

These are persistent agent identities and profiles activated on demand. The entity-specific task is routed through the relevant department report; the system does not pretend that every profile is a separately running AI process or an independent API session. If a named club or player is not present in reliable or user-supplied sources, its agent is not fabricated.

## WIN Knowledge Library — mandatory for coupon writers

The shared library uses the existing private, site-wide Netlify Blobs store `win-engine` in `eu-central-1`. It does not require a separate database subscription or a continuously running worker. On its first authenticated library read or coupon research run, the library also performs a one-time, non-destructive copy of legacy tips, runs, frozen predictions and settled results into the corresponding library collections; original source records are retained.

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
| `library/learning-cycles` | Scheduled four-hour research-cycle reports, sources, coverage gaps and validation blockers |
| `library/strategy-candidates` | Structured strategy hypotheses with eligibility rules, exclusions, required data and `candidate_for_validation` status |
| `library/backtest-runs` | Chronological 60/20/20 training, validation and holdout metrics for fixed strategy filters |
| `library/backtest-datasets` | Source-attributed pre-event selection data retained to reproduce a backtest |
| `library/research-runs` | Archived full run brief, reports, debate, network, citations and decision |
| `library/coupon-research-cases` | Coupon build, audit and comparison case files |
| `library/archive-failures` | Audit records when library archiving itself fails |

### Mandatory learning checkpoint

Before a coupon can be approved, the worker engine loads relevant winning coupons, losing coupons, validated lessons and entity profiles from the library and includes that real data in every department brief. D6 Coupon Construction and D7 Results/Learning must both return a machine-readable `WIN_LIBRARY_REVIEW_JSON` receipt listing reviewed record IDs and empty collections. If either receipt is missing or invalid, the deterministic Low-Risk Gate marks the review **EVIDENCE_INCOMPLETE**, explains which library records could not be checked, and prevents the proposal from being described as fully audited. Where candidate information exists, WIN should still return a clearly labelled draft proposal and its uncertainty; it must not fabricate a completed review. The user makes the final decision.

D7 may write proposed lessons to the library, but they remain `candidate_for_validation` and are not supplied as proven knowledge until an authorized reviewer validates them with evidence. Settled human coupons are imported with `save_human_coupon` and moved to the winning or losing section only through `record_coupon_outcome` with a settlement source. Void/partial/cancelled cases are not mislabeled as wins or losses.

Every completed or failed run is archived with its worker reports, four challenge reports when available, Global Master decision, citations, network and entity observations. Coupon research cases are retained even when the final decision is WAIT or NO BET.

### Library access

The authenticated REST endpoint is `GET|POST /api/library`.  The OAuth-protected MCP tools are:
- `search_win_library`
- `save_human_coupon`
- `record_coupon_outcome`
- `save_win_entity_profile`
- `save_win_learning_note`
- `validate_win_lesson`

All library access is private and requires authenticated WIN access. The library is persistent storage, not a 24/7 AI process: no cron/scheduler or paid always-on worker is used. Records remain stored between runs and deploys. However, a free hosting plan cannot guarantee uninterrupted API availability: if Netlify pauses the team after its monthly credits are exhausted, the library API cannot be reached until the site resumes. Storage and API use remain subject to the host's quotas. Netlify Blobs is key/value object storage, not a transactional relational database; this remains a single-operator MVP.

## Historical Simulation Lab

The dashboard includes a historical random-coupon experiment runner. It accepts 2–10,000 supplied historical selections and generates 100–100,000 reproducible coupon combinations in a background function. Each input selection must contain:

- `id`, `eventId`, `event`, `sport`, `market`, `pick`
- decimal `odds` and an individually settled `result` (`won`, `lost` or `void`)
- `eventStart` and `oddsCapturedAt` timestamps; odds capture must precede event start
- `oddsSource` and `resultSource` provenance references

Each generated coupon uses at most one selection per event. Simulated winning, losing and void/other coupon batches are stored separately under `library/simulation-winning-coupons`, `library/simulation-losing-coupons` and `library/simulation-other-coupons`. Run summaries and exploratory candidate findings are stored in `library/simulation-runs` and `library/simulation-lessons`. These collections are never merged with real human/STS coupon collections.

**Interpretation limit:** this first simulation mode randomly recombines known historical picks with known settled outcomes. It is useful for studying accumulator fragility, leg-count effects and recurring losing selections, but it is not a pre-match prediction model, a chronological out-of-sample backtest or proof of a future betting edge. Candidate findings remain unvalidated. A separate time-ordered strategy backtester with chronological training/validation/holdout periods is now implemented. Its retrospective results still do not prove predictive performance; prospective frozen paper tracking is required.

REST:
- GET|POST `/api/simulations`
- GET `/api/simulations?category=winning|losing|other&runId=<id>`

MCP:
- `run_historical_coupon_simulation`
- `run_strategy_backtest`

The dashboard accepts a JSON array of selection records. Do not use invented results, fabricated odds, or post-event odds timestamps. A screenshot of a settled coupon is not enough to classify every leg unless each individual market result can be independently determined.

## Strategy Backtest Lab

The MCP tool `run_strategy_backtest` accepts 10–10,000 supplied historical selections with event identity, sport, market, odds, pre-event odds-capture timestamp, settled outcome and source references. It applies fixed user-defined sport/country/competition/market/odds filters, keeps one observation per event, sorts chronologically and reports separate 60% training, 20% validation and 20% holdout results. Metrics include hit rate with a 95% Wilson interval, flat-stake ROI, average odds, Brier score when pre-event probabilities are supplied, and closing implied-probability movement when closing odds are supplied.

Backtests are saved in `library/backtest-runs`; the source-attributed input records are saved in `library/backtest-datasets`. Results always remain `historically_tested_not_validated`. The tool does not tune strategy filters, infer missing odds, guarantee independence, or automatically promote a strategy. A human/independent review and prospective frozen paper record are still required before maturity.

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

The owner authorizes on the WIN domain using the private WIN internal token. The token is not embedded in the plugin. ChatGPT and separately registered MCP clients receive scoped access tokens (`win:read`, `win:research`). The server also advertises `offline_access` and issues one-hour access tokens with rotating 30-day refresh tokens.

MCP tools:

- `start_research_run`
- `get_run`
- `list_runs`
- `list_human_tips`
- `list_predictions`

The updated plugin must still complete its first ChatGPT OAuth authorization handshake before the connection can be considered fully verified.

OpenAI API credit setup and staged activation are documented in [docs/WIN_OPENAI_CREDIT_ACTIVATION_PLAN.md](docs/WIN_OPENAI_CREDIT_ACTIVATION_PLAN.md). The governed external research, practice and experiment network is specified in [docs/WIN_EXTERNAL_RESEARCH_NETWORK.md](docs/WIN_EXTERNAL_RESEARCH_NETWORK.md). The owner-reported USD 5 purchase is not treated as a verified remaining balance or spending approval.

## Required Netlify environment variables

Set these in Netlify → win-worker-engine → Project configuration → Environment variables. Keep secrets scoped to Functions/Runtime.

| Variable | Required | Purpose |
| --- | --- | --- |
| OPENAI_API_KEY | Yes | OpenAI API key. API usage is billed separately from a ChatGPT subscription. |
| OPENAI_MODEL | Yes | A model ID enabled for the OpenAI API account. |
| WIN_INTERNAL_TOKEN | Yes | Private bearer token for REST/dashboard and owner consent. Keep secret. |
| WIN_ENABLE_WEB_SEARCH | No | Set to true to enable Responses API web search; defaults to true. |
| WIN_AI_BUDGET_APPROVED | Yes, explicit opt-in | Must be exactly `true` before any OpenAI call is allowed. Keep unset/false until the API key is rotated, provider-side monthly spending limit and alerts are configured, and auto-recharge is disabled. |

Never put these values in the browser bundle, GitHub, chat messages, or netlify.toml.

**Spending safety:** the in-app Blobs ledger is only an estimate and is not a hard financial cap. WIN fails closed unless `WIN_AI_BUDGET_APPROVED=true`. Before setting it, revoke and replace any exposed API key, configure the OpenAI API project's monthly spend limit and usage alerts, disable automatic recharge, and verify those controls in the provider dashboard. Provider-side enforcement may not be instantaneous; monitor actual usage. Never paste API keys into chat or commit them.

**Owner-controlled stop:** WIN's estimated monthly operating stop is $2.95 against the $3 reference budget. When a request would reach the stop, or settled usage reaches it, WIN writes a persistent owner lock and blocks all further OpenAI calls. The lock survives month rollover; a new month does not reset permission to spend. No OAuth client, specialist agent, scheduled task, or normal REST request can unlock it. A reset requires the owner-only `WIN_INTERNAL_TOKEN` and the exact confirmation phrase `I AUTHORIZE WIN SPENDING UNLOCK` through the authenticated `POST /api/ai-budget` endpoint with `action=owner_approve_unlock`. The previous cycle is archived before a fresh $3 cycle starts; rejected attempts and approved resets are recorded in the budget alert history. The $2.95 ledger is an application estimate, not a provider hard cap: configure a separate OpenAI project spending limit and alerts.

## STS data access boundary

There is no official STS API or private STS-account connection in this project. WIN does not bypass STS login, CAPTCHA, anti-bot checks, session protections or private account access. Research can use public web sources through the research workers. Exact STS prices and login-only Strefa Inspiracji material must be supplied by the account holder or connected later through a licensed and authorized feed. Third-party prices must never be presented as current STS prices.

If exact current STS odds are unavailable or unverified, WIN must mark them BLOCKED / NOT VERIFIED and must not present the candidate as a placement-ready STS coupon.

## Research integrity and risk rules

1. Initial department reports are separate API requests; later debate requests receive the reports and must challenge them.
2. Failed or empty required department/challenge reports are explicitly marked incomplete, lower the evidence-confidence assessment, and prevent a claim of full validation. WIN should still provide a draft candidate/coupon when enough verified information exists, with missing evidence and uncertainty clearly stated; the user makes the final decision.
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
- The user-supplied settlement evidence remains necessary until an official results/settlement provider is integrated.\n- The Simulation Lab currently performs historical coupon recombination, not predictive strategy backtesting.\n- Public human-tipster coupon capture is provenance-aware but still requires public/authorized source material to be imported; there is no unattended crawler or 24/7 scraper.
- Netlify Blobs is object storage, not a relational/transactional database. This remains a single-operator MVP; migrate to managed Postgres before high-volume concurrent use.
- ChatGPT plugin OAuth authorization and a real research run still need an end-to-end live test before the integration is described as fully verified.

## Deploy and local development

The project deploys from GitHub `main` to Netlify. Build command: `npm run build`. Publish directory: `public`. Functions directory: `netlify/functions`.

Local development requires Node.js 22.12.0+ and Netlify CLI:

    npm install
    netlify dev

Use an untracked `.env` file or Netlify environment variables for local secrets. Do not commit credentials.


## Central mission: high-probability coupon intelligence

WIN's central objective is to research, test and improve the strongest evidence-supported betting coupons it can realistically identify. Every department and agent must contribute to better selection quality, lower avoidable risk, stronger probability calibration, verified learning and transparent uncertainty reporting. WIN should provide an estimated probability with its evidence and calibration limits; the user makes the final decision.

The user's 99% win-probability aspiration is a research target, **not a guarantee or a default label**. WIN must never claim 99% without defensible calibrated evidence, sample size and uncertainty. Accumulator joint probability and correlation must be considered; high hit rate must not be confused with positive expected value or profitability.

WIN has two operating phases:
1. **Intensive learning:** build prioritized sport/market/entity coverage; document, historically test, out-of-sample validate and prospectively paper-track strategies using pre-event timestamps and independently verified results.
2. **Mature intelligence:** after both coverage targets and evidence standards pass, reduce broad exploratory research while continuing scheduled monitoring, settlement audits, calibration checks and strategy-decay detection. Reopen intensive research when material gaps or changes appear.

Strategies must have explicit lifecycle states (idea, documented, historically tested, out-of-sample validated, prospectively paper-tracked, mature/monitored, retired/suspended). Backtests and simulations alone do not prove future performance. Every coupon proposal should pass through the full WIN workflow and receive transparent probability, confidence, risk and evidence-completeness assessments. Weak or unverifiable evidence must be disclosed and must reduce confidence; it must not be disguised as certainty. WIN does not place bets. The user makes the final BET / WAIT / NO BET decision.

The full mission, learning exit gate, evidence standards, measurement dashboard and integrity rules are defined in [docs/WIN-MISSION.md](docs/WIN-MISSION.md).


## Scheduled intensive-learning cycle

The published `hourly-monitor` function is configured to run every four hours (UTC). When `WIN_AI_BUDGET_APPROVED=true`, it rotates through six bounded research workstreams — coverage mapping, market/settlement research, falsifiable strategy hypotheses, historical-data audits, verified coupon failure analysis and validation readiness — across a rotating list of sports. Each successful cycle is archived under `library/learning-cycles` and included in later mandatory learning packs. These records are candidate research only; they do not automatically validate a strategy or create a betting recommendation. The scheduler remains disabled for AI work until provider spending controls and key rotation are confirmed.

## OpenAI Agents SDK runtime

WIN's department workers now execute through the OpenAI TypeScript Agents SDK (`@openai/agents`), pinned to `0.21.0`. The runtime creates a focused agent for each WIN worker pass, supports hosted web search when enabled, caps each agent run at two model turns, and records SDK-reported token usage in the existing WIN budget ledger. The same runtime is used by scouting, scheduled learning, department analysis, adversarial review and Global Master passes.

The SDK receives the existing server-side `OPENAI_API_KEY` at runtime; keys are never stored in source control. Automatic SDK trace export is disabled by default so WIN research prompts and tool traces are not sent to the tracing service. The existing `WIN_AI_BUDGET_APPROVED=true` fail-closed gate remains mandatory before any model call. SDK integration does not place bets or bypass source, settlement, evidence or low-risk checks.


## Public human betting research

Department D5 now searches public web material for human-shared coupons and picks across the sports represented in a run. Its source discovery list includes BetBuddyRank (including its open leaderboard/JSON/RSS and links to original X posts), OLBG, Superbet Supersocial, Tipsto, 1x2.social, BetSlip Social, public Reddit threads, public X posts, public YouTube descriptions and STS Strefa Inspiracji.

WIN separates original human coupons and single picks from consensus summaries, bookmaker marketing, tipster promotions, demo content and model-generated predictions. Public material is imported into the human coupon library with source URL, publication/retrieval context and an initial pending settlement state. A result is not learned as won/lost until independent settlement evidence is attached. Human records are stored separately from WIN-generated coupons.

The authenticated endpoints are:
- `GET /api/human-sources` — source catalog and import counts.
- `POST /api/human-sources` — import an authorized public-page capture or user-provided coupon.
- `GET /api/human-coupons` — search the human coupon library by text, sport, source and outcome.

Automated harvesting is disabled by default. Public visibility does not automatically grant permission for bulk collection. API-based or scheduled collection is enabled only after the source's terms, robots policy, API access and rate limits are verified. WIN does not log into private groups, bypass paywalls/CAPTCHAs, reuse session cookies, or collect private messages. If a platform restricts automation, D5 can still analyse public search results and manually captured public posts without pretending that a full archive was obtained.

Human-performance analysis must include the complete available record, losses, odds and timestamps. Follower counts, screenshots, selected wins and short streaks are not proof of skill. The system reports sample size, missing-history risk, ROI and market-relative performance only when the evidence supports them.
