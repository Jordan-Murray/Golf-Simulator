$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiProject = Join-Path $repoRoot "GolfWeb\GolfWeb.csproj"
$frontendDir = Join-Path $repoRoot "Visualization"
$runDir = Join-Path $repoRoot ".run"
$pidFile = Join-Path $runDir "local-stack-pids.json"
$apiStdOut = Join-Path $runDir "api.out.log"
$apiStdErr = Join-Path $runDir "api.err.log"
$frontendStdOut = Join-Path $runDir "frontend.out.log"
$frontendStdErr = Join-Path $runDir "frontend.err.log"

$apiUrl = "http://localhost:5077"
$frontendUrl = "http://localhost:8080/"
$browserUrl = "http://localhost:8080/?apiBase=http%3A%2F%2Flocalhost%3A5077"

if (-not (Test-Path $apiProject)) {
    throw "Could not find API project at $apiProject"
}
if (-not (Test-Path $frontendDir)) {
    throw "Could not find frontend directory at $frontendDir"
}

New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$dotnetHome = Join-Path $runDir "dotnet-home"
New-Item -ItemType Directory -Force -Path $dotnetHome | Out-Null
$env:DOTNET_CLI_HOME = $dotnetHome
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = "1"
$env:DOTNET_NOLOGO = "1"
foreach ($f in @($apiStdOut, $apiStdErr, $frontendStdOut, $frontendStdErr)) {
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
}

Write-Host "Starting GolfWeb API on $apiUrl ..."
$apiProc = $null
$apiLogRedirect = $true
try {
    $apiProc = Start-Process dotnet -ArgumentList "run --project `"$apiProject`" --urls $apiUrl" -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $apiStdOut -RedirectStandardError $apiStdErr
} catch {
    $apiLogRedirect = $false
    Write-Host "API start with redirected logs failed; retrying without redirect."
    $apiProc = Start-Process dotnet -ArgumentList "run --project `"$apiProject`" --urls $apiUrl" -WorkingDirectory $repoRoot -PassThru
}

Write-Host "Starting frontend static server on $frontendUrl ..."
$pyCmd = Get-Command py -ErrorAction SilentlyContinue
if ($null -ne $pyCmd) {
    try {
        $frontendProc = Start-Process py -ArgumentList "-m http.server 8080" -WorkingDirectory $frontendDir -PassThru -RedirectStandardOutput $frontendStdOut -RedirectStandardError $frontendStdErr
    } catch {
        Write-Host "Frontend start with redirected logs failed; retrying without redirect."
        $frontendProc = Start-Process py -ArgumentList "-m http.server 8080" -WorkingDirectory $frontendDir -PassThru
    }
} else {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $pythonCmd) {
        throw "Python launcher not found. Install Python or add 'py'/'python' to PATH."
    }
    try {
        $frontendProc = Start-Process python -ArgumentList "-m http.server 8080" -WorkingDirectory $frontendDir -PassThru -RedirectStandardOutput $frontendStdOut -RedirectStandardError $frontendStdErr
    } catch {
        Write-Host "Frontend start with redirected logs failed; retrying without redirect."
        $frontendProc = Start-Process python -ArgumentList "-m http.server 8080" -WorkingDirectory $frontendDir -PassThru
    }
}

Start-Sleep -Seconds 2

if ($apiProc.HasExited) {
    Write-Host ""
    Write-Host "API failed to start. See logs:"
    if ($apiLogRedirect) {
        Write-Host "  $apiStdOut"
        Write-Host "  $apiStdErr"
    } else {
        Write-Host "  (no redirected logs available)"
    }
    exit 1
}
if ($frontendProc.HasExited) {
    Write-Host ""
    Write-Host "Frontend server failed to start. See logs:"
    Write-Host "  $frontendStdOut"
    Write-Host "  $frontendStdErr"
    exit 1
}

$apiHealthy = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $h = Invoke-RestMethod -Uri "$apiUrl/api/health" -TimeoutSec 1
        if ($h.status -eq "ok") {
            $apiHealthy = $true
            break
        }
    } catch {
        # keep polling
    }
}

if (-not $apiHealthy) {
    Write-Host ""
    Write-Host "API did not become healthy at $apiUrl/api/health."
    Write-Host "See logs:"
    if ($apiLogRedirect) {
        Write-Host "  $apiStdOut"
        Write-Host "  $apiStdErr"
    } else {
        Write-Host "  (no redirected logs available)"
    }
    exit 1
}

$pids = [ordered]@{
    apiPid = $apiProc.Id
    apiUrl = $apiUrl
    frontendPid = $frontendProc.Id
    frontendUrl = $frontendUrl
    browserUrl = $browserUrl
    startedAt = (Get-Date).ToString("o")
}
$pids | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Host "Opening browser at $browserUrl ..."
Start-Process $browserUrl | Out-Null

Write-Host ""
Write-Host "Local stack started."
Write-Host "API PID: $($apiProc.Id)"
Write-Host "Frontend PID: $($frontendProc.Id)"
Write-Host "PID file: $pidFile"
if ($apiLogRedirect) {
    Write-Host "API logs:"
    Write-Host "  $apiStdOut"
    Write-Host "  $apiStdErr"
}
