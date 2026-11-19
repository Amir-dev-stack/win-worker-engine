# WIN automatic Codex model router — initial prototype

This is a **separate CLI task launcher**, not an in-chat Codex Desktop model switch. It selects a **requested candidate** model (not guaranteed available in the current account) for each new CLI task and uses the existing `codex login` authentication. No new API key and no paid account is created.

## Model specialty and credit-safety update (draft review only)

This revision extends the **existing** Codex coding router rather than creating a second one. It recognizes *authenticated, actually listed* Luna/Terra/Sol/Astra model IDs across versions and routes tasks at the next safe invocation. The user's picker showed GPT-5.6 Luna/Terra/Sol, GPT-6 Luna/Sol/Astra, GPT-6.1 Terra/Sol, GPT-6.2 Sol/Astra; menu labels alone do **not** establish CLI availability, per-model quota, API prices or subscription credits.

- **Simple / repetitive:** prefer verified Luna Low; otherwise Terra Low, then Sol Low if eligible. No architecture call.
- **Standard coding:** prefer verified Sol Medium; a suitable Terra Medium can substitute at pre-dispatch when Sol is absent.
- **Complex debugging:** Sol High preferred; only fall back to verified Astra High where justified.
- **QA read-only:** Sol Medium by default; `--review-after` now selects this cheaper QA role.
- **Explicit high-risk review:** the existing `review` category retains Astra High preference. Use deliberately, not on every commit.
- **Explicit architecture:** the new `architecture` category uses Astra High preference, **always read-only**. This should be used only for significant system design. Implementation later happens in a separate, task-scoped coding invocation.

The Windows launcher obtains the selection and reasoning effort from the JS router, and preserves read-only sandboxes for `qa`, `review`, and `architecture`. **No automatic replay of failed or partially writable tasks.** Selection from saved evidence is fail-closed on staleness; live model discovery also queries authenticated account rate limits. Model-family and version preferences are capability hypotheses rather than measured subscription credit rates; measure successful task outcomes per actual usage before claiming cost savings.

**Important scope:** This is a local Codex CLI router and an isolated draft code change. It does not alter Codex Cloud task scheduling, automate independent Cloudflare takeover, or directly dispatch while the PC is off. See separate cloud/backup design PR #67 and WIN inference failover PR #68.

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

Manually override task classification using `--category simple|standard|complex|review`. The router uses simple → Luna Low where verified (Terra Low fallback), standard → Sol Medium (Terra Medium fallback), complex → Sol High without automatic Astra escalation, ordinary QA → Sol Medium, and explicit high-risk review/architecture → Astra High (read-only). No infinite retries. Each model call is a new Codex CLI session; it does not change the model inside a running Codex Desktop chat.

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

## Windows PowerShell offline smoke verification — November 19, 2026

The **same** original PowerShell launcher now has an isolated Windows GitHub Actions workflow: `.github/workflows/win-codex-windows-offline-smoke.yml`. It runs on a GitHub-hosted `windows-latest` runner with repository read permission and **no Codex credentials, no model requests, no API keys, no coding-task execution**.

The workflow exercises:
- ordinary dry run without `-Run`;
- `-VerifyModelsOnly -VerifiedModels PATH` with an ephemeral, synthetic fresh model catalog;
- rejection of synthetic expired model evidence;
- correct output distinction: offline evidence verification **does not** establish live quota verification.

