# WIN automatic Codex model router — initial prototype

This is a **separate CLI task launcher**, not an in-chat Codex Desktop model switch. It chooses an available **requested** model for each new CLI task and uses the existing `codex login` authentication. No new API key and no paid account is created.

## Prerequisites
- Node.js 20+ and a working `codex` command on PATH. Check `codex --version` and `codex login status` in PowerShell before using.
- Open a clean **writable development worktree**, NEVER the frozen PR #36 checkout.
- Verify the model IDs in the account's supported model menu or `codex models`/CLI equivalent; a requested ID can be unavailable due to plan/capacity. The labels `gpt-6.1-terra`, `gpt-6.2-sol`, `gpt-6.2-astra` are candidate values and may require adaptation to the installed CLI. Do not hardcode a new account or billing route as a fallback.

## Usage (PowerShell from the selected WIN worktree)
Dry-run without launching Codex:

```powershell
node scripts/win-model-router.mjs --task "Implement a bounded worker service"
```

Run a single implementation task (selects Sol Medium for ordinary coding):

```powershell
node scripts/win-model-router.mjs --run --task "Implement a bounded worker service"
```

Ask for one **read-only Astra review** after successful implementation (explicit opt-in):

```powershell
node scripts/win-model-router.mjs --run --review-after --task "Implement and test the worker service"
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
