# WIN free coding-agent activation handoff

Status: **prepared / not activated**. Publishing these instructions does not start any agent. Each runtime must be explicitly installed or connected and its free quota verified.

## Queue and ownership

| Role | Candidate runtime | Task | Permitted output |
| --- | --- | --- | --- |
| Local CI maintainer | OpenCode, local or verified free-model provider | [#22](https://github.com/Amir-dev-stack/win-worker-engine/issues/22) | Isolated draft PR |
| Test coverage reviewer | Aider, local or verified free-model provider | [#23](https://github.com/Amir-dev-stack/win-worker-engine/issues/23) | Isolated draft PR |
| Security reviewer | Goose, read-only | [#24](https://github.com/Amir-dev-stack/win-worker-engine/issues/24) | Evidence-backed issue comment |
| Provider reliability reviewer | Cline / OpenCode, offline mock tests | [#25](https://github.com/Amir-dev-stack/win-worker-engine/issues/25) | Isolated draft PR |

## Activation checks

1. Confirm the runtime is installed on an authorized execution environment. Do not confuse a GitHub issue, an automation reminder, or an agent configuration file with a running worker.
2. Check the candidate model/provider pricing, rate limits, privacy and terms **at activation time**. Allow only confirmed $0 usage for these development tasks; no hidden fallback to paid APIs.
3. For hosted inference, obtain explicit approval before sending any private WIN source code to that third-party provider. If approval is absent, use local inference or no inference.
4. Use a separate checkout/worktree per writable agent. Restrict tokens to the least-privileged repository permissions actually required. Never include secrets in prompts, reports or logs.
5. Start in a bounded session: one issue at a time, with a finite instruction budget, timeout and retry limit; stop on quota exhaustion or repeated failures.
6. Permit branch commits and draft PRs only. No merges, releases, deployments, billing changes, branch-protection changes, secret access or production writes.
7. Check tests locally; never claim GitHub-hosted CI passed while its free allowance is exhausted. Submit evidence of commands, failures and skipped checks.
8. Independently review each result before integration. The project lead must explicitly approve promotion.

## No-paid-fallback rule

If every permitted free inference path is unavailable, the agent must **stop and report blocked**, not purchase credits, attach a billing method, change spend caps, or use an unapproved endpoint.

## Current limitation

GitHub-hosted Actions is blocked by exhausted included compute. GitHub Issues cannot execute agents by themselves; this document is an auditable activation checklist. Local PC software cannot be installed or launched from the ChatGPT GitHub connector. No external worker is claimed active.
