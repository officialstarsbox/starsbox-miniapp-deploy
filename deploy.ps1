$ErrorActionPreference = "Stop"

# Пути
$src = Split-Path -Parent $MyInvocation.MyCommand.Path   # папка, где лежит скрипт
$dst = Join-Path $env:USERPROFILE "Documents\starsbox-miniapp-deploy"

if (!(Test-Path $dst)) { throw "Папка деплоя не найдена: $dst (сначала git clone публичного репо)" }

Write-Host "==> Чистим публичный репозиторий..." -ForegroundColor Cyan
Get-ChildItem -Force $dst | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

Write-Host "==> Копируем файлы..." -ForegroundColor Cyan
$exclude = @(".git", ".github")
Get-ChildItem -Force $src | Where-Object { $exclude -notcontains $_.Name } | Copy-Item -Destination $dst -Recurse -Force
New-Item -Path (Join-Path $dst ".nojekyll") -ItemType File -Force | Out-Null

Write-Host "==> Готовим git и пушим..." -ForegroundColor Cyan
Set-Location $dst

# создадим/переключимся на main
git rev-parse --verify main *> $null
if ($LASTEXITCODE -eq 0) { git checkout main } else { git checkout -b main }

git add .

$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
  Write-Host "Нет изменений для деплоя." -ForegroundColor Yellow
} else {
  $msg = "Deploy $(Get-Date -Format s)"
  git commit -m $msg
  git push origin main
  Write-Host "==> Готово: изменения отправлены." -ForegroundColor Green
}
