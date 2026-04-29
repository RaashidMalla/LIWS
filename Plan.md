# LWIS — Phased Build Plan

> Living document. Reference design: **aaPanel** (Linux server control panel). LWIS adapts that
> sidebar-driven, multi-feature panel concept for **Windows + XAMPP local development**.
> Features that only make sense on a Linux production server (full mail server, WAF, SSL via
> Let's Encrypt) are reframed as their dev-equivalent (Mailpit, basic security checks, self-signed
> cert manager).

---

## Vision

> "A control panel that makes you forget XAMPP Control Panel exists."

LWIS is the **single desktop app** a Windows web developer opens in the morning. From it they:
- Start / stop / restart services (MySQL, Apache, optionally PHP-FPM, Node, Mailpit, Redis)
- See every project in `htdocs` as a card
- Manage databases (MySQL + PostgreSQL + SQLite + Redis + MongoDB later)
- Edit hosts file and Apache vhosts in 2 clicks
- Tail logs across all services in one view
- Spin up Laravel / WordPress / Node projects with the right DB pre-wired
- Open a terminal already cd'd into the right project
- Never worry about MySQL corruption (already solved in Phase 1)

---

## Current State — v0.1 (DONE)

- [x] Electron + Node + mysql2 stack
- [x] Sidebar navigation, dark theme
- [x] Service control: MySQL, Apache (start, stop, status pills, live log)
- [x] Safe shutdown — `mysqladmin shutdown` on `before-quit`
- [x] Database manager: list/create/drop, browse tables, browse rows, inline edit, delete
- [x] SQL query runner with results table + error handling
- [x] Laravel project creator with live build log
- [x] Settings page (read-only paths)
- [x] Branded LWIS, GitHub repo live

## Current State — v0.2 (DONE)
- [x] Phase 2 — Settings & Persistence (editable paths, credentials, theme, window-bounds, auto-detect)

## Current State — v0.3 (DONE)
- [x] Phase 3 — Home Dashboard (live CPU/RAM/disk/uptime, service grid, quick actions, recent projects, system info)
- [x] Re-skinned primary accent from blue to green (aaPanel-style)
- [x] Sidebar shows LAN IP + status dot, nav-icons added

## Current State — v0.4 (DONE)
- [x] Phase 4 — Projects/Websites Manager (card grid, search/filter/sort, favorites, project info modal, npm script runner)

## Current State — v0.5 (DONE)
- [x] Phase 5 — Hosts & Domains (hosts editor with UAC, vhost manager, one-click `.test` domain wizard, Apache restart)

---

## Architecture & Dependencies to Add

| Concern | Library | Phases that need it |
| --- | --- | --- |
| Persistent settings | `electron-store` | 2 |
| System stats | `systeminformation` | 3 |
| Folder scanning | Node `fs` + `fast-glob` | 4, 6 |
| Hosts file (admin elevation) | `sudo-prompt` or PowerShell `Start-Process -Verb RunAs` | 5 |
| File browser | `chokidar` for live watch | 6 |
| PostgreSQL | `pg` | 7 |
| MongoDB | `mongodb` | 7 |
| Redis | `ioredis` | 7 |
| SQLite | `better-sqlite3` | 7 |
| Log tailing | `tail-file` or custom `fs.watch` | 8 |
| Built-in terminal | `node-pty` + `xterm.js` | 9 |
| WordPress installer | shelling out to `wp-cli.phar` | 10 |
| Docker integration | `dockerode` | 12 |
| Mail debug | bundle Mailpit binary | 13 |
| Auto updates | `electron-updater` | 16 |

> Each library is added **only in the phase that needs it** — keeps the bundle small until then.

---

## Cross-cutting concerns (apply across every phase)

