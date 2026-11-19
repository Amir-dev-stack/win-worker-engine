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
    [switch]$UseLiveModels,
    [switch]$VerifyModelsOnly,
    [switch]$ReadOnlySmoke,
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
if ($Run -and $VerifyModelsOnly) { throw "Use -VerifyModelsOnly without -Run." }
if ($ReadOnlySmoke -and (-not $Run -or $VerifyModelsOnly -or $ReviewAfter -or -not $UseLiveModels)) {
    throw "ReadOnlySmoke requires -Run -UseLiveModels and disallows -VerifyModelsOnly or -ReviewAfter."
}
if (-not $Run -and -not $VerifyModelsOnly) {
    Write-Host "Dry run only. Add -Run to execute with the selected model."
    return
}
if ($UseLiveModels -and $VerifiedModels) { throw "Choose one model evidence source, not both." }
if (-not $UseLiveModels -and -not $VerifiedModels) {
    throw "Live tasks require -UseLiveModels or -VerifiedModels PATH."
}
if ($VerifiedModels -and -not (Test-Path -LiteralPath $VerifiedModels -PathType Leaf)) {
    throw "Verified model evidence file not found."
}
$verifiedArgs = @($jsRouter, '--task', $Task, '--cwd', $Worktree, '--verify-only')
if ($UseLiveModels) { $verifiedArgs += '--live-models' }
else { $verifiedArgs += @('--verified-models', $VerifiedModels) }
if ($Category) { $verifiedArgs += @('--category', $Category) }
if ($ReviewAfter) { $verifiedArgs += '--review-after' }
$verifiedText = & node @verifiedArgs
if ($LASTEXITCODE -ne 0) { throw "WIN model evidence is invalid, stale or unavailable." }
$plan = $verifiedText | ConvertFrom-Json
Write-Host ("Verified selection: {0} ({1}), pre-dispatch fallback: {2}" -f $plan.model,$plan.effort,$plan.fallbackBeforeDispatch)
if ($VerifyModelsOnly) {
    if ($UseLiveModels) {
        Write-Host "Live Codex account model and quota preflight passed. No coding task was executed."
    } else {
        Write-Host "Local model evidence validation passed. Account quota was NOT queried; no coding task was executed."
    }
    return
}
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
# Prefer the npm-generated Windows .cmd launcher, not codex.ps1.
# npm's PowerShell shim may print a successful login on stderr; in Windows
# PowerShell with ErrorActionPreference=Stop that becomes a terminating error.
$codexCmd = Get-Command codex.cmd -ErrorAction SilentlyContinue
if (-not $codexCmd) {
    throw "Codex CLI Windows command shim is unavailable. Verify installation with: codex.cmd --version"
}
# Static command only: no user text, worktree or secrets are passed through cmd.exe.
# cmd.exe combines both CLI streams into standard output for robust status parsing.
$authText = (& cmd.exe /d /s /c 'codex.cmd login status 2>&1' | Out-String).Trim()
$authCode = $LASTEXITCODE
if ($authCode -ne 0 -or $authText -notmatch '(?i)^Logged in (using|via) chatgpt\b') {
    throw "ChatGPT-authenticated Codex CLI is required; API-key or unknown login modes are blocked."
}
$mode = if ($ReadOnlySmoke -or $plan.category -eq 'review') { 'read-only' } else { 'workspace-write' }
if ($ReadOnlySmoke) {
    Write-Host "Safe execution smoke: forcing read-only sandbox; no automatic review or retry."
}
Write-Host "Starting one bounded Codex task in $target"
# Preserve Codex stderr as normal live output, without turning it into an
# early PowerShell exception. Always inspect the native process exit code.
$previousErrorAction = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & $codexCmd.Source exec -C $target --model $plan.model -c ('model_reasoning_effort="{0}"' -f $plan.effort) --sandbox $mode $Task
    $taskCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorAction
}
if ($taskCode -ne 0) { throw "Codex task failed; Astra review skipped. Exit code: $taskCode" }
if ($ReviewAfter -and $plan.category -ne 'review') {
    $reviewPrompt = "Read-only security and regression review of the CURRENT UNCOMMITTED changes in this worktree. Do not change files, deploy, merge, read secrets, or alter billing. Report prioritized findings. Goal: " + $Task
    Write-Host "Launching one read-only model review..."
    $reviewArgs = @($jsRouter, '--task', $reviewPrompt, '--cwd', $target, '--category', 'review', '--verify-only')
    if ($UseLiveModels) { $reviewArgs += '--live-models' }
    else { $reviewArgs += @('--verified-models', $VerifiedModels) }
    $reviewPlanText = & node @reviewArgs
    if ($LASTEXITCODE -ne 0) { throw "WIN review plan validation failed." }
    $reviewPlan = $reviewPlanText | ConvertFrom-Json
    if (-not $plan.reviewModel -or -not $plan.reviewEffort) {
        throw "Reviewer was not selected during the original preflight."
    }
    if ($reviewPlan.model -ne $plan.reviewModel -or $reviewPlan.effort -ne $plan.reviewEffort) {
        throw "Reviewer eligibility changed since original preflight; stopping rather than switching silently."
    }
    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $codexCmd.Source exec -C $target --model $plan.reviewModel -c ('model_reasoning_effort="{0}"' -f $plan.reviewEffort) --sandbox 'read-only' $reviewPrompt
        $reviewCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($reviewCode -ne 0) { throw "WIN read-only review was not completed." }
}
Write-Host "WIN model-routed task completed. Review code and tests before any deployment."