**Latest Windows workflow validation:** [run #44461376172](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44461376172) **SUCCESS** on commit `3f87dc37f7bb6a765a0e55b58abd1bb71b5b32f9`. The corresponding [Netlify/Node validation #44461382084](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44461382084) also **SUCCESS**. These tests do not prove that this owner's ChatGPT account is authenticated on Windows or that a model would execute; they only verify the native launcher paths in a sandboxed runner.

A safe, **non-executing live-account** preflight command on the owner's already signed-in Windows PC is:

```powershell
.\scripts\Start-WINAutoModels.ps1 -VerifyModelsOnly -UseLiveModels -Task 'Update README documentation'
```

Do not use `-Run` until account model availability, quota details and the authorized writable worktree have been independently checked. The cloud GitHub runner intentionally cannot pass that live check; do not upload personal auth tokens to GitHub to circumvent it.

## Controlled read-only execution smoke — November 19, 2026

After successful **owner-side** `-VerifyModelsOnly -UseLiveModels` verification, a bounded first real execution can use the *same* Windows launcher, with an explicit `-ReadOnlySmoke` switch. This switch forces `codex exec` to `--sandbox read-only`, requires `-Run -UseLiveModels`, forbids `-ReviewAfter`, and preserves ChatGPT-only authentication, quota preflight, git-root checks and the frozen PR #36 guard. There is no retry, deployment, file modification authority or API-key fallback.

```powershell
cd C:\Users\PC\source\WIN-AutoRouter
git pull --ff-only
.\scripts\Start-WINAutoModels.ps1 -Run -ReadOnlySmoke -UseLiveModels -Category simple -Task "Read README.md and report the first top-level heading. Do not modify any file, run installs, deploy, or access secrets."
```

The test makes **one real authenticated Codex model request**, which may use an allowance from the ChatGPT plan; it is *not* a no-model-call preflight and should not be run in untrusted environments. The owner must choose whether to run it locally. Record the command's exit/result and compare the git status before and after; `-ReadOnlySmoke` does not attest a successful model response until run on the owner's computer.

[Node CI #44462818828](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44462818828) and [Windows offline CI #44462812573](https://github.com/Amir-dev-stack/win-worker-engine/actions/runs/44462812573) both passed for code commit `82d5b5fb3c8557d2f73ac555a0b2a3d342419b39`. CI did **not** invoke a model.

## Official Codex Cloud path for PC-off coding — November 19, 2026

**Newly verified official capability, not yet activated in WIN.** OpenAI's Codex Cloud executes tasks on OpenAI-managed computers; a task in a published cloud environment can continue while the user's Windows PC is asleep/offline. On supported CLI installations, `codex cloud exec --env ENV_ID "TASK"` submits a task using the existing ChatGPT CLI credentials. The `--env` value is a real Codex Cloud environment ID, **not** a GitHub Actions runner, Git branch, or invented environment.

References:
- https://help.openai.com/en/articles/20001545-using-codex-cloud
- https://learn.chatgpt.com/docs/developer-commands (section `codex cloud`)
- https://learn.chatgpt.com/docs/environments/cloud-environments

**Owner-side read-only discovery (do not commit login tokens):**

The checked-in `scripts/Test-WINCodexCloud.ps1` runs `codex.cmd cloud list --limit 1 --json`, checks that a valid ChatGPT CLI login exists, then prints **only** endpoint availability—not any private cloud task content. From the updated local repo run:

```powershell
.\\scripts\\Test-WINCodexCloud.ps1
```

This is a non-generative check and does **not** verify that a published environment exists. On an account without cloud access, it fails without creating tasks.

For direct manual inspection, the official commands are:

```powershell
cd C:\Users\PC\source\WIN-AutoRouter
codex.cmd cloud --help
codex.cmd cloud list --limit 1 --json
```

The first command describes CLI support; the second **lists** at most one recent cloud task but neither executes nor creates one. A successful list call establishes access to the list endpoint, **not necessarily an available published environment**. The JSON may include private task titles and summaries: don't publish raw output to PRs or CI logs. To find/select an available cloud environment, open `codex.cmd cloud` interactively or use Codex Cloud on the web with the same ChatGPT account. Create and publish an environment connected to the WIN GitHub repository if the account's plan and permissions allow it.

**Future submission (do not run until the environment is verified):** `codex.cmd cloud exec --env REAL_ENV_ID --attempts 1 "Review the WIN router read-only; do not merge, deploy or access secrets."` This is a **real model task** and uses the user's permitted Codex plan usage. Review the cloud task and results before applying any diff; do not assume every CLI model/fallback option is honored by Codex Cloud. No unsupported model-ID flags, billing fallback, or implicit environment choice.

**Security and architecture boundaries:** no personal `auth.json`, access tokens, refresh tokens, GitHub CI secret copies, API keys, billing changes, or unattended GitHub runner Codex execution. Publishing the environment and invoking a cloud task require authenticated owner actions. The current router's local Terra/Sol/Astra choices are already live-tested for a simple task; the cloud execution backend and its model/effort controls are **not yet live-tested**. The router must not silently conflate the two backends. GitHub Actions can continue non-generative monitoring while the PC is off.

## Confirmed CLI/new Codex Cloud environment mismatch — November 19, 2026

**Do not search for or guess a CLI-compatible environment ID from the attached runtime.** The owner verified a browser Codex Cloud read-only task in `/workspace/win-worker-engine`, but their Windows CLI v0.170.0 lists `{"tasks":[],"cursor":null}` and offers only `All Environments (Global)` in `codex cloud`. The attached runtime reported a `ccarenv_b64_...` identifier, explicitly **not** established as a Cloud Tasks environment ID or selector.

OpenAI's public tracker documents the same cross-client catalog mismatch:
- https://github.com/openai/codex/issues/50182 — new Codex Cloud environments visible/usable in the browser, but CLI environment discovery empty; CLI resolver rejects before selecting by name/ID.
- https://github.com/openai/codex/issues/58145 — CLI `/wham/environments` responds with `[]`, picker shows only Global, task listing empty.
- https://github.com/openai/codex/issues/56995 — even a stable current `asenvcfg_` environment configuration ID is *not* a reliable fix for the legacy `wham/tasks` submission path.
- https://github.com/openai/codex/issues/56350 — cloud model/effort overrides also must not be assumed to honor local router choices.

Therefore **PC-off browser Codex task execution is verified**; **automatic `codex cloud exec` dispatch is not**. The `scripts/Test-WINCodexCloud.ps1` probe proves task-list endpoint connectivity *only*, not environment availability or ability to submit tasks. Its previous success must not be read as authorization or readiness for cloud dispatch. Continue bounded, owner-approved tasks through supported Codex Cloud browser UI, without duplicating environments, exporting personal authentication, bypassing first-party private endpoints, or using separately billed OpenAI API credentials.

**Unblock condition:** a future supported Codex CLI release exposes the owner's current published WIN environment in the *CLI* environment picker; then obtain its CLI-recognized ID from the supported catalog and test a single explicit owner-approved read-only cloud task. Keep cloud-dispatch code disabled until then; the existing local Codex model router remains verified and functional.

## Standing owner instruction: resolve blockers, don't pivot

Read [WIN blocker-resolution policy](WIN_BLOCKER_RESOLUTION_POLICY.md) before abandoning any Codex CLI/cloud problem. The environment ID issue remains open until a supported CLI environment selection and owner-approved end-to-end dispatch have been verified. Continue safe root-cause investigation and document every blocker without circumventing security, spending or approval rules.
