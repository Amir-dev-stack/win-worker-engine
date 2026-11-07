# WIN Handover

Last updated: 2026-11-07 (UTC)

## Current remote state (verified)

- Active branch: `feat/neon-transactional-store-adapter`
- Draft pull request: [#16](https://github.com/Amir-dev-stack/win-worker-engine/pull/16) — opt-in Neon transactional store adapter.
- Latest remote commit: `b0d9cba1ab8b0c433c2b78e127e206834ed4e3ff` — fixes the local-runner cloud-artifact contract assertion.
- Default storage remains Netlify Blobs. Neon is selected only through `WIN_TRANSACTIONAL_STORE=neon`; missing credentials and connection errors fail closed.
- The OpenAI executor and local runner are disabled unless their separate owner-controlled enablement variables are exactly `"true"`. The runner additionally requires a token and allowlisted agent identity.
- Production storage, production migration, deployment, real data import, provider activation, spending, and automated betting remain disabled.

## Recent verification

- The previous local status record reported **395 passing tests**, quality gates and build-component checks. Those local changes/results were not published and cannot be treated as current remote CI evidence.
- This branch has no verified current-head hosted test/build result in this handover.
- The repaired test now checks the literal `startsWith("win-blob://")` contract rather than an over-escaped regular expression. The runner still requires a verified cloud artifact location; local-file locations remain prohibited.

## Incomplete work and blockers

1. Generate and commit a reproducible dependency lockfile through a verified local install; do not claim `npm ci` support until then.
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

Establish a clean local checkout at the current branch head, create the lockfile without lifecycle scripts or secret access, then run the contract tests and complete suite locally. Commit only verified changes and update this handover with the exact result.
