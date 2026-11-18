<#
WIN automatic Codex model routing for Windows (PowerShell).
Uses the JavaScript router only to classify/validate the task, then launches
the Codex CLI from PowerShell so npm's codex.ps1/.cmd shim works on Windows.
No auto billing, no retries, PR #36 stays frozen.
#>
param(
    [Parameter(Mandatory=$true)][string]$Task,
    [string]$Worktree = (Get-Location).Path,
    [ValidateSet('simple','standard','complex','review')][string]$Category,
    [switch]$Run,
    [string]$VerifiedModels,
    [switch]$ReviewAfter
)
$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsRouter = Join-Path $scriptRoot 'win-model-router.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required. Verify with: node --version"
}
$cmd = @($jsRouter, '--task', $Task, '--cwd', $Worktree)
if ($Category) { $cmd += @('--category', $Category) }
# Dry-run classification never executes Codex.
$planText = & node @cmd
if ($LASTEXITCODE -ne 0) { throw "WIN router validation failed." }
$plan = $planText | ConvertFrom-Json
Write-Host ("WIN selected model: {0} ({1}), task type: {2}" -f $plan.model,$plan.effort,$plan.category)
if (-not $Run) {
    Write-Host "Dry run only. Add -Run to execute with the selected model."
    return
}
if (-not $VerifiedModels) { throw "Live tasks require -VerifiedModels PATH containing fresh account model/list evidence." }
if (-not (Test-Path -LiteralPath $VerifiedModels -PathType Leaf)) { throw "Verified model evidence file not found." }
$verifiedArgs = @($jsRouter, '--task', $Task, '--cwd', $Worktree, '--verified-models', $VerifiedModels, '--verify-only')
if ($Category) { $verifiedArgs += @('--category', $Category) }
$verifiedText = & node @verifiedArgs
if ($LASTEXITCODE -ne 0) { throw "WIN model evidence is invalid, stale or unavailable." }
$plan = $verifiedText | ConvertFrom-Json
Write-Host ("Verified selection: {0} ({1}), pre-dispatch fallback: {2}" -f $plan.model,$plan.effort,$plan.fallbackBeforeDispatch)
if (-not (Test-Path -LiteralPath $Worktree -PathType Container)) {
    throw "Git worktree not found: $Worktree"
}
$target = (Resolve-Path -LiteralPath $Worktree).ProviderPath
$gitRoot = (& git -C $target rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $gitRoot) { throw "Not a Git worktree." }
$gitCanonical = (Resolve-Path -LiteralPath $gitRoot.Trim()).ProviderPath
if ($target.TrimEnd('\','/') -ine $gitCanonical.TrimEnd('\','/')) {
    throw "The supplied path must be the Git worktree root."
}
if ($target -match '(?i)([\\/])pr36([\\/]|$)|pr36-review|pr36-safety') {
    throw "PR #36 is frozen; choose a different authorized Git worktree."
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "Codex CLI is unavailable in PowerShell. Check 'codex --version' and login first."
}
# Require ChatGPT login so a CLI API-key session cannot silently create usage-based charges.
$authText = (& codex login status 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $authText -notmatch '(?i)logged in (using|via) chatgpt') {
    throw "ChatGPT-authenticated Codex CLI is required; API-key or unknown login modes are blocked."
}
$mode = if ($plan.category -eq 'review') { 'read-only' } else { 'workspace-write' }
Write-Host "Starting one bounded Codex task in $target"
& codex exec -C $target --model $plan.model -c ('model_reasoning_effort="{0}"' -f $plan.effort) --sandbox $mode $Task
$taskCode = $LASTEXITCODE
if ($taskCode -ne 0) { throw "Codex task failed; Astra review skipped. Exit code: $taskCode" }
if ($ReviewAfter -and $plan.category -ne 'review') {
    $reviewPrompt = "Read-only security and regression review of the CURRENT UNCOMMITTED changes in this worktree. Do not change files, deploy, merge, read secrets, or alter billing. Report prioritized findings. Goal: " + $Task
    Write-Host "Launching one read-only model review..."
    $reviewArgs = @($jsRouter, '--task', $reviewPrompt, '--cwd', $target, '--category', 'review', '--verify-only', '--verified-models', $VerifiedModels)
    $reviewPlanText = & node @reviewArgs
    if ($LASTEXITCODE -ne 0) { throw "WIN review plan validation failed." }
    $reviewPlan = $reviewPlanText | ConvertFrom-Json
    & codex exec -C $target --model $reviewPlan.model -c ('model_reasoning_effort="{0}"' -f $reviewPlan.effort) --sandbox 'read-only' $reviewPrompt
    if ($LASTEXITCODE -ne 0) { throw "Astra review was not completed." }
}
Write-Host "WIN model-routed task completed. Review code and tests before any deployment."
