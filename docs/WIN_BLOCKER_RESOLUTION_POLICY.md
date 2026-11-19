# WIN standing rule: persist until blockers are resolved

Owner direction (2026-11-19): **Do not abandon an unresolved WIN problem, redirect to another project objective, or call a workaround a solution. Keep investigating and documenting until the root cause is identified and a supported fix is verified.**

## Required behavior

1. Keep an unresolved blocker on the active project tracker with a reproducible symptom, evidence, technical hypotheses, tests attempted and next investigation steps.
2. Investigate independently: read authoritative documentation and source code; check relevant public issue reports; compare actual CLI, cloud and repository versions; gather safe local/remote diagnostics; test one hypothesis at a time.
3. Prefer the supported, least-invasive fix. When a hypothesis fails, record why and test the next one rather than repeating unsuccessful steps or pivoting to unrelated features.
4. State clearly the difference between **root cause identified**, **workaround available**, **fix implemented**, and **end-to-end verified**. Never label an unverified guess as a solution.
5. If progress requires an unavailable tool, owner action, external provider fix or permission, explain that concrete blocker; prepare exact minimal next diagnostics; retain the issue for follow-up. Do not claim to work continuously in the background without a running authorized automation.
6. Respect all security, privacy, spending and approval boundaries: never extract authentication secrets, call unsupported private endpoints, auto-spend, create duplicate environments, or merge/deploy without authorization.

## Current priority: Codex Cloud CLI environment resolution

The owner's browser-based Codex Cloud WIN tasks succeed, and the local Windows Codex router has completed a real read-only model call. However, `codex cloud list --limit 10 --json` returns `{"tasks":[],"cursor":null}`, and the CLI environment picker contains only `All Environments (Global)`. The attached `ccarenv_b64_...` ID has **not** been verified as an identifier accepted by `codex cloud exec --env`.

**Open blocker:** find a documented supported way to resolve/select the existing WIN Cloud environment from the owner's installed CLI or desktop context, or confirm the exact upstream incompatibility and track an authoritative fix. Do not switch to unrelated WIN development as a substitute for this unresolved goal.

**Resolution gate:** a read-only CLI lookup recognizes the correct WIN Cloud environment followed, with owner approval, by a bounded live cloud dispatch that completes using the correct environment. Until then cloud auto-dispatch remains disabled.

This standing instruction applies to WIN Codex contributors, project coordination, and follow-up investigations. It does not supersede safety or authorization constraints.
