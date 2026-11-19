<# 
Non-generative Codex Cloud readiness check for the existing WIN router.
Never submits a cloud task, exports credentials, or prints private task metadata.
#>
$ErrorActionPreference = 'Stop'
$codexCmd = Get-Command codex.cmd -ErrorAction SilentlyContinue
if (-not $codexCmd) { throw 'Codex CLI Windows shim is unavailable.' }
$authText = (& cmd.exe /d /s /c 'codex.cmd login status 2>&1' | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $authText -notmatch '(?i)^Logged in (using|via) chatgpt\b') {
    throw 'A ChatGPT-authenticated Codex CLI is required. API-key auth is not allowed.'
}
# Probe a read-only list operation. Suppress stdout to avoid leaking private
# task titles, identifiers, summaries, or task URLs into the terminal/CI logs.
$previousErrorAction = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $result = & $codexCmd.Source cloud list --limit 1 --json 2>$null
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorAction
}
if ($code -ne 0) { throw 'Codex Cloud listing is unavailable or not authorized for this account.' }
try {
    $parsed = ($result | Out-String | ConvertFrom-Json -ErrorAction Stop)
} catch { throw 'Codex Cloud returned an unrecognized list response.' }
if ($null -eq $parsed.tasks -or $parsed.tasks -isnot [array]) {
    throw 'Codex Cloud list response did not contain a tasks array.'
}
Write-Host 'Codex Cloud task listing endpoint: accessible.'
Write-Host 'No task was submitted, model was called, or credential was exported.'
Write-Host 'A published Codex Cloud environment has NOT been verified. Use codex.cmd cloud to inspect available environments.'
