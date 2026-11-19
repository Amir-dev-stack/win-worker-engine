# WIN automatic Codex model router — initial prototype

This is a **separate CLI task launcher**, not an in-chat Codex Desktop model switch. It selects a **requested candidate** model (not guaranteed available in the current account) for each new CLI task and uses the existing `codex login` authentication. No new API key and no paid account is created.

## Prerequisites
- Node.js 20+ and a **ChatGPT-authenticated** `codex` command on PATH. API-key-based login is explicitly blocked for live tasks to prevent unapproved usage billing. Check `codex --version` and `codex login status` in PowerShell before using.
- Open a clean **writable development worktree**, NEVER the frozen PR #36 checkout.
- Verify the model IDs in the account's supported model menu or `codex models`/CLI equivalent; a requested ID can be unavailable due to plan/capacity. The labels `gpt-6.1-terra`, `gpt-6.2-sol`, `gpt-6.2-astra` are candidate values and may require adaptation to the installed CLI. Do not hardcode a new account or billing route as a fallback.

## Usage (PowerShell from the selected WIN worktree)
Dry-run without launching Codex:

```powershell
node scripts/win-model-router.mjs --task "Implement a bounded worker service"
```

Run a single implementation task (requires a recently validated model catalog):

```powershell
node scripts/win-model-router.mjs --run --verified-models .win-codex-models.json --task "Implement a bounded worker service"
```

Ask for one **read-only Astra review** after successful implementation (explicit opt-in):

```powershell
node scripts/win-model-router.mjs --run --verified-models .win-codex-models.json --review-after --task "Implement and test the worker service"
```

Manually override task classification using `--category simple|standard|complex|review`. The router uses simple → Terra Low, standard → Sol Medium, complex → Sol High, review → Astra High. No infinite retries. Each model call is a new Codex CLI session; it does not change the model inside a running Codex Desktop chat.

**Caveats:** `--review-after` checks only that the implementation Codex process exited successfully; it does **not** assert tests passed. Inspect test logs and diff before any merge or production deployment. The review sees the current worktree's uncommitted changes; committed diffs are not currently included. The router does not yet queue recurring work, manage credit balance, distinguish rate-limit errors for automatic fallback or guarantee actual savings. Usage limits may be shared across models. This prototype does not start the user’s VM or run WIN 24/7.

## Safety
- Dry-run unless `--run` is supplied.
- Git root check rejects the known frozen PR #36 worktree and subdirectories.
- The review is read-only; normal work uses workspace-write, preserving Codex permissions and approvals.
- Never pass credentials into `--task`; tasks may appear in process arguments.
- It does not change billing settings, authenticate with API keys, force deployments, buy credits or trigger wagers.

## Verification
```powershell
node --test scripts/win-model-router.test.mjs
```

## Windows launcher (added after prototype)

`scripts/Start-WINAutoModels.ps1` classifies tasks with the Node router and launches the existing Codex CLI from PowerShell. This avoids relying on Node to spawn npm's Windows .cmd shim. It still needs a valid Codex CLI login, an allowed writable Git worktree and model availability.

