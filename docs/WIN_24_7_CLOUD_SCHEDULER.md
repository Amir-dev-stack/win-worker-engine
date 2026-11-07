# WIN 24/7 Cloud Scheduler (Free-First)

## Purpose

This is an optional Cloudflare Workers scheduler for lightweight uptime checks and a backup post-match result check. It does not run an AI model, create coupons, place bets, unlock spending, or change WIN records directly.

The existing Netlify schedule remains the primary scheduler. This Cloudflare Worker is a low-cost watchdog/failover path and is staged separately so it can be deployed without changing the WIN application.

## Schedule

| Cron (UTC) | Job | Behavior |
|---|---|---|
| `*/15 * * * *` | Health heartbeat | Authenticated GET to `/api/health`; read-only service and budget status |
| `53 */4 * * *` | Post-match failover | Authenticated POST to `/.netlify/functions/post-match-runner`; runs the existing no-AI result checker |

The primary Netlify post-match schedule runs at minute 23 every four hours. The Cloudflare backup runs at minute 53, leaving a 30-minute separation. The Netlify runner has its own atomic lease, so overlapping invocations are rejected safely.

## Security and cost controls

- Only HTTPS origins are accepted; paths, query strings, fragments and URL credentials are rejected.
- `WIN_INTERNAL_TOKEN` is a Cloudflare secret, never a checked-in variable.
- The public fetch handler returns 404 and exposes no scheduler controls.
- Each dispatch has a 10-second timeout and sends no request body.
- The worker does not retry failed requests. The next scheduled tick is the retry boundary.
- The result-check endpoint reports `aiCalls: 0`; this scheduler does not call OpenAI or any other model.
- No provider billing, AI approval, spend unlock, production deployment or database migration is performed by this code.

## Deployment (owner action required)

From this directory, after connecting the intended Cloudflare account:

```powershell
npx wrangler login
npx wrangler secret put WIN_INTERNAL_TOKEN
npx wrangler deploy
```

When prompted for the secret, enter the existing WIN internal token locally in the terminal. Do not paste it into ChatGPT, GitHub, this document, `wrangler.toml`, or a browser form.

The origin is currently configured as `https://win-worker-engine.netlify.app` in `wrangler.toml`. Change it only if the production origin changes.

## Verification boundary

- Worker logic and fake-fetch tests are staged in the repository.
- The test suite must pass in GitHub Actions before deployment.
- Cloudflare account connection, secret configuration, deployment, Cron Trigger activation and a live authenticated smoke test have not been performed.
- Netlify's current deployed main branch contains both target endpoints, but the new Cloudflare Worker is not live.
- This is not a guarantee of 24/7 application availability: it provides scheduled monitoring and a backup result-check trigger. Netlify and its storage remain dependencies.
