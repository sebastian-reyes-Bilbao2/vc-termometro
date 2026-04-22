# setup-git.ps1
# Ejecutar UNA SOLA VEZ para conectar la carpeta local al repo de GitHub.
# Requiere que Git esté instalado: https://git-scm.com
# El token se lee de scripts/.env — no lo pongas en este archivo.

$repoDir  = Split-Path $PSScriptRoot -Parent
$envFile  = Join-Path $PSScriptRoot ".env"

# Leer token desde .env
$token = ""
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^GITHUB_TOKEN=(.+)$") { $token = $matches[1] }
    }
}

if (-not $token) {
    Write-Error "No se encontró GITHUB_TOKEN en scripts/.env"
    exit 1
}

$remoteUrl = "https://${token}@github.com/sebastian-reyes-Bilbao2/vc-termometro.git"

Set-Location $repoDir

# Eliminar .git corrupto si existe
if (Test-Path ".git") {
    Write-Host "Eliminando .git existente..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".git"
}

# Inicializar repo limpio
git init -b main
git config user.email "sebastianr@30x.com"
git config user.name "Sebastian Reyes"

# Crear .gitignore
@"
raw/
scripts/logs/
scripts/node_modules/
scripts/.env
findings.json
*.lock
"@ | Set-Content 