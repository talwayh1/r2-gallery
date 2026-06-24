# R2 Gallery

A self-hosted image/video gallery deployed on **Cloudflare Workers**, with files stored in **R2** and metadata in **D1**. Features a React SPA frontend with a feature-rich UI including lightbox, bulk operations, video/audio playback, 360° panoramas, PWA support, WebDAV, and more.

> 🖼️ **Live demo**: [tu.zhangyubi.cn](https://tu.zhangyubi.cn)

---

## ✨ Features

### 📁 File Management
- File grid / list / row / column / image list views
- Upload (drag-and-drop, multi-file, with progress)
- Download (single & batch as ZIP)
- Delete (single & batch)
- Rename, Move, Duplicate
- Copy links (public & direct R2)
- Create folders
- Search & filter (by type: image, video, audio, document)
- Sort (name, size, date, kind, shuffle; ascending/descending)
- EXIF metadata extraction & display

### 🖼️ Media Playback
- **Image lightbox** with zoom, pan, rotate, flip, autocrop, color filters (brightness, contrast, saturation, hue, blur, grayscale, sepia, invert)
- **Video player** with progress bar, speed control, fullscreen; **HLS** streaming support
- **Audio player** with playlist, shuffle, loop modes (off/list/single), mini-player, volume persistence
- **360° Panorama viewer** with drag-to-look
- **PDF viewer** (browser-native)
- **Slideshow** with configurable interval

### 🔧 Administration
- JWT-based authentication (password + Telegram Login Widget)
- Drag-and-drop upload zone
- Storage statistics (total files, size, breakdown by type)
- Database & R2 diagnostics page
- File activity log
- Trash / recycle bin
- Settings panel (theme, locale, header customization)
- CDN support with `/cdn/*` origin-pull endpoints

### 🌍 Internationalization
- **zh-CN**, **en**, **ja**, **ko** — with more locale files available
- Theme toggle (light / dark)

### 🔗 Sharing
- Shareable file links with optional password protection
- Expiration-based share links
- Open Graph (OG) meta tags for social sharing (`/view/*` route)
- WebDAV support

### 🚀 Performance & PWA
- Virtual scrolling for large directories
- Thumbnail generation via WASM (`@jsquash/*` — WebP 300×300)
- Smart asset caching (immutable cache for hashed assets)
- Service Worker (`sw.js`) for offline-capable PWA
- Install prompt for mobile/desktop
- Keyboard shortcuts

---

## 🏗️ Architecture

```
r2-gallery/
├── src/                    # Backend — Cloudflare Worker (Hono)
│   ├── index.ts            # Entry: route mounting, CORS, caching, OG/SSR, SPA fallback
│   ├── auth.ts             # JWT (HMAC-SHA256) + Telegram Login Widget + password hashing
│   ├── types.ts            # Shared TypeScript interfaces
│   ├── routes/
│   │   ├── files.ts        # File listing, metadata, CRUD
│   │   ├── upload.ts       # File upload (multipart)
│   │   ├── admin.ts        # Admin operations, stats, settings
│   │   ├── metadata.ts     # EXIF/ID3 metadata endpoints
│   │   ├── shares.ts       # Share link management
│   │   ├── trash.ts        # Recycle bin
│   │   ├── activity.ts     # Activity log
│   │   ├── presign.ts      # Presigned URL generation
│   │   └── webdav.ts       # WebDAV protocol support
│   └── services/
│       ├── db.ts           # D1 database queries
│       ├── r2.ts           # R2 storage operations
│       └── thumbnail.ts    # WASM-accelerated thumbnail generation
├── web/                    # Frontend — React SPA (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── main.tsx        # React entry point
│   │   ├── App.tsx         # Main app with routing & layout
│   │   ├── api.ts          # API client (fetch wrapper)
│   │   ├── i18n/           # i18next configuration + translations
│   │   ├── hooks/          # Custom React hooks
│   │   ├── components/     # UI components (16+ components)
│   │   └── ...             # CSS, contexts, utilities
│   ├── dist/               # Build output (served by Workers Assets)
│   ├── package.json
│   └── vite.config.ts
├── migrations/             # D1 SQL migrations
│   └── 0001_init.sql       # Initial schema (users, file_metadata, settings, shares)
├── .github/workflows/      # CI/CD
│   └── deploy.yml          # Automated deployment workflow
├── wrangler.toml           # Cloudflare configuration
├── CLAUDE.md               # Guidance for AI coding assistants
└── AGENTS.md               # 项目概述 (Chinese)
```

### Data Flow

```
User Browser ──HTTP──► Cloudflare Workers ──► R2 Bucket (files)
                         │                        └── CDN origin-pull (/cdn/*)
                         ├── D1 Database (metadata, users, shares)
                         ├── Workers Assets (serves web/dist/)
                         └── /view/* route → OG meta tags SSR for bots
```

---

## 🚦 Prerequisites

- **Node.js** 20+ (CI uses 24)
- **npm**
- A **Cloudflare** account with:
  - Workers subscription
  - R2 bucket
  - D1 database
  - (Optional) Custom domain configured in Cloudflare
- **GitHub** account (for CI/CD with GitHub Actions)
- **Wrangler CLI** — authenticated (`npx wrangler login`)

---

## 🛠️ Quick Start

### 1. Clone & Install

```bash
git clone <your-repo-url> r2-gallery
cd r2-gallery

# Install backend dependencies
npm install

# Install frontend dependencies
cd web && npm install && cd ..
```

### 2. Configure

Edit `wrangler.toml` with your Cloudflare bindings:

```toml
# R2 bucket
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "r2-gallery"   # Change if needed

# D1 database
[[d1_databases]]
binding = "DB"
database_name = "r2-gallery-db"
database_id = "<your-d1-database-id>"

# Environment variables
[vars]
ADMIN_PASSWORD = "<your-admin-password>"
JWT_SECRET = "<random-32-char-string>"
TELEGRAM_BOT_TOKEN = ""       # Optional
TELEGRAM_BOT_USERNAME = ""    # Optional
DEMO_MODE = "false"
CDN_DOMAIN = ""               # Optional, e.g. "https://cdn.example.com/cdn"
```

### 3. Initialize Local D1 Database

```bash
npm run db:init:local
```

### 4. Start Development

```bash
# Start backend (wrangler dev on port 8787) — also serves built frontend
npm run dev

# In another terminal — frontend dev server (Vite, proxies /api → localhost:8787)
cd web && npm run dev
```

The frontend dev server runs on `http://localhost:5173` and the backend API on `http://localhost:8787`.

---

## 📦 Build & Deploy

### Manual Deploy

```bash
# Build frontend and deploy Worker
npm run deploy
```

### CI/CD (GitHub Actions)

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:

1. Ensures the D1 database and R2 bucket exist
2. Applies D1 migrations
3. Builds the frontend
4. Runs `wrangler deploy`

**Required GitHub Secrets:**

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers & R2 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

To trigger a deploy: go to **Actions → Deploy to Cloudflare Workers → Run workflow**, or push to `master`.

---

## 🔧 Configuration

### Environment Variables (`wrangler.toml [vars]`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | ✅ | Default admin password (first-run creates `admin` user) |
| `JWT_SECRET` | ✅ | Secret key for JWT token signing (min 32 chars, random) |
| `TELEGRAM_BOT_TOKEN` | — | Telegram Bot API token (for Telegram Login Widget auth) |
| `TELEGRAM_BOT_USERNAME` | — | Telegram bot username (for Telegram Login Widget) |
| `DEMO_MODE` | — | Set to `"true"` to enable demo mode (no auth required) |
| `CDN_DOMAIN` | — | CDN origin-pull domain for `/cdn/*` file serving |

### Cloudflare Bindings

| Binding | Type | Description |
|---------|------|-------------|
| `R2_BUCKET` | R2 | File storage bucket |
| `DB` | D1 | Metadata database |
| `ASSETS` | Workers Assets | Serves frontend from `web/dist/` |

### D1 Database Tables

- `users` — authentication (username, password_hash, role, created_at)
- `file_metadata` — file info (path, size, mime, dimensions, exif, etc.)
- `settings` — app settings (key-value pairs)
- `shares` — public share links (path, password_hash, expires_at, created_at)
- `activity_log` — audit trail of file operations
- `trash` — deleted files metadata

---

## 🧑‍💻 Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Worker dev server (port 8787) |
| `npm run build:web` | Build frontend only |
| `npm run deploy` | Full deploy (build frontend + wrangler deploy) |
| `npm run db:init` | Initialize remote D1 database |
| `npm run db:init:local` | Initialize local D1 database |
| `cd web && npm run dev` | Frontend Vite dev server (port 5173) |
| `cd web && npm run build` | Frontend production build |
| `cd web && npm run preview` | Preview built frontend |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Search |
| `?` | Show keyboard shortcuts |
| `r` | Refresh |
| `v` | Toggle layout (grid/list/etc.) |
| `t` | Toggle theme (light/dark) |
| `Ctrl/Cmd + A` | Select all files |
| `Escape` | Deselect / close lightbox |

---

## 🧩 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Cloudflare Workers (Node.js compat) |
| **Framework** | Hono (backend), React 18 (frontend) |
| **Storage** | R2 (files), D1 (SQLite – metadata, users, shares) |
| **Build** | Vite + TypeScript (strict mode) |
| **Styling** | Tailwind CSS |
| **Auth** | JWT (HMAC-SHA256), PBKDF2 password hashing, Telegram Login Widget |
| **Thumbnails** | @jsquash/* (WASM: WebP, AVIF, JPEG, PNG, resize) |
| **EXIF** | exifr + jsmediatags |
| **CI/CD** | GitHub Actions + Wrangler |
| **PWA** | Service Worker, manifest.json |

---

## 📄 License

This project is open source. See the [LICENSE](./LICENSE) file for details (MIT unless otherwise noted).

---

## 🙏 Acknowledgements

- Built on [Cloudflare Workers](https://workers.cloudflare.com/)
- Inspired by [files.gallery](https://www.files.gallery/) and other self-hosted gallery projects
- WASM image processing via [@jsquash](https://github.com/jamsinclair/jSquash)