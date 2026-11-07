$ErrorActionPreference = "Stop"
$model = "llama3.2:3b"
$api = "http://127.0.0.1:11434/api/tags"

Write-Host "WIN local AI setup: installing Ollama if needed and preparing $model."

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
        $candidatePaths = @(
            "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
            "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
        )
        foreach ($candidate in $candidatePaths) {
            if (Test-Path $candidate) {
                $env:PATH = (Split-Path $candidate) + ";" + $env:PATH
            }
        }
    } else {
        Start-Process "https://ollama.com/download/windows"
        throw "Install Ollama from the official Windows download page, reopen PowerShell, and run this script again."
    }
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Ollama was installed but is not yet on PATH. Close this terminal, open a new PowerShell window, and run this script again."
}

try {
    Invoke-RestMethod -Uri $api -Method Get -TimeoutSec 2 | Out-Null
} catch {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            Invoke-RestMethod -Uri $api -Method Get -TimeoutSec 2 | Out-Null
            $ready = $true
            break
        } catch {}
    }
    if (-not $ready) {
        throw "Ollama did not start on 127.0.0.1:11434. Check the Ollama desktop app and logs."
    }
}

ollama pull $model
$models = Invoke-RestMethod -Uri $api -Method Get
if (-not ($models.models | Where-Object { $_.name -eq $model -or $_.name -like "$model*" })) {
    throw "Model $model was not found in the local Ollama model list."
}

Write-Host ""
Write-Host "Ollama is ready. Model: $model"
Write-Host "API: http://127.0.0.1:11434/v1"
Write-Host "Next: configure the dedicated WIN runner token and start scripts/win-local-agent-runner.mjs."
Write-Host "No cloud model, API key, paid service, or public network listener was configured."