- **Settings persistence** — every user-configurable value goes through `electron-store` (Phase 2). No hardcoded paths after Phase 2.
- **Error surfacing** — every IPC handler returns `{ success: bool, msg: string, ...data }` so the UI can show consistent toast/alert messages.
- **Admin elevation** — features that need admin (hosts file, ports < 1024, services) prompt with UAC via `sudo-prompt`. Never assume the app is already elevated.
- **Localization-ready** — keep all UI strings in `assets/i18n/en.json` from Phase 4 onward. Easier to translate later.
- **Accessibility** — every button has a real label, every input has an associated `<label>`.
- **No remote calls without consent** — telemetry, version checks, package installs all need explicit user action. LWIS works offline.

---

# Phases

Each phase ships independently. Goal: every phase ends with a usable, testable feature.

---

## Phase 2 — Settings & Persistence (DONE)

**Goal:** every path, port, credential, and theme choice is editable and persists across restarts.

### Features
- [x] Settings page becomes editable (XAMPP paths, MySQL user/pass, ports, theme)
- [x] Settings stored in `%APPDATA%/lwis/config.json` via custom JSON-store
- [x] Window size + position remembered
- [x] Theme toggle (dark / light)
- [x] "Reset to defaults" button
- [x] Auto-detect XAMPP install location on first run (and via button)
- [x] File / folder pickers next to every path field
- [x] MySQL credentials propagate to `mysqladmin shutdown` and `mysql2` connection

### Files
- `settings.js` (new) — JSON-backed store, deep-merge, auto-detect XAMPP root
- `main.js` — replaced hardcoded constants with `settings.get(...)`, window-bounds persistence, settings IPC handlers, file/folder picker IPC
- `db-manager.js` — reads MySQL creds from settings each connect
- `index.html`, `renderer.js` — settings form + light theme + pickers
- `assets/style.css` — light theme variables

### Dependencies
- (none — used built-in `fs` rather than `electron-store` to avoid ESM friction)

### Acceptance
- [x] Change MySQL path → restart app → still works (paths are read fresh from settings on each spawn)
- [x] Toggle light theme → reload → stays light
- [x] Delete `config.json` → app boots with re-detected XAMPP defaults
- [x] Window position remembered between sessions

---

## Phase 3 — Home Dashboard (DONE)

**Goal:** the first thing users see is everything that matters at a glance — like aaPanel's home screen.

### Features
- [x] CPU, RAM, disk usage (live, polled every 2s)
- [x] Service status grid (MySQL, Apache) with inline Start/Stop
- [x] Quick actions: Start All, Stop All, Open htdocs, Open phpMyAdmin, Open localhost, Open config folder
- [x] Recent projects (last 6 from htdocs) with type-detection (Laravel, WordPress, Node, Composer, PHP, Static)
- [x] System info card: hostname, LAN IP, uptime, OS, CPU model, Node + Electron versions
- [x] Sidebar shows LAN IP + status dot

### Files
- `system-stats.js` (new) — `os` + `wmic` for CPU/RAM/disk/uptime, no external deps
- `project-scanner.js` (new) — htdocs scan + project type detection
- `index.html` — `#page-home` section set as default landing
- `renderer.js` — dashboard module, 2s polling loop, recent projects, quick actions
- `main.js` — IPC: `system-stats`, `system-info`, `projects-recent`, `projects-all`, `open-url`, `open-path`
- `assets/style.css` — green accent palette, stat cards, progress bars, quick-action grid, type pills

### Dependencies
- (none — used Node built-ins instead of `systeminformation` to keep bundle small)

### Acceptance
- [x] Stats update without UI freeze (2s poll, CPU delta-based, no blocking)
- [x] Quick action buttons all work (browser opens via `shell.openExternal`, folders via `shell.openPath`)
- [x] Dashboard is the default page on app open

---

## Phase 4 — Projects / Websites Manager (DONE)

**Goal:** every project in `htdocs` shows up as a card with one-click actions — equivalent to aaPanel's Website tab.

### Features
- [x] Auto-scan htdocs (uses `paths.htdocsPath` from Settings)
- [x] Detect project type: Laravel, WordPress, Node, Composer, PHP, Static, Folder
- [x] Project card per folder: name, type icon (color-coded), modified time
- [x] Per-card actions:
  - [x] Open in browser (`http://localhost/<name>`)
  - [x] Open in VS Code (`code <path>` via shell)
  - [x] Open in File Explorer (`shell.openPath`)
  - [x] Open terminal here (Windows Terminal `wt -d`, falls back to `cmd /K`)
  - [x] Project info modal (reads composer.json, package.json, wp-config.php, .env)
