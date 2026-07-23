#requires -Version 7
<#
.SYNOPSIS
  初始化本地开发环境
.DESCRIPTION
  1. 安装前后端依赖
  2. 复制示例 dev.vars
  3. 执行本地 D1 migration
  4. 生成初始管理员密码 hash
#>
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot

Write-Host "==> 安装后端依赖" -ForegroundColor Cyan
Push-Location "$Root\backend"
try {
  npm install
  if (-not (Test-Path .dev.vars)) {
    Copy-Item .dev.vars.example .dev.vars
    Write-Host "已创建 .dev.vars，请编辑配置" -ForegroundColor Yellow
  }
}
finally {
  Pop-Location
}

Write-Host "==> 安装前端依赖" -ForegroundColor Cyan
Push-Location "$Root\frontend"
try {
  npm install
}
finally {
  Pop-Location
}

Write-Host "==> 本地数据库 migration" -ForegroundColor Cyan
Push-Location "$Root\backend"
try {
  npm run db:migrate
}
finally {
  Pop-Location
}

Write-Host "==> 生成初始密码 hash（示例：password）" -ForegroundColor Cyan
Push-Location "$Root\backend"
try {
  $hash = node scripts/hash-password.mjs password
  Write-Host "PASSWORD_HASH=$hash" -ForegroundColor Green
  Write-Host "请将上述 hash 写入 backend/.dev.vars（本地）或通过 wrangler secret put PASSWORD_HASH（线上）" -ForegroundColor Yellow
}
finally {
  Pop-Location
}

Write-Host "==> 本地设置完成。可分别运行：" -ForegroundColor Green
Write-Host "    backend:  npm run dev" -ForegroundColor Gray
Write-Host "    frontend: npm run dev" -ForegroundColor Gray
