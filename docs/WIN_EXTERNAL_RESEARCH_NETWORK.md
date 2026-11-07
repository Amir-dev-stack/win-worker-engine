# WIN External Research & Experiment Network

## Purpose

WIN may use a governed network of OpenAI-powered research agents as an external R&D team. These agents receive bounded assignments, research independently, run reproducible experiments in isolated workspaces, challenge each other's conclusions, and submit evidence-backed recommendations to WIN.

This network is an R&D contributor, not a second production brain. It does not directly change trusted WIN rules, production code, model weights, strategy status, or coupon decisions.

## Operating model

1. **WIN Research Director** creates an assignment from an identified engineering, data, modelling, sports-coverage or learning gap.
2. **Assignment agents** investigate different approaches independently and cite primary sources, datasets, assumptions and limitations.
3. **Experiment agents** receive approved public or synthetic datasets in an isolated workspace and run reproducible code, tests or simulations.
4. **Challenge agents** attempt to falsify the findings, check leakage, selection bias, timestamp validity, settlement assumptions and reproducibility.
5. **Synthesis agent** compares results and creates a structured recommendation with cost, benefit, confidence and implementation plan.
6. **WIN intake gate** stores the submission as an untrusted research artifact. It does not merge code or promote a model.
7. **Human owner approval** is required before any proposal changes production code, trusted knowledge, model promotion, spend limits, credentials, or live operating policy.

OpenAI's TypeScript Agents SDK supports tool use, multi-agent handoffs, sessions, guardrails and tracing. Sandbox agents can work with files, shell commands, packages and resumable isolated workspaces. Use the existing SDK integration and add sandbox execution only when a task genuinely needs code/filesystem access. See the official guides: Agents SDK, sandbox agents, orchestration, guardrails and tracing.

## Research divisions

| Division | Assignment examples | Required deliverables |
| --- | --- | --- |
| R1 Sports & competition research | Identify useful sports/league/market coverage; document rules and settlement edge cases | Source map, coverage matrix, verified rules, unresolved gaps |
| R2 Data engineering | Compare free/open historical fixtures, results, odds and injury sources | Provider comparison, licensing/terms notes, sample files, schema and ingestion test |
| R3 Quantitative research | Develop baseline probability models and falsifiable market hypotheses | Reproducible notebook/script, chronological splits, baselines, Brier/log loss, calibration |
| R4 Odds & market microstructure | Study timestamped prices, closing lines, market movement and price quality | Quote-normalization tests, CLV analysis, missingness and staleness report |
| R5 Coupon and portfolio research | Study accumulator joint probability, correlation, leg count and market dependence | Mathematical derivation, simulation, independent-event assumptions and counterexamples |
| R6 ML engineering | Compare logistic regression, calibrated tree models and suitable sport-specific models | Training code, leakage checks, feature definitions, calibration and model card |
| R7 Reliability & security | Audit task retries, budget reservation, provider fallback, storage and secrets | Threat model, failure-injection tests, operational recommendations |
| R8 Red Team / independent review | Reproduce or disprove another team's result | Independent reproduction, objections, severity-ranked issues |

## Assignment lifecycle

Every assignment must have:
- stable assignment ID, owner, division and due/stop condition;
- a falsifiable question and explicit success/failure criteria;
- approved source/data scope, date range and data-use restrictions;
- a cost ceiling and maximum model turns/tool calls;
- isolated workspace identifier and read/write permissions;
- expected artifact list and reproducibility command;
- independent reviewer assignment;
- status: proposed, approved, running, submitted, challenged, accepted, rejected, or superseded.

No agent can expand its own budget, grant itself credentials, change its assignment scope, or approve its own submission.

## Practice and experimentation

Agents should do real work, not merely describe hypothetical improvements. Examples:
- Implement a baseline logistic model on a supplied, time-ordered football dataset and compare it with a simple market-implied baseline.
- Build a timestamp validator that rejects odds captured after kickoff and prove it with negative tests.
- Run walk-forward evaluation with chronological training/validation/holdout periods; report Brier score, log loss, calibration, sample size and confidence intervals.
- Test whether a proposed feature leaks post-event information.
- Simulate accumulator probabilities under independent and correlated outcomes, and compare naive multiplication with joint estimates.
- Build a provider adapter against a small public sample and test schema drift, duplicate events, missing timestamps and settlement mapping.
- Inject timeout, partial response, duplicate task and uncertain billing outcomes into the execution/budget layer and verify fail-closed recovery.

