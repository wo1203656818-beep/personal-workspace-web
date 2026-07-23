# Personal Workspace on Cloudflare

个人工作台系统：任务管理（双向同步 MS Todo）、笔记（双向同步 IMA）、知识库（多格式预览 + R2 存储）、AI 数据分析、天意硬币。按 Cloudflare 官方开发规范组织，使用 Terraform 管理基础设施，wrangler 部署 Worker + Pages。

## 架构

```
┌─────────────────────────────────────────────────┐
│  Frontend (Cloudflare Pages)                    │
│  React 19 + Vite + Tailwind v4 + shadcn/ui      │
│  + motion + TanStack Query + recharts           │
└──────────────────────┬──────────────────────────┘
                       │ /api/* (Bearer JWT)
┌──────────────────────▼──────────────────────────┐
│  Backend (Cloudflare Workers)                   │
│  Hono + Drizzle ORM                             │
│  + Cloudflare AI + R2 + KV                      │
└──┬────────────┬───────────────┬─────────────────┘
   │            │               │
   ▼            ▼               ▼
┌──────┐  ┌──────────┐   ┌─────────────┐
│  D1  │  │   R2     │   │     KV      │
│SQLite│  │ 文件存储  │   │ token 缓存   │
└──────┘  └──────────┘   └─────────────┘
        │
        ▼
┌──────────────────────────────┐
│  外部集成                     │
│  · MS Graph (Todo 双向同步)   │
│  · IMA OpenAPI (笔记/KB 同步) │
│  · ANU QRNG / random.org      │
└──────────────────────────────┘
```

## 项目结构

```
.
├── frontend/                 # 前端（Cloudflare Pages）
│   ├── src/
│   │   ├── components/       # UI 组件
│   │   ├── pages/            # 页面
│   │   ├── lib/              # API / Auth / Theme / Utils
│   │   └── hooks/
│   └── vite.config.ts
├── backend/                  # 后端（Cloudflare Workers）
│   ├── src/                  # Hono 路由、同步逻辑、Schema
│   ├── drizzle/              # D1 迁移文件
│   └── wrangler.jsonc        # 新版 JSONC 配置
├── infrastructure/
│   └── terraform/            # 基础设施即代码（D1/R2/KV/Token）
├── scripts/
│   ├── setup-local.ps1       # 本地初始化
│   └── deploy.ps1            # 一键部署
└── package.json              # monorepo workspaces
```

## 前置条件

- Node.js 22+
- npm 10+
- Terraform 1.9+（可选，用于创建基础设施）
- Cloudflare 账号 + API Token（需 `Account:Edit`、`Cloudflare Pages:Edit`、`Workers Scripts:Edit`、`D1:Edit`、`R2:Edit`、`Workers KV:Edit` 等权限）

## 本地启动

### 1. 初始化

PowerShell 7+：

```powershell
.\scripts\setup-local.ps1
```

或手动：

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../backend && npm run db:migrate
```

### 2. 配置后端环境变量

复制 `backend/.dev.vars.example` 为 `backend/.dev.vars`，填写：

```env
JWT_SECRET=你的JWT密钥至少32字符随机串
PASSWORD_HASH=见下方生成方式
MS_CLIENT_ID=Azure应用Client ID
MS_CLIENT_SECRET=Azure应用Client Secret
MS_TENANT_ID=Azure租户ID
```

生成 `PASSWORD_HASH`：

```bash
cd backend
npm run hash-password -- your_password
# 输出: pbkdf2$100000$<salt>$<hash>
```

### 3. 启动开发服务器

```bash
# 终端 1：后端
cd backend
npm run dev          # http://localhost:8787

# 终端 2：前端
cd frontend
npm run dev          # http://localhost:5173
```

## 全新部署到 Cloudflare

### 1. 创建基础设施（Terraform）

```powershell
cd infrastructure\terraform
copy terraform.tfvars.example terraform.tfvars
# 编辑 terraform.tfvars，填入 account_id

terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

apply 完成后会输出：

- `d1_database_id` → 填入 `backend/wrangler.jsonc` 的 `d1_databases[0].database_id`
- `kv_namespace_id` → 填入 `backend/wrangler.jsonc` 的 `kv_namespaces[0].id`
- `deploy_token_value` → 保存到密码管理器，后续 `wrangler login` 或 `CLOUDFLARE_API_TOKEN` 使用

### 2. 更新 wrangler.jsonc

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "personal-workspace-db",
      "database_id": "<terraform 输出的 d1_database_id>"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "<terraform 输出的 kv_namespace_id>"
    }
  ]
}
```

### 3. 一键部署

```powershell
$env:CLOUDFLARE_API_TOKEN = "你的API Token"
.\scripts\deploy.ps1
```

或分步执行：

```bash
# 构建前端
cd frontend && npm ci && npm run build

# 部署 Worker
cd ../backend && npm ci && npx wrangler deploy

# 远程数据库迁移
npm run db:migrate:remote

# 设置必要 secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put PASSWORD_HASH
npx wrangler secret put MS_CLIENT_SECRET

# 部署 Pages
cd ../frontend
npx wrangler pages deploy ./dist --project-name personal-workspace-web
```

### 4. 配置前端 API 地址

前端默认调用同域 `/api/*`。若 Pages 与 Worker 不同域，在 `frontend/.env.production` 中设置：

```env
VITE_API_BASE=https://personal-workspace-api.your-account.workers.dev
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 动效 | motion |
| 状态管理 | TanStack Query 5 |
| 路由 | React Router 7 |
| 图表 | recharts |
| 文档预览 | @react-pdf-viewer + docx-preview + xlsx |
| 后端框架 | Hono 4 |
| ORM | Drizzle ORM |
| 数据库 | Cloudflare D1 |
| 文件存储 | Cloudflare R2 |
| 缓存 | Cloudflare KV |
| AI | Cloudflare Workers AI / 自定义 OpenAI 兼容 API |
| 部署 | Cloudflare Workers + Pages + Terraform |

## 质量检查

```bash
# 后端
cd backend
npm run typecheck
npm run lint

# 前端
cd frontend
npm run typecheck
npm run lint
npm run build
```

## 许可

个人自用项目，未开源。
