# Publie le serveur C2 RAP sur GitHub (repo public rap-relay)
$ErrorActionPreference = "Stop"
$git = "C:\Program Files\Git\bin\git.exe"
$gh = "C:\Program Files\GitHub CLI\gh.exe"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $root

Write-Host "=== Publication GitHub ===" -ForegroundColor Cyan

& $gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Connexion GitHub requise..." -ForegroundColor Yellow
    & $gh auth login -p https -w -h github.com
}

$user = & $gh api user -q .login
$userId = & $gh api user -q .id
$gitName = $user
$gitEmail = "$userId+$user@users.noreply.github.com"
Write-Host "Compte : $user" -ForegroundColor Green

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    & $git -c "user.name=$gitName" -c "user.email=$gitEmail" @Args
}

if (-not (Test-Path ".git")) {
    Invoke-Git init
    Invoke-Git branch -M main
}

Invoke-Git add .
$committed = $false
Invoke-Git commit -m "Serveur C2 RAP pour Render.com" 2>$null
if ($LASTEXITCODE -eq 0) { $committed = $true }
if (-not $committed) {
    Invoke-Git add .
    Invoke-Git commit -m "Serveur C2 RAP pour Render.com" --allow-empty
}

$repoName = "rap-relay"
$exists = & $gh repo view "$user/$repoName" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creation du repo $user/$repoName ..." -ForegroundColor Yellow
    & $gh repo create $repoName --public --source=. --remote=origin --description "Serveur C2 RAP - relais WebSocket pour Render.com"
} else {
    Write-Host "Repo existant detecte." -ForegroundColor Gray
    & $git remote remove origin 2>$null
    & $git remote add origin "https://github.com/$user/$repoName.git"
}

Invoke-Git push -u origin main --force

$url = "https://github.com/$user/$repoName"
Write-Host ""
Write-Host "Termine ! Repo : $url" -ForegroundColor Green
Write-Host "Prochaine etape : Render.com -> New Blueprint -> connecter ce repo" -ForegroundColor Cyan
