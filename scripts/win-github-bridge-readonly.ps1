# WIN GitHub bridge: restricted one-shot, read-only local status pilot.
# Run explicitly from the isolated WIN-Agent clone. No OpenCode jobs are executed.
# The only remote write is a fixed, bounded status comment to private issue #26.
[CmdletBinding()]
param([switch]$Preview)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Repo = "Amir-dev-stack/win-worker-engine"
$Owner = "Amir-dev-stack"
$Issue = 26
$ExpectedBranch = "agent/win-bridge-readonly-pilot"
$ExpectedRoot = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE "source\WIN-Agent"))
$ExpectedTask = "WIN_BRIDGE_TASK_V1`nSTATUS"

function Invoke-FixedCli {
    param([string]$Program, [string[]]$Arguments)
    $output = & $Program @Arguments 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
    return $output.Trim()
}

foreach ($binary in @("gh", "git", "node")) {
    if (-not (Get-Command $binary -ErrorAction SilentlyContinue)) {
        throw "Required local CLI missing: $binary"
    }
}

$root = Invoke-FixedCli "git" @("rev-parse", "--show-toplevel")
if (-not [string]::Equals(
    [IO.Path]::GetFullPath($root).TrimEnd('\'),
    $ExpectedRoot.TrimEnd('\'),
    [StringComparison]::OrdinalIgnoreCase
)) { throw "This bridge may run only in the isolated WIN-Agent clone." }

$branch = Invoke-FixedCli "git" @("branch", "--show-current")
if ($branch -ne $ExpectedBranch) { throw "Expected branch $ExpectedBranch; found $branch" }

$remote = Invoke-FixedCli "git" @("remote", "get-url", "origin")
if ($remote -notmatch '^(https://github\.com/Amir-dev-stack/win-worker-engine(\.git)?|git@github\.com:Amir-dev-stack/win-worker-engine(\.git)?)$') {
    throw "Unexpected GitHub remote."
}
$login = Invoke-FixedCli "gh" @("api", "user", "--jq", ".login")
if ($login -ne $Owner) { throw "Authenticated GitHub account is not the project owner." }

# Parse JSON as data. Never evaluate issue bodies as PowerShell or agent prompts.
$raw = Invoke-FixedCli "gh" @("api", "repos/$Repo/issues/$Issue/comments", "--paginate")
$comments = @($raw | ConvertFrom-Json)
$task = @($comments | Where-Object {
    $_.user.login -eq $Owner -and
    ([string]$_.body -replace "`r`n", "`n").Trim() -ceq $ExpectedTask
} | Sort-Object id -Descending | Select-Object -First 1)

if ($task.Count -ne 1) {
    throw "No exact owner-authored STATUS task in bridge issue #26."
}

$dirty = -not [string]::IsNullOrWhiteSpace((Invoke-FixedCli "git" @("status", "--porcelain")))
$nodeVersion = Invoke-FixedCli "node" @("--version")
$openCodeInstalled = [bool](Get-Command "opencode" -ErrorAction SilentlyContinue)

# Report only tightly selected non-sensitive values, never raw logs or source.
$report = @(
    "WIN_BRIDGE_RESULT_V1"
    "Task comment ID: $($task[0].id)"
    "Status: completed"
    "Workspace: isolated WIN-Agent"
    "Branch: $ExpectedBranch"
    "Working tree: $(if ($dirty) { 'modified' } else { 'clean' })"
    "Node version: $nodeVersion"
    "OpenCode CLI installed: $(if ($openCodeInstalled) { 'yes' } else { 'no' })"
    "OpenCode execution: not enabled (read-only bridge pilot)"
    "No deployments, paid AI, billing actions or source modifications."
) -join "`n"

if ($Preview) {
    Write-Output $report
    Write-Output "PREVIEW ONLY: no GitHub comment posted."
} else {
    # Fixed-format comment only, not untrusted remote command execution.
    $null = Invoke-FixedCli "gh" @("issue", "comment", "$Issue", "--repo", $Repo, "--body", $report)
    Write-Output "WIN bridge pilot: status report posted to issue #26."
}
