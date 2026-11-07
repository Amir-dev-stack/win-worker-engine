# WIN GitHub Actions runner blocker

## Observed state

The pull-request validation workflow is now consolidated into `.github/workflows/win-quality.yml`. The two older workflows remain available for pushes to `main` and manual dispatch, but no longer start duplicate pull-request jobs.

On 2026-11-07, the pull-request job for commit `bb7df28fea8b289af76535daf49c65eec5108096` failed in approximately two seconds. GitHub's Jobs API returned:

- job conclusion: `failure`
- `runner_id: 0`
- empty `runner_name`
- empty `steps` array
- no downloadable job log

The same no-runner/no-steps pattern occurred on the immediately preceding pull-request commits. This means the job did not reach checkout, Node setup, dependency installation, tests, or build. It is not evidence of a source-code test failure.

## What has been changed in the repository

- One full PR workflow now owns pull-request validation, reducing duplicate jobs.
- The authoritative workflow runs `npm test`, `npm run build`, `node --check public/app.js`, and an esbuild bundle of every Netlify function.
- Node 22 is used, repository permissions are read-only, and no deploy or paid provider calls are part of CI.

## External checks required

The repository files cannot fix a job that GitHub never assigns to a runner. A repository owner must inspect the GitHub Actions run/check annotation and account/repository settings:

1. GitHub account **Settings → Billing and licensing**: check Actions included minutes, usage, spending limit and payment status.
2. Repository **Settings → Actions → General**: confirm Actions are enabled and the selected fork/PR workflow policy permits runs from this branch.
3. If this is an organization-owned policy, check organization Actions policy and hosted-runner availability.
4. Re-run the latest failed job after the external restriction is resolved.

Do not treat the project as CI-verified until the workflow shows real steps and a completed passing test/build result.