Clone **this router branch into a new folder** (do not overwrite frozen PR #36 or Codex's dirty PR #49 worktree):

```powershell
cd C:\Users\PC\source
gh repo clone Amir-dev-stack/win-worker-engine WIN-AutoRouter -- --branch feat/win-auto-model-router-20261118
cd WIN-AutoRouter
node --test scripts/win-model-router.test.mjs
.\scripts\Start-WINAutoModels.ps1 -Task 'Implement a bounded WIN worker service'
```

The last command is only a dry-run. It should print the automatically selected model **without consuming Codex usage**. For a real scoped task, first switch to an **authorized clean writable WIN worktree** (the launcher now uses your current directory by default):

```powershell
.\scripts\Start-WINAutoModels.ps1 -Run -VerifiedModels '.win-codex-models.json' -Task 'Implement and test a bounded worker service'
```

Add `-ReviewAfter` **only for completed milestones**; it initiates one read-only Astra review after the coding Codex process exits successfully. For complex troubleshooting, omit the costly review until needed. Use `-Worktree 'C:\path\to\your\safe\worktree'` to explicitly select another authorized Git root. The old PR #49 default was removed; PR #36 remains protected. `-Category` overrides the automatic classifier when necessary.

**Known activation limitations**: Windows Codex Desktop app login and CLI login are not necessarily identical. The actual installed `codex --version`, `codex exec --help` and account-supported model identifiers must be checked on the user's PC. This assistant cannot run commands on the user's PC. The router does not auto-switch the in-progress Desktop model or bypass model limits. No unattended indefinite execution is implemented; each invocation handles one bounded task.

## Repaired branch validation (November 18, 2026)

The Windows launcher now defaults to the current Git worktree and derives read-only review model selection from the single JavaScript `MODEL_PLAN`; the previously hard-coded PR #49 path and separate review model were removed. Two test dependencies missing on this older feature branch (`netlify/lib/llm-contract.mts` and `netlify/lib/ml-football-season-coverage.mts`) were restored unchanged from `main` to allow complete CI validation. **Do not claim CI passed until a run for the latest commit reports success.** This remains a local authenticated Codex CLI launcher, not unattended Codex Cloud dispatch or verified model-limit failover.

## Model validation and safe fallback — current original router

`--run` and `--verify-only` now **require** `--verified-models PATH` (the PowerShell wrapper uses `-VerifiedModels PATH`). A human-approved, recently refreshed, local JSON record is required; **the router cannot yet query the signed-in account automatically**. See `scripts/win-codex-models.example.json` for the structure. It is intentionally expired and all models disabled, so copying it directly cannot dispatch anything. Never commit your real local approval file, credentials, usage identifiers or account data. Ideally save it outside the public repository.

The trusted source for available model IDs is the **authenticated Codex App Server `model/list` response** (not the bundled model list or a guess). It supports `id`, `supportedReasoningEfforts`, hidden visibility, and pagination. Reference: https://learn.chatgpt.com/docs/app-server#list-models-modellist . Inspect only models available to your signed-in account and approve which categories may use them. Mark `available:true` and `allowed:true` only after validation. Set `verifiedAt` and `expiresAt` as UTC ISO timestamps no more than 24 hours apart and never in the past. `source` must equal `codex-app-server:model/list`. Expired/invalid files block execution. If an approved model is temporarily limited, set an ISO `cooldownUntil` in the future. **Cooldown information is externally supplied; the router cannot currently detect account quotas or refresh them itself.**

Approved pre-dispatch routing:
- simple → Terra Low; if unavailable, Sol Low (both require explicit approval)
- standard → Sol Medium
- complex → Sol High
- review → Astra High; if unavailable, Sol High (review always read-only)

These are *requested Codex model IDs*, not guaranteed model entitlement or the same as the sports-agent Workers AI provider. `--verify-only` validates the proposed model without running Codex or changing files.

If Codex fails, times out, or starts but loses connectivity, the launcher **never automatically replays an implementation task on another model**; doing so could repeat side effects. It stops with an error and requires evidence-based recovery. Optional independent review eligibility is checked before coding starts, so missing review capacity does not cause a silently unreviewed write. Model switches happen only **before a new task**, not within an existing CLI session. No background agent, usage-limit reset listener, or guaranteed PC-off Codex execution is implemented.

### Security and verification clarification

The JavaScript router and PowerShell launcher both check `codex login status` for **ChatGPT authentication** before running an actual task. An API-key login or an unrecognized login mode stops the task. The owner-specific `.win-codex-models.json` file is ignored by Git and should stay local. The model file is a policy/availability attestation; it is **not an authenticated API session or proof that all models will remain available when dispatched**. Never automatically charge, upgrade or refresh paid credits. Also confirm `codex exec --help` and the locally installed CLI version before any live task.

## Authenticated live model discovery (preferred where supported)

On a machine already signed in to the **ChatGPT** Codex CLI, the *same existing router* can query Codex's App Server `model/list` interface and select a model from account-visible entries. The query performs no model generation, task execution, or billing change. The router excludes hidden and non-WIN-plan models and requires an available reasoning effort; unknown catalogs fail closed. The `model/list` protocol and its supported effort metadata are documented at https://learn.chatgpt.com/docs/app-server#list-models-modellist .

Check the selection without launching a coding task:

```powershell
node scripts/win-model-router.mjs --verify-only --live-models --task "Implement a bounded worker service"
```

Use the Windows launcher for a real task (the JavaScript direct process launcher may not handle the npm Windows CLI shim):

```powershell
.\scripts\Start-WINAutoModels.ps1 -Run -UseLiveModels -Task 'Implement and test a bounded WIN worker service'
```

Add `-ReviewAfter` only when an approved reviewer model is listed. The script checks that review model **before** implementation. `-VerifiedModels PATH` is an offline/manual alternative; do not use both together. This is still a *single task launcher*, not a persistent background dispatcher.

**Honest verification boundary:** the App Server discovery protocol is unit-tested using a simulated JSON-lines server; the integration has **not** been run against this owner's Windows Codex CLI, authenticated catalog or live model limits. Model availability varies by account and client version. If `--live-models` fails or returns no eligible model, stop instead of inventing entitlement, silently dropping the review, switching to API-key authentication, or bypassing the account's limit. Current Windows/Codex CLI runtime compatibility still needs live confirmation. A quota exhaustion **after a task starts** is not a safe signal to repeat it on another model because the first run may already have changed files.

## Automatic version selection and quota preflight — November 18, 2026

The original Terra/Sol/Astra task routing stays unchanged. When an exact candidate version is not available, the router checks **only the current authenticated model catalog** for another approved version in the *same* model family with the requested reasoning effort. Unknown model families, hidden models and unsupported efforts are excluded. This is a **pre-dispatch** model switch, not an attempt to change an active Codex session.

For `--live-models` / PowerShell `-UseLiveModels`, discovery now also reads `account/rateLimits/read` from the existing Codex App Server. All reported ChatGPT quota windows must be parseable and under 100% usage; a reached limit, missing usage data or failed rate-limit lookup blocks dispatch. No earned reset credit is consumed, and no paid credits are added. This global read-only check does not guarantee that every individual model has available capacity, nor does it automatically resume a task at the next reset. The model and quota responses are simulated in CI; **live account confirmation remains required**.

References:
- https://learn.chatgpt.com/docs/app-server#list-models-modellist
- https://learn.chatgpt.com/docs/app-server (account/rateLimits/read)

## Cloud-host readiness evidence — November 18, 2026

The original PR #51 contains an **isolated, non-executing** GitHub Actions workflow:
`.github/workflows/win-codex-host-readiness.yml`. It is branch-scoped and has only `contents: read`. The host installs pinned `codex-cli 0.167.0`, creates an intentionally empty `CODEX_HOME`, clears potentially inherited API-key environment variables, checks `codex login status` without displaying its output and **does not launch a model**.

[GitHub Actions run #44380091949](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44380091949) **PASSED**. Verified conclusion: an independent PC-off GitHub Actions runner exists and can install a Codex binary, but the isolated runner **does not have ChatGPT-authenticated Codex execution**. This does *not* prove Codex Cloud task submission, unrestricted model usage or credentials availability.

**IMPORTANT — public repository security:** OpenAI's official non-interactive mode guidance explicitly says **not to seed personal `~/.codex/auth.json` credentials into CI for public or open-source repositories**, even using the advanced ChatGPT-managed authentication pattern. WIN is public. Do **not** add this user's `auth.json`, access/refresh tokens, browser session cookies, device codes or personal credentials to GitHub Actions, repository secrets, issues or PRs. The official `openai/codex-action@v1` is an API-key path with usage-based billing and is also **not authorized** by the owner. Never fall back to it automatically.

References:
- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/github-action

The valid remaining routes require independently authorized infrastructure (for example a trusted private authenticated host with suitable access/entitlement, or an officially supported Codex Cloud task dispatch mechanism). Such a host or dispatcher has **not been verified or provisioned in this project**. Keep cloud agent task execution and paid-path triggers disabled until explicit security and budget approval. Current WIN GitHub Actions may still run non-generative tests and monitoring tasks with PC off.

## Safe account-only activation check — November 19, 2026

The original Windows launcher now supports a **read-only model-and-quota check** without running a Codex coding task, even while the real cloud dispatcher and Oracle hosting are unavailable:

```powershell
.\scripts\Start-WINAutoModels.ps1 -Task "Implement a bounded WIN worker service" -VerifyModelsOnly -UseLiveModels
```

Run this from the root of an authorized local WIN worktree with Node.js and a **ChatGPT-authenticated** Codex CLI. It prints the chosen eligible model and account preflight result, then exits **before `codex exec`**. The `-VerifyModelsOnly` switch cannot be combined with `-Run`. It does not start a coding task, require an Oracle account, transfer secrets to GitHub Actions, or attempt paid API fallback. If account discovery reports an unavailable model, expired quota or an unsupported Codex client, the check fails safely.

The Windows launcher also retains the **model and reasoning effort selected for an optional read-only review**. Before review, it revalidates eligibility; if the new selection differs from the original approved preflight, it stops instead of switching review models silently.

**Verification:** GitHub Actions [run #44460602618](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44460602618) passed **87/87 tests**. This is a mock/structural validation, not proof of execution on the owner's Windows PC.
