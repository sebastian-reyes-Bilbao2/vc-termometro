# ============================================================================
# vc-termometro - uninstall-tasks.ps1
# Quita las dos tareas registradas por install-tasks.ps1.
# ============================================================================

$ErrorActionPreference = "Continue"

$tasks = @("vc-termometro-morning", "vc-termometro-afternoon")

foreach ($t in $tasks) {
    $existing = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $t -Confirm:$false
        Write-Host ("[OK] quitada " + $t) -ForegroundColor Green
    } else {
        Write-Host ("  " + $t + " no estaba registrada") -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Listo." -ForegroundColor Cyan
