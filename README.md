# WIN Worker Engine

A private backend and operations console for the WIN sports-betting research workflow. This project does **not** place bets.

## On-demand workflow

WIN runs when a user asks for research or starts a run from the dashboard. It has no scheduled odds polling and no unattended betting activity.

1. ChatGPT calls the connected WIN MCP server (after the user authorizes the connection).
2. WIN creates a research run and queues the background worker.
3. Eight specialist Responses API requests run independently from the original brief.
4. Four adversarial reviewers challenge the initial reports.
5. The Global Master creates the final BET / WAIT / NO BET decision. Failed or incomplete worker checks must result in NO BET.
6. The dashboard and MCP tools expose the run status, reports, citations and frozen forecast record.

A queued run is not a completed run. Clients must read the run again until it reaches a terminal status and then inspect the actual reports.

## What is implemented

- Separate OpenAI Responses API calls for independent specialist reports (separate requests and contexts).
- A second review/debate round with FOR, AGAINST and market-settlement reviewers.
- A Global Master decision gate: BET, WAIT or NO BET. Incomplete or weak evidence must not be promoted into a bet.
- Web-search-enabled research when configured, with source links retained from model citations.
- Human tip imports with source URL, capture time and evidence text. The system does not bypass STS login or access controls.
- Frozen prediction records and separate result records.
- REST endpoints and a Streamable HTTP MCP endpoint for a connected assistant to start/read WIN runs.
- Netlify Blobs persistence.

## ChatGPT ↔ WIN connection

The MCP server is served at:

`https://win-worker-engine.netlify.app/mcp`

It uses OAuth authorization-code flow with PKCE, dynamic client registration, a private WIN-owner consent page, short-lived access tokens and rotating refresh tokens. The owner authorizes with the WIN internal token on the WIN domain; the token is not bundled inside the ChatGPT plugin.

OAuth discovery:
- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`
- `/oauth/register`
- `/oauth/authorize`
- `/oauth/token`

MCP tools:
- `start_research_run`
- `get_run`
- `list_runs`
- `list_human_tips`
- `list_predictions`

The tool definitions require OAuth scopes. `win:research` starts a new run; `win:read` reads stored research. The internal service token remains on the Netlify backend.

## Required Netlify environment variables

Set these in Netlify → win-worker-engine → Project configuration → Environment variables. Mark both secrets as secret and scope them to Functions and Runtime.

| Variable | Required | Purpose |
| --- | --- | --- |
| OPENAI_API_KEY | Yes | Your OpenAI API key. API usage is billed separately from a ChatGPT subscription. |
| OPENAI_MODEL | Yes | A model ID enabled for your OpenAI API account. |
| WIN_INTERNAL_TOKEN | Yes | Private bearer token for REST and dashboard calls. Keep it secret. |
| WIN_ENABLE_WEB_SEARCH | No | Set to true to allow the Responses API web-search tool; defaults to true. |

Never put these values in the browser bundle, GitHub, chat messages, or netlify.toml.

## API

All REST routes require `Authorization: Bearer <WIN_INTERNAL_TOKEN>`, except the health endpoint. The MCP endpoint uses OAuth for ChatGPT and also supports the private internal bearer token for the owner’s own testing.

- GET /api/health
- GET|POST /api/runs
- GET /api/runs/:id
- GET|POST /api/tips
- GET /api/predictions
- POST /api/results
- POST /mcp (OAuth-protected MCP Streamable HTTP)

## STS data access boundary

There is no official STS API integration or private STS-account connection in this project. WIN must not bypass STS login, CAPTCHA, anti-bot checks, session protections or private account access. Current event research can use public web sources through the AI workers; exact STS prices and login-only Strefa Inspiracji material must be supplied by the account holder or connected later through a licensed and authorized feed. Third-party prices must never be presented as verified STS prices.

## Research integrity rules

1. Initial specialists receive the event brief independently; they do not see one another's conclusions before producing their first reports.
2. The debate round receives initial reports and must challenge unsupported assumptions.
3. The Global Master may return WAIT or NO BET. It must not force a target combined price by adding weak selections.
4. Tipster statistics and copied-pick counts are claims requiring provenance, not proof of predictive skill.
5. A source URL is not proof that a statement on that page was verified. Workers must record evidence and limitations.
6. A prediction is frozen with its run and timestamp. Results are stored separately, with the settlement source.
7. No automated bet placement, deposits, account access, session-cookie handling or login bypass.

## Current limitations

- Strefa Inspiracji is not automatically scraped. Import public/authorized tip details using the UI/API, or include them in a run. Login-only material must be supplied by the account holder.
- Results are only as reliable as the independently supplied settlement evidence. Automated official score/market settlement verification is not yet wired in.
- The UI is an operations console, not a betting terminal.
- Netlify Blobs is object storage, not a relational/transactional database. This is a small single-operator MVP; migrate to managed Postgres before high-volume concurrent use.
- The OAuth connection must be tested through the ChatGPT plugin connection flow before it can be described as fully linked.

## Deploy

The project is configured for Git-based continuous deployment from the main branch:
- Build command: npm run build
- Publish directory: public
- Functions directory: netlify/functions

A push to main should create a Netlify deploy if Git continuous deployment is connected.

## Local development

Requires Node.js 20.12.2+ and Netlify CLI.

    npm install
    netlify dev

Set local secrets in an untracked .env file or Netlify CLI environment; do not commit them.
