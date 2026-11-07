# WIN OpenAI API credit activation plan

## Current owner-reported funding

The owner reports purchasing **USD 5.00 of OpenAI API credits** and has now explicitly authorized the WIN research agents to spend OpenAI API credits when their assigned research requires it. This authorization is for OpenAI model calls and OpenAI-hosted research tools only; it does not authorize other AI providers, external agent platforms or third-party tool integrations. The live remaining credit balance is still unverified.

## Existing safeguards to preserve

- The owner has authorized bounded OpenAI-only research spending. Before the first live run, verify the configured API key, provider balance and usage controls, then activate only the existing bounded WIN execution gate.
- Preserve the existing WIN application spending stop of **USD 2.95** against the current USD 3 reference cycle. Do not silently raise it to the full purchase amount.
- Preserve the persistent owner lock. Month rollover, a new task, a retry, a scheduled job, or an agent handoff must not unlock spending.
- Do not enable automatic recharge or purchase additional credits.
- Do not run a real model call from tests, CI, preview builds or unapproved scheduled jobs.
- Keep the API key in server-side Netlify runtime secrets only. Never place it in source, browser bundles, GitHub variables exposed to client builds, chat, logs or fixtures.

## Owner-side setup checklist

1. Open the OpenAI API billing/usage dashboard and confirm the actual remaining prepaid balance and project.
2. Confirm the API project has a provider-side spending limit no higher than the owner's chosen ceiling (the initial USD 5 purchase is an absolute funding boundary, not permission to spend it all).
3. Configure usage alerts and verify automatic recharge is disabled.
4. Create or rotate a dedicated API key for WIN; use least privilege available and restrict it to the intended project.
5. Add `OPENAI_API_KEY` and an approved, price-verified `OPENAI_MODEL` as server-side runtime secrets. Keep `WIN_AI_BUDGET_APPROVED` false during setup.
6. Review the model's current input/output pricing and any hosted web-search/tool charges. The in-app ledger is an estimate, not a provider-enforced hard billing limit.
7. Only after the owner has checked those controls, explicitly approve one bounded smoke test by setting `WIN_AI_BUDGET_APPROVED=true`. Re-lock immediately after the test if further work is not explicitly authorized.

## First live test: minimal and observable

The first test should be one short, non-sensitive, no-web-search request through the existing governed worker path. It must:

- reserve budget before the provider call;
- record task ID, agent ID, provider, model, request limits and reservation ID;
- use the configured output-token cap and timeout;
- record actual SDK-reported token usage and settle the reservation;
- preserve the reservation and lock spending if the outcome is uncertain;
- never automatically retry an uncertain provider request;
- verify that the dashboard and budget ledger show the same run and cost.

Do not start the full 13-pass research federation as the first test. A single successful smoke test proves only basic API connectivity and accounting; it does not prove the full research workflow, data quality, probability calibration or profitability.

## Rollout sequence after the smoke test

1. Enable one scouting/research pass with a strict prompt/output cap.
2. Validate evidence citations, model identity, token accounting and failure recovery.
3. Add one independent FOR/AGAINST review pair.
4. Expand to the full department workflow only after per-pass cost and total-run cost are measured.
5. Keep scheduled learning and broad multi-sport runs disabled until the measured cost fits the owner's remaining credit and spending approval.

## Explicit non-goals

This plan does not authorize spending, key creation, budget unlocking, auto-recharge, production deployment, automatic training, model promotion or bet placement. The owner remains the final authority for every spending decision and every BET / WAIT / NO BET decision.
