# ============================================================================
# vc-termometro - install-tasks.ps1
# Registra DOS tareas en Windows Task Scheduler:
#   vc-termometro-morning    -> 6:50 AM diario
#   vc-termometro-afternoon  -> 12:50 PM diario
# Cada tarea invoca run-research.ps1, que llama a fetch-research.mjs.
#
# Se registran bajo el usuario actual (no requiere admin).
# Corre aunque el PC este con bateria. NO despierta el PC si esta suspendido.
# ============================================================================

$ErrorActionPreference = "Stop"

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$wrapperPath = Join-Path $scriptDir "run-research.ps1"

if (-not (Test-Path $wrapperPath)) {
    Write-Host "ERROR: no encuentro $wrapperPath" -ForegroundColor Red
    exit 1
}

$psExe = (Get-Command powershell.exe).Path

function New-TermometroTask {
    param(
        [string]$TaskName,
        [string]$RunLabel,
        [int]$Hour,
        [int]$Minute
    )

    $actionArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $wrapperPath + '" -Run ' + $RunLabel
    $action     = New-ScheduledTaskAction -Execute $psExe -Argument $actionArgs -WorkingDirectory $scriptDir

    $triggerAt = ([DateTime]::Today).AddHours($Hour).AddMinutes($Minute)
    $trigger   = New-ScheduledTaskTrigger -Daily -At $triggerAt

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType Interactive `
        -RunLevel Limited

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host ("  (quite tarea previa " + $TaskName + ")") -ForegroundColor DarkGray
    }

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "vc-termometro research ($RunLabel) - alimenta findings.json antes del scheduler de Cowork." | Out-Null

    $timeStr = ('{0:D2}:{1:D2}' -f $Hour, $Minute)
    Write-Host ("[OK] registrada " + $TaskName + "  (" + $timeStr + " diario)") -ForegroundColor Green
}

Write-Host ""
Write-Host "Instalando tareas vc-termometro en Windows Task Scheduler..." -ForegroundColor Cyan
Write-Host ("  script:       " + $wrapperPath)
Write-Host ("  usuario:      " + $env:USERNAME)
Write-Host ""

New-TermometroTask -TaskName "vc-termometro-morning"   -RunLabel "morning"   -Hour 6  -Minute 50
New-TermometroTask -TaskName "vc-termometro-afternoon" -RunLabel "afternoon" -Hour 12 -Minute 50

Write-Host ""
Write-Host "Listo. Las tareas corren 10 min antes del scheduler de Cowork" -ForegroundColor Cyan
Write-Host "(que esta configurado para 7:00 AM y 1:00 PM) - asi findings.json siempre"
Write-Host "esta fresco cuando Cowork arranca."
Write-Host ""
Write-Host "Para verlas:     Get-ScheduledTask -TaskName 'vc-termometro-*'"
Write-Host "Para probarlas:  Start-ScheduledTask -TaskName 'vc-termometro-morning'"
Write-Host "Para quitarlas:  .\\uninstall-tasks.ps1"
Write-Host ""
