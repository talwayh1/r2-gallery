# AGENTS.md

## 项目概述

图片/视频画廊应用，部署在 Cloudflare Workers 上。R2 存储文件，D1 存储元数据，React SPA 作为前端。

## 项目结构

- `/src/` — 后端（Hono Cloudflare Worker）
  - `src/index.ts` — 主入口，路由挂载、CORS、缓存、OG SSR
  - `src/routes/` — API 路由：admin, files, metadata, shares, upload
  - `src/services/` — 服务层：db（D1）, r2（存储）, thumbnail（缩略图生成）
  - `src/auth.ts` — JWT 认证（HMAC-SHA256）+ Telegram 登录
- `/web/` — 前端（React SPA）
  - `web/src/main.tsx` — React 入口
  - `web/src/components/` — 16 个 React 组件
  - `web/src/hooks/` — 自定义 hooks
  - `web/dist/` — 构建输出（由 Workers Assets 绑定提供服务）
- `/migrations/` — D1 数据库迁移（SQL）

## 开发命令

```bash
# 启动本地开发服务器（wrangler dev，端口 8787）
npm run dev

# 仅构建前端
npm run build:web

# 完整部署（构建前端 + 部署 Worker）
npm run deploy
```

前端开发服务器（在 web/ 目录下）：
```bash
cd web && npm run dev    # Vite dev server，代理 /api 到 localhost:8787
cd web && npm run build  # tsc + vite build
```

## 架构要点

- **无 monorepo 工具**：前后端是独立的 npm 包，各自有 `package-lock.json`，无 workspaces
- **无测试框架**：没有 vitest/jest，无测试文件
- **无 lint/格式化**：没有 ESLint/Prettier/Biome
- **TypeScript strict 模式**：前后端都启用了 strict mode
- **Cloudflare 绑定**：R2_BUCKET（文件存储）、DB（D1 数据库）、ASSETS（静态前端）
- **环境变量**：在 `wrangler.toml` 的 `[vars]` 中定义（ADMIN_PASSWORD, JWT_SECRET, TELEGRAM_BOT_TOKEN 等）
- **缩略图生成**：使用 @jsquash/* WASM 库在 Worker 中生成 300x300 WebP 缩略图

## 部署

- GitHub Actions 工作流：`.github/workflows/deploy.yml`
- 需要的 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- 部署流程：构建前端 → 确保 D1/R2 存在 → 运行迁移 → wrangler deploy

## 提交规范

使用 Conventional Commits：`feat:`, `fix:`, `perf:`, `chore:` — 简洁描述，小写，无 scope。
