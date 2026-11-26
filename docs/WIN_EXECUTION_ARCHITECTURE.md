# WIN autonomous execution architecture (draft)

## Provider comparison

| Option | PC-off execution | Assignment/state access | Cost and security | Result |
| --- | --- | --- | --- | --- |
| Native Codex Cloud schedule | Yes in product, but the supported task-submit interface is not available in this managed session | Owner-authenticated session is not transferable; CLI listed zero tasks | No token sharing; dispatch remains unverified | Blocked here |
| Codex SDK / noninteractive CLI | Yes on a runner | Requires an API key or reusable OAuth credential | Credential and usage billing risk; not approved for this proof | Not selected |
| OpenAI Agents API | Yes | Requires API credentials and a billable API path | Conflicts with free-first/financial isolation unless separately authorized | Not selected |
| GitHub Actions | Yes, scheduled hosted runners | Built-in repository-scoped `GITHUB_TOKEN`; issue comments are readable | Public-repository free minutes; read-only permissions and concurrency groups are available | Best viable control plane |
| Cloudflare Workers / Durable Objects | Yes | Durable object can fence ownership | Free limits and deployment/auth setup are not verified in this session | Possible durable backend, not selected as first POC |
| Render free / Hugging Face Spaces | Usually, but sleep/quota behavior varies | No native GitHub issue fencing or agent auth | Provider limits and credentials remain unverified | Not selected |
| OpenCode + free models | Runner can be PC-off | Requires model/provider credentials and rate-limit handling | Free model availability is not durable or guaranteed | Backup executor only, not yet verified |
| Independent backup-agent auth (GitHub App/OIDC) | Yes for runner identity | Short-lived repository identity can fence control-plane work | OIDC does not grant model-provider access; a separate approved model credential is still required | Useful for control plane, not an executor credential |

## Selected architecture

Use GitHub Actions as the zero-cost scheduler/control plane:

1. A scheduled workflow reads issue #20 with the ephemeral repository `GITHUB_TOKEN`.
2. `concurrency` serializes the scheduled/manual runs.
3. The runner writes a bounded checkpoint artifact and rejects a conflicting owner/fence.
4. Tests run before any draft-only handoff.
5. A future executor may be plugged in behind the `dispatchStatus` boundary; this POC deliberately leaves it `not_configured`.

This avoids transferring owner authentication and works with the owner PC switched off. It does **not** yet prove independent model execution. A durable external store (for example the fenced file/SQL adapter in PR #118 or a reviewed PostgreSQL/Cloudflare Durable Object backend) is still required for cross-run state beyond artifacts.

## POC limits and verification status

- The runner is read-only against GitHub except for local artifact files.
- It does not create branches, PRs, provider calls, model calls, or paid operations.
- `executionEvidence` remains false until an independently authorized executor produces a task ID, logs, repository change and test results.
- No claim is made that the scheduled workflow has executed in GitHub Actions from this draft branch.
