# ============================================================================
# vc-termometro · run-research.ps1
# Wrapper invocado por Windows Task Scheduler.
#   - Se mueve al folder scripts
#   - Ejecuta: node fetch-research.mjs
#   - Loguea stdout + stderr en scripts/logs/YYYY-MM-DD.log
#   - Guarda el exit code
# ============================================================================

param(
    [string]$Run = $null  # "morning" | "afternoon" | $null (auto)
)

$ErrorActionPreference = "Continue"

# Forzar UTF-8 en consola y pipeline — si no, los acentos y emojis del script Node
# salen como ??? en el log.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir    = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$today   = Get-Date -Format "yyyy-MM-dd"
$stamp   = Get-Date -Format "HH:mm:ss"
$logFile = Join-Path $logDir "$today.log"

$nodeArgs = @("fetch-research.mjs")
if ($Run) { $nodeArgs += @("--run", $Run) }

"=== [$today $stamp] run-research.ps1 starting (run=$Run) ===" | Out-File -FilePath $logFile -Append -Encoding utf8

# Resolver el ejecutable de node
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    "ERROR: node not found in PATH" | Out-File -FilePath $logFile -Append -Encoding utf8
    exit 127
}

Push-Location $scriptDir
try {
    & $nodeCmd.Path @nodeArgs 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

"=== [$today $stamp] finished with exit=$code ===" | Out-File -FilePath $logFile -Append -Encoding utf8
"" | Out-File -FilePath $logFile -Append -Encoding utf8

exit $code
