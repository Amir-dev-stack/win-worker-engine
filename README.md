# WIN Worker Engine

A private backend and operations console for the WIN sports-betting research workflow. This project does **not** place bets.

## What is implemented

- Separate OpenAI Responses API calls for independent specialist reports (separate requests and contexts).
- A second review/debate round with FOR, AGAINST and market-settlement reviewers.
- A Global Master decision gate: BET, WAIT or NO BET. Incomplete or weak evidence must not be promoted into a bet.
- Web-search-enabled research when enabled, with source links retained from model citations.
- Human tip imports with source URL, capture time and evidence text. The system does not bypass STS login or access controls.
- Append-only prediction and result records, so a recorded pre-match forecast is not silently rewritten after the event.
- REST endpoints and a stateless MCP endpoint for an assistant to start/read WIN runs.
- Netlify Blobs persistence in the EU Central region.

## Required Netlify environment variables

Set these in Netlify → win-worker-engine → Project configuration → Environment variables. Mark both secrets as secret and scope them to Functions and Runtime.

| Variable | Required | Purpose |
| --- | --- | --- |
| OPENAI_API_KEY | Yes | Your OpenAI API key. API usage is billed separately from a ChatGPT subscription. |
| OPENAI_MODEL | Yes | A model ID enabled for your OpenAI API account. |
| WIN_INTERNAL_TOKEN | Yes | Private bearer token for REST and MCP calls. Generate a strong random value; do not commit it or paste it into source code. |
| WIN_ENABLE_WEB_SEARCH | No | Set to true to allow the Responses API web-search tool; defaults to true. |

Never put these values in the browser bundle, GitHub, chat messages, or netlify.toml.

## Deploy

The project is configured for Git-based continuous deployment from the main branch:
- Build command: npm run build
- Publish directory: public
- Functions directory: netlify/functions

A push to main should create a Netlify deploy if Git continuous deployment is connected. After the first deploy, verify Functions and Data & Storage → Blobs in Netlify.

## API

All REST routes require Authorization: Bearer <WIN_INTERNAL_TOKEN>, except the health endpoint. MCP is POST /mcp with the same bearer token.

- GET /api/health
- GET|POST /api/runs
- GET /api/runs/:id
- GET|POST /api/tips
- GET /api/predictions
- POST /api/results

Starting a run queues a Netlify Background Function. Each specialist and each debate reviewer makes a separate Responses API request. The worker logs preserve status, model response ID, report text and extracted citations.

## Research integrity rules

1. Initial specialists receive the event brief independently; they do not see one another's conclusions before producing their first reports.
2. The debate round receives the initial reports and must challenge unsupported assumptions.
3. The Global Master may return WAIT or NO BET. It must not force a target combined price by adding weak legs.
4. Tipster statistics and copied-pick counts are treated as claims requiring provenance, not proof of predictive skill.
5. A source URL is not proof that a statement on that page was verified. Workers must record the evidence and limitations.
6. A prediction is frozen with its run and timestamp. Results are stored separately, with the settlement source.
7. No automated bet placement, deposits, account access, session-cookie handling or login bypass.

## Current limitations

- Strefa Inspiracji is **not automatically scraped**. Import public/authorized tip details using the UI/API, or include them in a run. Login-only material must be supplied by the account holder.
- Results are only as reliable as the independently supplied settlement evidence. Automated official score/market settlement verification is not yet wired in.
- The UI is an operations console, not a betting terminal.
- Netlify site access controls and API secrets must be configured before exposing the MCP endpoint to an external assistant.
- Netlify Blobs is object storage, not a relational/transactional database. This is a small single-operator MVP; migrate to managed Postgres before high-volume concurrent use.

## Local development

Requires Node.js 20.12.2+ and Netlify CLI.

    npm install
    netlify dev

Set local secrets in an untracked .env file or Netlify CLI environment; do not commit it.