- [x] Filter by type, search by name (live), sort by recent / name / type
- [x] Pin favorites to top (persisted in `ui.favorites` setting)
- [x] Run npm scripts directly from info modal (opens new terminal)

### Files
- `project-scanner.js` — added `getProjectInfo()` reading composer/package/wp/.env metadata
- `index.html` — `#page-projects` card grid + project info modal + Projects nav item
- `renderer.js` — projects page state machine, filter/sort, modal renderer with HTML escaping
- `main.js` — IPC: `project-info`, `project-favorites`, `project-favorite-toggle`, `terminal-open`, `vscode-open`, `npm-run`
- `assets/style.css` — project card grid (auto-fill 240px min), color-coded type icons, modal with backdrop blur

### Dependencies
- (none — pure Node `fs` and `child_process`, no `fast-glob` needed for top-level scan)

### Acceptance
- [x] Cards render fast for typical htdocs (top-level only, no recursion)
- [x] Type detection: `artisan` → Laravel, `wp-config.php` → WordPress, `package.json` → Node
- [x] VS Code open works via `code` on PATH
- [x] Pinned projects always show first regardless of sort
- [x] Search + filter + sort compose correctly

---

## Phase 5 — Hosts & Domains (DONE)

**Goal:** add `myapp.test` as a virtual host in 2 clicks.

### Features
- [x] Read & display `C:\Windows\System32\drivers\etc\hosts`
- [x] Add new host entry (UAC prompt via PowerShell `Start-Process -Verb RunAs`)
- [x] Remove host entries (only those in LWIS-managed block — system entries are read-only)
- [x] Apache vhost generator: pick project → enter domain → appends to `httpd-vhosts.conf`
- [x] Detect if `Include conf/extra/httpd-vhosts.conf` is commented out — show warning + one-click enable
- [x] One-click "Set up local domain" wizard: hosts entry + vhost + Apache restart in single flow
- [x] Auto-generates `<projectname>.test` suggestion when project picked
- [x] Apache auto-restart after vhost changes
- [ ] Self-signed cert generator (HTTPS) — deferred to Phase 5.5

### Files
- `elevate.js` (new) — PowerShell UAC wrapper using base64-encoded commands (avoids quoting hell)
- `hosts-manager.js` (new) — parse hosts file, identify LWIS-managed block, atomic rewrite via temp file + elevated copy + `ipconfig /flushdns`
- `vhost-manager.js` (new) — parse `<VirtualHost>` blocks, detect LWIS-managed via marker comments, append/remove vhosts, auto-uncomment include line in httpd.conf
- `index.html` — `#page-domains` with three cards: include warning, quick wizard, vhosts table, hosts table
- `renderer.js` — domains state machine, project dropdown auto-populated from `projects-all`, lazy-load on first nav click
- `main.js` — IPC: `hosts-read/add/remove/set`, `vhosts-read/add/remove/include-status/include-enable`, `apache-restart`, `domain-wizard`
- `assets/style.css` — yellow-tinted include warning card

### Dependencies
- (none — used PowerShell built-in `Start-Process -Verb RunAs` instead of `sudo-prompt`)

### Acceptance
- [x] Add `lwis.test` via wizard → hosts entry + vhost + Apache restart in one UAC prompt
- [x] Vhost outside LWIS-managed block cannot be removed (refuses with error)
- [x] System hosts entries (Microsoft defaults) display as read-only
- [x] Cancel UAC → error surfaces in UI, no partial state on disk

