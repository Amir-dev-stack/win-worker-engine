# WIN Handover

Last updated: 2026-11-07 (UTC)

## Current remote state (verified)

- Active branch: `feat/neon-transactional-store-adapter`
- Draft pull request: [#16](https://github.com/Amir-dev-stack/win-worker-engine/pull/16) — opt-in Neon transactional store adapter.
- Current remote checkpoint: the commit containing this handover. Resolve its SHA with `git rev-parse HEAD` before continuing. The latest feature-code commit before handover maintenance, `b0d9cba1ab8b0c433c2b78e127e206834ed4e3ff`, fixes the local-runner cloud-artifact contract assertion.
- Default storage remains Netlify Blobs. Neon is selected only through `WIN_TRANSACTIONAL_STORE=neon`; missing credentials and connection errors fail closed.
- The OpenAI executor and local runner are disabled unless their separate owner-controlled enablement variables are exactly `"true"`. The runner additionally requires a token and allowlisted agent identity.
- Production storage, production migration, deployment, real data import, provider activation, spending, and automated betting remain disabled.

## Recent verification

- Runtime dependency manifests are pinned: `@modelcontextprotocol/sdk` 1.32.2, `@netlify/functions` 6.1.1 and `zod` 4.6.7. `package-lock.json` (lockfile v3) is committed for transitive reproducibility; it was generated and verified with Node 24.22.1 / npm 11.9.0 using `npm ci --ignore-scripts --no-audit --no-fund` (156 packages).
- The CI workflow and its source-level quality gate now require `npm ci --ignore-scripts --no-audit --no-fund`, preventing dependency drift and lifecycle-script execution during verification.
- Quality-gate summaries aggregate duplicate logical check names with fail-closed AND semantics, report separate `evaluations` and unique-check totals, and have a focused regression test registered in the build gate.
- Recent remote hardening also classifies non-JSON provider HTTP failures before body parsing, rejects credential-shaped odds-ledger identifiers, accepts only supported two-/three-letter OpenFootball competition prefixes, and bounds World Cup status sampling to 25 disclosed records. These source changes have focused regression coverage but await a complete-suite run.
- The storage-ownership contract now verifies that AI budget reservations use the configured shared store (including opt-in Neon) while OAuth stays isolated in its `win-oauth` namespace.
- The live Neon integration script now requires an explicit dedicated-test-branch confirmation and expected database name, rejects a URL matching `WIN_NEON_DATABASE_URL`, and checks `current_database()` before write-capable test steps.
- The read-only Blobs-to-Neon audit applies the same target identity guard and an explicit cap to both source and destination scans; it remains non-mutating and reports zero writes.
- Neon store pagination normalizes invalid page-size inputs to the bounded default (500), with adapter regression coverage.
- The build gate now requires the Neon adapter regression suite to remain present, in addition to the default test-glob execution.
- Independent-review identity is now guarded by a build-required contract: reviewer identity must come from the validated separate credential, never request-body actor or credential fields.
- The previous local status record reported **395 passing tests**, quality gates and build-component checks. Those local changes/results were not published and cannot be treated as current remote CI evidence.
- This branch has no verified current-head hosted test/build result in this handover.
- The repaired test now checks the literal `startsWith("win-blob://")` contract rather than an over-escaped regular expression. The runner still requires a verified cloud artifact location; local-file locations remain prohibited.

## Incomplete work and blockers

1. Run the complete WIN suite from a clean checkout using `npm ci --ignore-scripts --no-audit --no-fund`; the lockfile is committed, but the full suite is not yet verified at the current remote head.
2. Run the full test, quality, and build suite against the current branch head and record exact outputs.
3. Run the Neon integration test only against the dedicated test branch, with its explicit confirmation gate. Do not use production credentials or migrate records.
4. Before any real-data work, select and approve a licensed football source, record provenance and rights, and complete out-of-sample calibration/settlement validation.
5. Dashboard authentication and anonymous-health smoke tests remain unverified.

## Guardrails

- Never access payments, billing controls, cards, payment methods, or financial credentials.
- Do not purchase, enable paid services, increase quotas, unlock/recharge budgets, or place bets.
- Preserve the OpenAI monthly cap and the internal `$2.95` stop; do not unlock either.
- Do not merge draft PRs, deploy, perform a production cutover, or destructively migrate data without explicit owner authorization.
- Keep secrets out of Git, issues, logs, handovers, and reports.

## Next safe task

Establish a clean local checkout at the current branch head, run `npm ci --ignore-scripts --no-audit --no-fund`, then run the contract tests and complete suite locally. Commit only verified changes and update this handover with the exact result.
