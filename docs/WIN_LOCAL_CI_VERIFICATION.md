# WIN local verification (no GitHub-hosted Actions minutes)

Use this runner while GitHub-hosted Actions cannot start because the monthly included compute allowance has been exhausted. It runs existing WIN checks without changing production, secrets, billing, or GitHub repository settings.

## Requirements

- Node.js 22.12 or newer and npm on your computer.
- Dependencies previously installed in the WIN project directory with the existing lockfile (`npm ci --ignore-scripts --no-audit --no-fund` if needed). Installing packages requires internet access and is a separate, explicit action.
- PowerShell or any terminal, opened in the WIN repository root.

## Preview without running checks

```powershell
node .\scripts\win-verify-local.mjs --plan
```

This lists the intended commands without invoking npm, npx, or any tests. The optional `--plan --bundle` shows the esbuild command without downloading or executing it. This preview can run before project dependencies are installed.

## Commands

```powershell
node .\scripts\win-verify-local.mjs
```

That runs, in order: `npm test` (including quality gates), `npm run build` (including its architecture checks), and `node --check public/app.js`. The runner exits nonzero immediately upon a failed check.

Optionally run the last CI step too:

```powershell
node .\scripts\win-verify-local.mjs --bundle
```

`--bundle` runs pinned `esbuild@0.25.0` using `npx --yes` on all Netlify functions. It may download that package if it is not cached; it does not deploy. Bundle files go into the operating system's temporary directory, not the WIN working tree.

## Safety and limitations

- The runner does not push, merge, deploy, change secrets, or bypass the review process.
- It does not run `test:neon:integration`; that live integration test requires separately authorized infrastructure and configuration.
- A local pass is useful evidence but **does not replace required GitHub status checks** or authorization to merge protected branches.
- Record the Node version, date, commit SHA, and pass/fail output when reporting results. Do not claim success unless actually run.
- Keep the main WIN GitHub repository private and the paid Actions spending cap at $0.
