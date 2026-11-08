# WIN GitHub free-quota operating policy

Status: **draft review only** — no Actions workflows changed or triggered.

## Goals and separation
- Keep `Amir-dev-stack/win-worker-engine` private and authoritative.
- Reduce unnecessary **private** GitHub Actions runtime by reviewing redundant event triggers, superseded runs, expensive matrix jobs, and safe path-filter candidates. Keep mandatory correctness/security checks intact.
- Run targeted and full tests locally in the isolated `WIN-Agent` clone when GitHub hosted runtime is unavailable; confirm actual results before reporting success.
- Respect GitHub REST API primary/secondary limits; use one shared coordinator, bounded polls, conditional requests/backoff, and deduplication.
- Distinguish Actions minutes, GitHub API rate, Codex quotas and OpenAI API costs: they are separate budgets.

## Public repository option (future; NOT created)
A separate public repo may host independently public/open-source libraries or synthetic fixtures. Never publish WIN private source, internal tests containing proprietary code, real odds/research datasets, secrets, full git history, or CI artifacts accidentally. No public workflow may check out the private WIN repository or consume private credentials to run disguised private CI. The owner must review the exact source/history/license/output inventory before any repository is created or made public. Public hosted runner availability is not unlimited API polling or artifact storage.

## Included audit
`node scripts/win-actions-quota-audit.mjs` statically reads files under `.github/workflows` and produces a bounded report describing possible redundant triggers, missing concurrency cancellation, path-filter opportunities and scheduled runs. This uses *heuristics*, not a full YAML parser. Treat results as review candidates, never as proof a workflow is redundant; manually inspect protections, conditions, branch filters and reusable workflows before editing.

`node --test scripts/win-actions-quota-audit.test.mjs` checks the audit's read-only and redaction behavior.

## Change protocol
1. Capture current workflow event/permissions/branch-protection behavior and quota evidence. Do not assume current monthly Actions minutes are available.
2. Propose minimal changes to non-essential duplicate or superseded jobs in a **draft PR**. Do not silently disable essential security checks.
3. Verify syntax and behavior locally before allowing a scheduled or paid CI run.
4. Stop on quota 403/429 responses, respect documented Retry-After/reset guidance, and do not rotate identities to evade limits.
5. No paid actions, upgrades, payment methods, auto-recharge, or production merges/deployments.