Use public, licensed, owner-provided or synthetic data only. Never fabricate observations, odds, injuries, lineups or settled results. Never use future information in pre-match features. Keep synthetic and simulated records separate from real historical and prospective records.

## Evaluation standard

A research result is not accepted because an agent sounds confident or multiple agents agree. Acceptance requires:
- source provenance and data-use rights;
- reproducible code and exact commands;
- pinned dataset version/hash and time cut-off;
- chronological evaluation with no leakage;
- comparison against simple baselines;
- sample size, uncertainty and missing-data disclosure;
- independent reproduction or challenge;
- known failure cases and limitations;
- expected operating cost and maintenance burden.

For sports probabilities, LLMs may extract and structure qualitative evidence; they do not invent calibrated probabilities. Probabilities must come from validated statistical models or transparent market-derived baselines. Track Brier score, log loss, calibration and closing-line value where appropriate. Historical results do not establish future profitability; prospective frozen paper tracking is required.

## Knowledge sharing with WIN

Submissions are stored in a separate research inbox, for example `library/research-submissions`, with:
- assignment and agent IDs;
- source citations and retrieval timestamps;
- dataset IDs/hashes and data-use notes;
- artifact manifest and reproducibility instructions;
- experiment results and baseline comparisons;
- challenge report and unresolved objections;
- recommendation, estimated cost and confidence;
- explicit disposition and human reviewer.

Only accepted findings are distilled into the WIN Knowledge Library. Keep original submission immutable. Store accepted knowledge with provenance, version, reviewer, validation status and expiry/recheck date. A research note is not automatically a validated lesson or a production rule.

## Safe code workflow

- Research agents get read-only access to WIN source by default.
- Experiment agents write only to an isolated branch/workspace, never directly to main or production.
- Any proposed patch is a small pull request with tests and a change summary.
- Run static checks, unit tests, integration tests with mocked providers, dependency/security checks and reproducibility checks.
- Never expose `OPENAI_API_KEY`, `WIN_INTERNAL_TOKEN`, database URLs or other secrets to sandbox agents.
- Restrict outbound network access to approved sources and APIs; do not provide production credentials.
- No production deploy, schema migration, budget unlock, auto-recharge, model promotion or betting action is available to research agents.

## Cost-aware operation for the initial USD 5 API purchase

The owner-reported USD 5 purchase is not a verified remaining balance and is not permission to spend it. Preserve the current WIN $2.95 application stop and owner lock. Do not run a large agent network continuously.

Initial rollout:
1. Build assignment definitions, storage schemas and evaluators without model calls.
2. Run deterministic local tests and public-data experiments where possible.
3. Use one bounded OpenAI research assignment, then one independent challenge.
4. Record actual SDK token usage and total cost for the complete assignment.
5. Estimate cost per accepted research artifact before deciding whether to scale.
6. Keep recurring research disabled until the owner explicitly approves a schedule and budget.

Do not confuse OpenAI API credits with unlimited execution, and do not treat an application-side estimated ledger as a provider-enforced billing cap.

## Initial pilot assignments

1. **Football timestamped odds pipeline audit:** find a free, legally usable source/sample; define canonical event/market/selection schema; implement timestamp and kickoff validation; provide tests and data gaps.
2. **Walk-forward evaluation harness:** verify chronological 60/20/20 split, leakage controls, Brier/log loss, calibration bins and baseline comparison on a small fixture dataset.
3. **Accumulator mathematics audit:** derive joint probability and correlation requirements; write reproducible simulation tests for independent and correlated legs.
4. **Provider and budget failure drill:** test timeout, duplicate task, partial output and unknown billing settlement; verify no unsafe retry or spend unlock.

The pilot is complete only when artifacts can be reproduced and independently challenged. Its output is a prioritized engineering backlog, not an automatic production change.
