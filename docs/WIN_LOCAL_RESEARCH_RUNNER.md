# WIN Local Research Runner

## What is implemented

- A token-authenticated Netlify endpoint at `/api/research-runner`.
- Owner-controlled enable flag and server-side agent identity allowlist.
- Claims only owner-approved assignments whose source scope contains explicit HTTPS URLs.
- Uses lease IDs for claim, submit and safe release.
- Local Ollama execution through its OpenAI-compatible localhost endpoint.
- Fetches only explicitly assigned HTTPS URLs; redirects are rejected, response size is bounded, and non-text sources are ignored.
- Produces a local JSON artifact with a SHA-256 digest and submits it to the untrusted research inbox.
- Independent review is still required before findings enter shared research memory.

## What is not implemented or active

- The endpoint is not live until this branch is deployed to Netlify. The user's Netlify deploys were previously paused due to deploy-credit limits; do not claim the endpoint is online.
- No local runner has been installed or started on the owner's PC by this repository change.
- This runner does not perform general web search. It reads only explicit HTTPS URLs in the approved assignment's `sourceScope`.
- No Cloudflare or Gemini calls are made by this runner.
- No OpenAI API calls are made by this runner.
- No automatic assignment creation, continuous scheduling, production writes, model promotion or bet execution occurs.

## Server-side Netlify environment

Set these only in Netlify's server-side environment settings after a deploy is available. Never commit secrets or paste them into chat.

- `WIN_RESEARCH_RUNNER_ENABLED=true`
- `WIN_RESEARCH_RUNNER_TOKEN=<random 32-byte-or-stronger secret>`
- `WIN_RESEARCH_RUNNER_AGENT_IDS=<comma-separated stable WIN agent IDs>`

The token must be copied securely to the local PC environment. It must not be placed in browser JavaScript or a public repository. Use a dedicated runner token, not the WIN internal admin token.

## Local PC prerequisites

1. Install Node.js 22.12 or newer.
2. Install Ollama from its official installer and start the local service.
3. Pull a small quantized model appropriate for the available RAM. Start with a 3B-class model and benchmark before trying larger models; AMD GPU acceleration depends on the installed driver/runtime and is not assumed.
4. Confirm the Ollama OpenAI-compatible endpoint responds at `http://127.0.0.1:11434/v1`.

## Local environment

Set these in the local terminal session. The runner token must match the server secret exactly.

- `WIN_RESEARCH_API_URL=https://win-worker-engine.netlify.app`
- `WIN_RESEARCH_RUNNER_TOKEN=<same dedicated runner secret>`
- `WIN_RESEARCH_RUNNER_AGENT_ID=<one ID in the server allowlist>`
- `WIN_OLLAMA_MODEL=<exact locally pulled model tag>`
- `WIN_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1`
- Optional: `WIN_LOCAL_RUNNER_MAX_TASKS=1` (default and recommended for the first pilot)
- Optional: `WIN_LOCAL_RUNNER_MAX_IDLE_POLLS=6`
- Optional: `WIN_RESEARCH_ARTIFACT_DIR=./win-research-artifacts`

Run from the repository root:

```bash
node scripts/win-local-agent-runner.mjs
```

The runner exits after its task limit or idle-poll limit. It never runs arbitrary shell commands from model output. If source retrieval or model output fails, it attempts to release the assignment lease back to the approved queue.

## Free cloud provider adapters

Provider adapter code exists for Cloudflare Workers AI and Gemini, but these providers are not connected to the local runner and are disabled unless all required flags and credentials are present.

Cloudflare requires:
- `WIN_ENABLE_CLOUDFLARE_FREE_PROVIDER=true`
- `WIN_CLOUDFLARE_WORKERS_FREE_PLAN_CONFIRMED=true` (owner must verify the account is actually on Workers Free)
- `WIN_CLOUDFLARE_FREE_MODEL_APPROVED=true` (verify the exact model is eligible for free use)
- `WIN_CLOUDFLARE_FREE_MODEL=<exact model ID>`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

Gemini requires:
- `WIN_ENABLE_GEMINI_FREE_PROVIDER=true`
- `WIN_GEMINI_FREE_TIER_CONFIRMED=true`
- `WIN_GEMINI_BILLING_DISABLED=true` (do not enable this unless the Google project has no paid billing attached)
- `WIN_GEMINI_FREE_MODEL_APPROVED=true`
- `WIN_GEMINI_FREE_MODEL=<exact model ID eligible for the free tier>`
- `GEMINI_API_KEY`

Gemini free-tier requests require explicit per-request permission for provider retention because Google's free-tier data may be used to improve its products. Send public, non-sensitive research only. If an account's free-tier or billing status is uncertain, leave the provider disabled.

Cloudflare's Free Workers plan enforces the documented daily free allocation by failing further requests after its limit; do not use a Workers Paid plan for this free-only adapter. Re-check official pricing before changing model eligibility. Neither cloud provider is an automatic fallback.

## Security and operational limits

- The local model endpoint is restricted to loopback; never expose port 11434 to the public internet.
- The runner API uses a separate high-entropy token and server-side agent allowlist.
- Assignments require owner approval and a valid lease.
- The local model receives only public-source text fetched from the assignment's explicit HTTPS URL scope.
- No credentials, private data, internal project secrets or betting-account data are sent to free cloud models.
- Local artifacts remain on the PC unless the owner deliberately copies them elsewhere.
- The current API stores the submission manifest and evidence; the local artifact file itself remains local.
- Keep first run to one task and inspect the report and artifact manually.