### Known limitations
- Vhost include line auto-enable writes to `httpd.conf` — only works if XAMPP at user-writable path (default `C:\xampp\` is fine)
- DNS flush via `ipconfig /flushdns` runs as part of elevation, but browsers may still cache DNS for the session

---

## Phase 6 — File Browser (2 days)

**Goal:** browse, view, edit small files inside projects without leaving LWIS.

### Features
- [ ] Tree view (left pane) of selected project folder
- [ ] File preview (right pane) — text files in monaco-mini editor, images inline
- [ ] Right-click context menu: open in editor, copy path, rename, delete, new file/folder
- [ ] Live updates via `chokidar` watcher
- [ ] Breadcrumb navigation
- [ ] Quick-jump to known config files (.env, wp-config.php, composer.json)

### Files
- `file-browser.js` (new)
- `index.html` — `#page-files`
- `renderer.js` — tree rendering, monaco loading
- `main.js` — IPC: `fs-list`, `fs-read`, `fs-write`, `fs-rename`, `fs-delete`

### Dependencies
- `chokidar`
- `monaco-editor` (or stick with a simple textarea v1, upgrade later)

### Acceptance
- Open a 5MB log file → no UI freeze
- Edit `.env` and save → file changed on disk
- Delete a file → confirmation prompt, then gone
- Rename folder while watcher is on → tree updates without refresh

---

## Phase 7 — Multi-Database Engine Support (3–4 days)

**Goal:** match the aaPanel database tabs — MySQL, PostgreSQL, MongoDB, Redis, SQLite. SQLServer optional.

### Features
- [ ] Tab bar above the database list: MySQL | PostgreSQL | MongoDB | Redis | SQLite
- [ ] Per-engine connection profile (host, port, user, pass, default DB)
- [ ] Engine-specific browser views:
  - **PostgreSQL**: schemas, tables, rows, query runner
  - **MongoDB**: collections, documents (JSON viewer/editor)
  - **Redis**: keys with type icons, TTL, value editor
  - **SQLite**: file picker → open `.sqlite` file → standard table browser
- [ ] Unified query runner that adapts to active engine
- [ ] Auto-detect installed engines (check common ports / paths)

### Files
- `db-mysql.js` (rename current `db-manager.js`)
- `db-postgres.js`, `db-mongo.js`, `db-redis.js`, `db-sqlite.js` (new)
- `db-router.js` (new) — picks correct adapter based on selected engine
- `index.html`, `renderer.js`, `style.css` — multi-tab UI

### Dependencies
- `pg`, `mongodb`, `ioredis`, `better-sqlite3`

### Acceptance
- Switching tabs takes < 200ms
- Mongo: insert / find / delete document via UI
- Redis: SET / GET / DEL key works
- SQLite: open a Laravel `database.sqlite` and browse `migrations` table

---

## Phase 8 — Logs Viewer (1–2 days)

**Goal:** all service logs in one place with live tail and filtering.

### Features
- [ ] Sources: Apache access, Apache error, MySQL error, MySQL slow query, PHP error
- [ ] Live tail with auto-scroll toggle
- [ ] Filter by level (error / warn / info)
- [ ] Search/grep within current view
- [ ] Pause / resume tail
- [ ] Highlight HTTP 4xx/5xx in Apache access log
- [ ] Open log file location

### Files
- `log-tailer.js` (new) — wraps `fs.watch` + read-from-position
- `index.html` — `#page-logs` with source dropdown + viewer
- `renderer.js`, `main.js`

### Dependencies
- (none new — use Node `fs`)

### Acceptance
- Tail Apache access log → load page → entry appears in viewer within 1s
- Switch source → tail correctly switches, no leaked file handles

---

## Phase 9 — Built-in Terminal (2 days)

**Goal:** open a real terminal inside LWIS, pre-cd'd to a project. Replaces opening a separate cmd window.

### Features
- [ ] xterm.js front-end + node-pty back-end (full PowerShell / cmd / bash)
- [ ] Multiple tabs
- [ ] Per-tab working directory
- [ ] "Open terminal here" from project cards / file browser
- [ ] Persist tab layout across restarts

### Files
- `terminal.js` (new)
- `index.html` — `#page-terminal` with xterm container
- `renderer.js`, `main.js` — pty bridge over IPC

### Dependencies
- `node-pty`, `xterm`, `xterm-addon-fit`

### Acceptance
- `cd <project>` works from "Open terminal here"
- Resize window → terminal reflows
- Run `php artisan serve` → output streams correctly

---

## Phase 10 — WordPress Toolkit (2–3 days)

**Goal:** equivalent to aaPanel's WP Toolkit — install WP, manage installs.

### Features
- [ ] One-click WordPress install: project name → folder → DB name → admin user
  - Downloads latest WP from wordpress.org
  - Creates DB
  - Writes `wp-config.php`
  - Runs the install
- [ ] List existing WP installs (auto-detected from Phase 4 scanner)
- [ ] Per-install actions: change site URL, regenerate salts, reset admin password, install plugin/theme via wp-cli
- [ ] Bundle / detect `wp-cli.phar`

### Files
- `wp-toolkit.js` (new)
- `index.html` — `#page-wp`
- `renderer.js`, `main.js`

### Dependencies
- `wp-cli.phar` shipped with app or downloaded on first use
- `node-fetch` or built-in `fetch`

### Acceptance
- Fresh install completes in under 60s on broadband
- Reset admin password works on existing site
- Install plugin from slug works

---

## Phase 11 — Node Project Runner (1–2 days)

**Goal:** detect Node projects, run their npm scripts from the UI, track running dev servers.

### Features
- [ ] List all `package.json` projects under htdocs (and configurable extra dirs)
- [ ] Show available npm scripts as buttons
- [ ] One-click run / stop
- [ ] Per-project port detection (when dev server announces "listening on :3000")
- [ ] Output streams to a log panel
- [ ] "Open in browser" once port detected

### Files
- `node-runner.js` (new)
- `index.html` — `#page-node`
- `renderer.js`, `main.js`

### Acceptance
- `npm run dev` for a Vite project → port detected → button appears to open
- Stop → process truly killed (no orphans)

---

## Phase 12 — Docker Integration (2 days, optional)

**Goal:** if Docker Desktop is installed, manage containers from LWIS.

### Features
- [ ] Detect Docker daemon
- [ ] List containers + images (running, stopped)
- [ ] Start / stop / restart / remove containers
- [ ] View logs of running container
- [ ] Detect `docker-compose.yml` in projects → up/down buttons

### Files
- `docker.js` (new)
- `index.html` — `#page-docker` (hide if Docker not detected)

### Dependencies
- `dockerode`

### Acceptance
- App still works if Docker is not installed (page shows "Docker not detected")
- Start a stopped container → status updates live

---

## Phase 13 — Mail Debug Server (Mailpit) (1 day)

**Goal:** capture outgoing emails from local PHP / Laravel for inspection — no real SMTP needed.

### Features
- [ ] Bundle Mailpit binary in `bin/mailpit.exe`
- [ ] Start/stop Mailpit from Services page
- [ ] Embedded webview pointing at `localhost:8025` (Mailpit UI)
- [ ] Auto-configure: detect Laravel `.env` files in projects, offer to set `MAIL_*` to Mailpit
- [ ] PHP `php.ini` snippet for `sendmail_path` to Mailpit

### Files
- `mailpit.js` (new)
- `bin/mailpit.exe` (downloaded during build)
- `index.html` — `#page-mail` with webview

### Acceptance
- Send mail from a Laravel app → appears in Mailpit UI within LWIS
- Captured count shows on dashboard

---

## Phase 14 — Security & Monitoring (2 days)

**Goal:** safety nets that catch dumb mistakes.

### Features
- [ ] **Security audit page:**
  - MySQL root has no password? — warn
  - phpMyAdmin reachable from non-localhost? — warn
  - `.env` files committed to git? — scan + warn
  - Apache directory listing enabled? — warn
- [ ] **Monitor page:**
  - Real-time MySQL slow query feed
  - Apache request rate sparkline
  - Top 5 slowest endpoints (parsed from access log)
  - Memory/CPU per service

### Files
- `security-audit.js`, `monitor.js` (new)
- `index.html` — `#page-security`, `#page-monitor`

### Acceptance
- Run audit → list of issues with "fix" button where automatable
- Monitor page updates without lag

---

## Phase 15 — Backup & Restore (1–2 days)

**Goal:** never lose a local DB or project to a bad migration.

### Features
- [ ] Database backup: `mysqldump` per DB → `.sql` file in user-chosen folder
- [ ] Scheduled auto-backup (daily / on app close)
- [ ] Project folder snapshot (tar.gz)
- [ ] Restore from backup with confirmation
- [ ] Backup retention policy (keep last N)

### Files
- `backup.js` (new)
- `index.html` — backup section in Databases page + dedicated Backups page

### Acceptance
- Manual backup of a 100MB DB completes
- Restore overwrites existing DB after confirmation
- Auto-backup on close works without blocking shutdown

---

## Phase 16 — Polish & Distribution (2–3 days)

**Goal:** ship-quality v1.0.

### Features
- [ ] Auto-updater via `electron-updater` + GitHub releases
- [ ] Code-signed installer (or clear instructions if unsigned)
- [ ] Onboarding tour on first run
- [ ] Telemetry (opt-in) — basic crash reports
- [ ] Tray icon: minimize to tray, services keep running
- [ ] Single-instance lock (don't open twice)
- [ ] Crash recovery: if app crashed mid-MySQL-running, run `mysqladmin shutdown` on next boot
- [ ] About dialog with version, license, credits
- [ ] CHANGELOG.md
- [ ] GitHub Actions workflow that builds installer on every tag

### Acceptance
- Tag v1.0 → installer auto-builds + uploads to GitHub releases
- Existing user gets update prompt on next launch
- Tray icon survives close-window action

---

# Suggested execution order

Two parallel tracks (work the top of each, alternate):

**Track A — UX backbone**
1. Phase 2 (Settings) — unlocks everything
2. Phase 3 (Dashboard) — visible payoff
3. Phase 4 (Projects) — biggest daily-use value
4. Phase 5 (Hosts & Domains) — the "wow" feature
5. Phase 9 (Terminal) — major productivity boost

**Track B — Power features**
1. Phase 7 (Multi-DB) — directly mirrors aaPanel
2. Phase 8 (Logs) — debugging gold
3. Phase 10 (WP Toolkit) — broad audience appeal
4. Phase 13 (Mailpit) — Laravel devs love it
5. Phase 11 (Node runner) — modern stack support

**Last:**
- Phase 6 (File Browser) — VS Code does this better, low priority
- Phase 12 (Docker) — only if there's demand
- Phase 14 (Security) — power-user feature
- Phase 15 (Backup) — important but can run via cron-style scheduler late
- Phase 16 (Distribution) — ship v1.0 once Phases 2–5 + 7 + 8 are stable

---

# What would make LWIS *better* than aaPanel for devs

aaPanel is a sysadmin tool. LWIS is a **developer's** tool. We can win by:

- **Project-first navigation** — every action starts from a project, not from a service
- **Framework awareness** — knows the difference between a Laravel app and a WordPress site, offers different actions for each
- **Editor integration** — first-class VS Code integration (already easy via `code` CLI)
- **Git status badges** — show project's branch + dirty state on cards
- **`.env` editor** — edit Laravel `.env` from the UI without breaking syntax
- **Composer / npm runner** — run package commands inline
- **Faster** — native desktop app, not a web page

---

# Open questions (decide before implementing)

- [ ] Hardcode `htdocs` or let users add multiple project roots? (lean: multiple)
- [ ] Bundle PHP/MySQL ourselves like Laragon, or always rely on existing XAMPP? (lean: rely on XAMPP for now)
- [ ] Plugin system for community extensions? (lean: post-v1.0)
- [ ] Cloud sync of settings? (lean: never — local tool)
- [ ] License: MIT vs GPL? (currently MIT — keep)

---

*Last updated: 2026-04-27 — review every 2 weeks, prune completed phases, add discovered work.*
