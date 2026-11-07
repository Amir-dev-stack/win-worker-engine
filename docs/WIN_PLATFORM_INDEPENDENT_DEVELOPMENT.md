# WIN platform-independent development and Netlify-last delivery plan

## Decision

Build and verify WIN's domain logic independently of Netlify wherever practical. Treat Netlify as a deployment/runtime adapter and integrate it after the core application, contracts, data pipelines, and tests are stable.

This is a sequencing decision, not a promise that every feature can run without a host. Scheduled execution, durable object storage, environment configuration, HTTP routing, and deployment still need a production platform adapter and platform-specific verification.

## Boundaries

### Core domain (host-independent)

Keep these concerns free of Netlify SDK imports and Netlify event/request types:
- sports, competitions, fixtures, event identity, markets and settlement semantics;
- source adapters and normalized evidence contracts;
- feature engineering, point-in-time rules, dataset manifests and provenance;
- model training/evaluation contracts and deterministic research algorithms;
- coupon selection/risk rules and explanation/evidence records;
- LLM provider-neutral contracts, policy decisions, budgets and task orchestration;
- agent/task state machines, retry/idempotency rules and audit event schemas.

Prefer pure TypeScript modules with explicit inputs/outputs. Use dependency injection for clocks, IDs, persistence, logging, provider calls and schedulers.

### Ports (stable interfaces)

Define narrow interfaces for TaskStore, DatasetStore, ArtifactStore, EvidenceStore, Clock, IdGenerator, Logger, SportsDataProvider, LLMProvider, Scheduler, SecretProvider and ConfigurationProvider.

Domain code must not read process.env, access Netlify Blobs, or call network/provider APIs directly. Those are adapter responsibilities.

### Adapters (replaceable infrastructure)

Keep platform-specific code in clearly named adapter modules:
- Netlify Functions request/response adapters;
- Netlify Blobs persistence adapter;
- Netlify scheduled-function adapter;
- Netlify environment/configuration adapter;
- Netlify deployment/build configuration.

Adapters translate platform events into domain commands and map domain results back to HTTP responses. They must not duplicate business rules.

## Development sequence

1. Inventory and baseline: map Netlify imports, runtime assumptions, routes, scheduled jobs, storage access, secrets, and current tests. Record which modules are already host-independent.
2. Extract domain contracts: identify high-value shared contracts and move only safe, well-tested logic behind stable interfaces. Avoid a large rewrite.
3. Local test harness: add deterministic in-memory adapters for tests; fake clock, IDs, storage, provider and scheduler. Tests must not need Netlify credentials or deploys.
4. Core feature completion: build sports data normalization, event/market evidence, risk logic, autonomous agent orchestration, LLM governance and ML research workflows against the ports.
5. Contract and integration tests: test domain behavior and adapter contract compatibility locally. Include failure injection, retries, idempotency, stale leases, timezone/settlement edge cases and data leakage checks.
6. Netlify adapter verification: test each adapter against the actual Netlify runtime/API contract, using non-production contexts and no production data writes.
7. Preview deployment: deploy a non-production preview only after the local gates are green and required credentials/configuration are explicitly approved.
8. Production release: separate explicit approval, reviewed migration/rollback plan, security review, observability checks and staged release.

## Required safeguards

- Production remains read-only during development.
- No live sports-data import, paid AI-provider call, paid infrastructure change, model promotion, automated betting, or production deploy without separate explicit approval.
- Do not put secrets in source, tests, logs, fixtures, issues or commits.
- Local tests use synthetic or appropriately licensed fixtures only; never label synthetic data as real.
- A successful local test is not evidence that Netlify deployment or production behavior works.
- A successful preview deploy is not production approval.
- Do not claim CI passed unless a real CI run for the exact commit is visible and successful.

## Definition of Netlify last

Before Netlify integration begins, the core should have stable versioned domain contracts, host-independent domain modules for the highest-value workflows, a deterministic local test harness and passing test suite, explicit adapter interfaces and contract tests, documented environment variables and secret ownership, and no hidden Netlify dependency in domain modules.

Netlify integration is complete only after adapter tests and a non-production preview verify routing, storage consistency, scheduled execution, environment configuration, logs and failure behavior.

## Current known constraints

WIN currently contains substantial Netlify Functions and Netlify Blobs integration. Some execution gates intentionally read protected Netlify environment configuration. Therefore, Netlify last means progressively isolating those dependencies and postponing deployment/runtime troubleshooting; it does not mean deleting Netlify code or pretending platform-specific behavior can be fully tested offline.

The existing production site must remain untouched during this work.