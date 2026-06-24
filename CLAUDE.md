# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

R2 Gallery — a self-hosted image/video gallery deployed on Cloudflare Workers. Files stored in R2, metadata in D1, React SPA served via Workers Assets.

## Development Commands

```bash
# Start local dev server (wrangler dev, port 8787) — runs backend + serves built frontend
npm run dev

# Frontend dev server (Vite, proxies /api to localhost:8787)
cd web && npm run dev

# Build frontend only
npm run build:web

# Full deploy (build frontend + wrangler deploy)
npm run deploy

# Initialize D1 database locally
npm run db:init:local
```

No test framework, linter, or formatter is configured.

## Architecture

**Backend** (`/src/`) — Hono framework on Cloudflare Workers:
- `src/index.ts` — Main entry: route mounting, CORS, caching headers, OG/SSR for social bots, SPA fallback
- `src/routes/` — API routes: `files.ts`, `upload.ts`, `admin.ts`, `metadata.ts`, `shares.ts`
- `src/services/` — `db.ts` (D1 queries), `r2.ts` (R2 storage ops), `thumbnail.ts` (WASM image processing via @jsquash/*)
- `src/auth.ts` — JWT (HMAC-SHA256), password hashing (PBKDF2), Telegram Login Widget verification
- `src/types.ts` — Shared TypeScript interfaces (AppBindings, FileInfo, User, etc.)

**Frontend** (`/web/`) — React 18 SPA with Vite, Tailwind CSS:
- `web/src/App.tsx` — Main app component
- `web/src/components/` — UI components (FileGrid, FileList, Lightbox, VideoPlayer, AudioPlayer, UploadZone, etc.)
- `web/src/hooks/` — Custom hooks (useAuth, useTheme, useToast, useFolderThumbnails)
- `web/src/api.ts` — API client
- `web/src/i18n/index.ts` — i18next internationalization (i18n config + translations)

**Database** (`/migrations/`) — D1 SQL migrations. Tables: `users`, `file_metadata`, `settings`, `shares`.

## Key Bindings & Environment

Cloudflare bindings defined in `wrangler.toml`:
- `R2_BUCKET` — R2 bucket for file storage
- `DB` — D1 database for metadata
- `ASSETS` — Workers Assets binding (serves `web/dist/`)

Environment variables in `wrangler.toml` `[vars]`: `ADMIN_PASSWORD`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `DEMO_MODE`.

## Auth Flow

- Password auth: POST `/api/login` → JWT token
- Telegram auth: POST `/api/auth/telegram` → JWT token (auto-creates user)
- Protected routes use `authMiddleware`; admin-only routes add `ensureAdmin`
- Public share links: `/api/share/:id` (optional password protection)

## Deployment

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Ensures D1 database and R2 bucket exist
2. Applies D1 migrations
3. Builds frontend (`web/dist/`)
4. Runs `wrangler deploy`

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Commit Convention

Conventional Commits: `feat:`, `fix:`, `perf:`, `chore:` — lowercase, no scope.
