#requires -Version 7
<#
.SYNOPSIS
  部署 Personal Workspace 到 Cloudflare（Worker + Pages + D1/R2/KV）
.DESCRIPTION
  1. 可选：terraform apply 创建基础设施
  2. 构建前端产物
  3. 部署 Worker
  4. 部署 Pages
  5. 提示设置必要 secrets
.NOTES
  需先设置环境变量 CLOUDFLARE_API_TOKEN
#>
param(
  [switch]$SkipInfra,
  [switch]$SkipSecrets
)

$ErrorActionPreference = "Stop"

if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host "请先设置环境变量 CLOUDFLARE_API_TOKEN" -ForegroundColor Red
  exit 1
}

$Root = Split-Path -Parent $PSScriptRoot

# 1. 基础设施（Terraform）
if (-not $SkipInfra) {
  Push-Location "$Root\infrastructure\terraform"
  try {
    Write-Host "==> Terraform init" -ForegroundColor Cyan
    terraform init

    Write-Host "==> Terraform plan" -ForegroundColor Cyan
    terraform plan -out=tfplan

    Write-Host "==> Terraform apply" -ForegroundColor Cyan
    terraform apply tfplan

    Write-Host "==> 请按输出填写 backend/wrangler.jsonc 中的 D1 database_id 与 KV namespace id" -ForegroundColor Yellow
    Read-Host "确认已填写后按 Enter 继续"
  }
  finally {
    Pop-Location
  }
}

# 2. 安装依赖
Write-Host "==> 安装后端依赖" -ForegroundColor Cyan
Push-Location "$Root\backend"
try {
  pnpm install
}
finally {
  Pop-Location
}

Write-Host "==> 安装前端依赖并构建" -ForegroundColor Cyan
Push-Location "$Root\frontend"
try {
  pnpm install
  pnpm build
}
finally {
  Pop-Location
}

# 3. 部署 Worker
Write-Host "==> 部署 Worker" -ForegroundColor Cyan
Push-Location "$Root\backend"
try {
  npx wrangler deploy
}
finally {
  Pop-Location
}

# 4. 部署 Pages
Write-Host "==> 部署 Pages" -ForegroundColor Cyan
Push-Location "$Root\frontend"
try {
  npx wrangler pages deploy ./dist --project-name personal-workspace-web
}
finally {
  Pop-Location
}

# 5. 设置 secrets
if (-not $SkipSecrets) {
  Write-Host "==> 设置 Worker secrets（按提示输入，输入不会回显）" -ForegroundColor Cyan
  Push-Location "$Root\backend"
  try {
    # 密码已迁移到 D1 settings 表，不再通过 env secret 管理
    # 部署后请运行：pnpm seed-password --remote
    $secrets = @("JWT_SECRET", "MS_CLIENT_SECRET")
    foreach ($s in $secrets) {
      Write-Host "设置 $s" -ForegroundColor Yellow
      npx wrangler secret put $s
    }
  }
  finally {
    Pop-Location
  }
}

Write-Host "==> 部署完成" -ForegroundColor Green
