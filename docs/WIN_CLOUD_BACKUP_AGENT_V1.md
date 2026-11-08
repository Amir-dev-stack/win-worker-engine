# WIN Independent Cloud Coding Backup — Draft Worker V1

Status: **implementation of a provider-neutral review worker core, NOT a deployed or connected cloud coding agent**.

## Owner goal

If Codex runs out of quota or an active task ends, WIN must preserve a durable checkpoint and allow a **separately authenticated, cloud-hosted backup agent** to resume authorized code review, debugging and eventually branch-scoped development even when the owner's PC is off.

### What now exists

- `scripts/win-development-failover-policy.mjs` from [draft PR #35](https://github.com/Amir-dev-stack/win-worker-engine/pull/35): explicit approval + lease-expiration failover proposal.
- `scripts/win-cloud-backup-review-worker.mjs`: guards the backup against taking Codex's active lease, limits task scope and input/output bytes, validates permitted paths, enforces declared zero-cost read-only provider mode, and returns an **unverified proposal** only.
- `scripts/win-cloud-backup-review-worker.test.mjs`: synthetic fixture tests for healthy primary, local-offline separation, scope, output size, paid-provider fallback, failure handling, and pure review proposal.
- Existing GitHub coordination issue #20, PR checkpoint design, and existing Neon `win-memory` resource available to investigate. These do **not** yet implement a trusted cloud task queue or atomic failover.
- Existing Netlify WIN site available. No change to its production deployment or secrets was made.

### What is still required before this becomes an operational agent

1. **Choose a legitimately free cloud inference and execution provider** with explicit monthly limits and no risk of an unapproved charge. An OpenCode/Ollama model on Windows cannot serve requests while that PC is powered off. Do not assume OpenAI/ChatGPT subscription includes free API inference. Do not automatically choose metered models or add a payment method.
2. **Deploy an isolated trusted cloud runner** (not on the existing WIN production deployment by default) using a verified cloud provider free quota. A Netlify scheduled function can run on the free plan but is limited to 30 seconds, so it is suitable for *bounded supervision*, not an always-running coding agent or long builds. Netlify background functions can execute for up to 15 minutes but still need bounded invocations and provider/quotas. Scheduled functions only run on published deploys.
3. **Bind worker identity and task ownership cryptographically**, never trust `actorId` supplied in JSON, issue body, or an agent's self-report. Implement atomic lease/nonce approval replay protection in a trusted durable store (proposed Neon) and prevent overlapping writers.
4. **Fetch source from verified private GitHub refs** with least privilege; never accept untrusted issue-comment bytes as executable commands. Require a cloud-side source snapshot at an exact commit SHA, safely filter paths, avoid secrets, and provide an isolated checkout if and only if code writing is separately approved.
5. **Connect real model inference adapter** with timeouts, input/output caps, explicit zero-cost proof, no tool permissions, a kill switch and redacted audit logs. The current `adapter.providerCostUsd === 0` field is a caller-supplied declaration, not an enforceable billing guarantee. The hosted runner must verify the account/provider billing limits independently.
6. **Connect GitHub handover and reporting**; publish draft patch/review proposals with independent verification and owner-readable progress. Never auto-merge/deploy. Secure backup checkpoints for uncommitted work using approved, secret-filtered workflow—not a blind `git add -A`.
7. **Test end-to-end with a synthetic assignment:** primary heartbeat expires, lease is atomically reclaimed, backup resumes from the correct checkpoint, reports findings, and Codex can safely return without conflicting edits. Then test with the owner's PC off.

### Critical limitations of current prototype

- It has **no cloud deployment, model credentials, long-running job scheduler, live GitHub reading, or Neon lease mutation**. It does not run while Codex stops; calling a JavaScript module locally does not create a cloud agent.
- The pure worker accepts an injected adapter and a caller-asserted `handoff`. Those fields must be verified by trusted cloud services before this module can be exposed. Never directly expose it as an unauthenticated Netlify API endpoint.
- Until the independent backup is deployed and tested, **Codex is not yet backed up by a running cloud developer**. OpenCode + Ollama remains a local fallback only while the PC is on.

### How to verify draft code locally

Run from a **clean isolated checkout of the exact feature branch**, not the user's modified WIN checkout:

```powershell
node --test scripts/win-development-failover-policy.test.mjs scripts/win-cloud-backup-review-worker.test.mjs
node --experimental-strip-types --test scripts/*.test.mjs
node scripts/quality-gates.mjs
node scripts/build.mjs
```

Report exact output, PR head SHA, branch and whether any existing tests changed. No merge, production deploy, credentials, billing, new provider account or database migration without separate approval.

### Safe cloud platform constraints

- Netlify scheduled functions: https://docs.netlify.com/build/functions/scheduled-functions/
- Netlify background functions: https://docs.netlify.com/build/functions/background-functions/
- GitHub Actions private repo usage: https://docs.github.com/en/actions/concepts/billing-and-usage

Use the existing infrastructure when it is economically and operationally sound, but **do not claim that free-tier limits guarantee indefinite 24/7 coding**.

Related: issue #20, draft PR #35.
