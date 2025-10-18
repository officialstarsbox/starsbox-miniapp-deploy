$ErrorActionPreference = "Stop"

$src = Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dstPath = Join-Path $env:USERPROFILE "Documents\starsbox-miniapp-deploy"
if (!(Test-Path $dstPath)) { throw "Папка деплоя не найдена: $dstPath" }
$dst = Resolve-Path $dstPath

if ($src -eq $dst) { throw "ОШИБКА: скрипт запущен в папке деплоя. Запускай из starsbox-miniapp." }

Write-Host "==> Чистим публичный репозиторий..." -ForegroundColor Cyan
Get-ChildItem -Force $dst | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

Write-Host "==> Копируем файлы..." -ForegroundColor Cyan
$exclude = @(".git",".github","deploy.ps1")
Get-ChildItem -Force $src | Where-Object { $exclude -notcontains $_.Name } | Copy-Item -Destination $dst -Recurse -Force
New-Item -Path (Join-Path $dst ".nojekyll") -ItemType File -Force | Out-Null

Write-Host "==> Готовим git и пушим..." -ForegroundColor Cyan
Set-Location $dst
git rev-parse --verify HEAD *> $null
if ($LASTEXITCODE -ne 0) { git checkout --orphan main } else { git checkout -B main }

git add .
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
  Write-Host "Нет изменений для деплоя." -ForegroundColor Yellow
  exit 0
}

git commit -m ("Deploy " + (Get-Date -Format s))

# Тихий fetch (не триггерим NativeCommandError)
cmd /c "git fetch origin main >nul 2>nul"

# Переписываем ветку деплоя (так задумано для статической выдачи)
git push -u origin main --force-with-lease
if ($LASTEXITCODE -ne 0) { throw "push failed" }

Write-Host "==> Готово: https://officialstarsbox.github.io/starsbox-miniapp-deploy/" -ForegroundColor Green
