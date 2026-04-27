# LIWS — Local Internet Web Server

A custom desktop development environment for **XAMPP** built with Electron + Node.js + MySQL.
Like XAMPP Control Panel — but with a modern dark UI, a built-in database browser, a SQL query
runner, a Laravel project creator, and **safe MySQL shutdown that prevents InnoDB corruption**
when your laptop force-closes or loses power.

---

## Why LIWS?

XAMPP is great until the day you slam your laptop shut and MySQL refuses to start. The InnoDB
log files get corrupted because XAMPP kills MySQL with `taskkill /F` instead of asking it to
shut down cleanly. The "fix" is usually deleting `ib_logfile0` / `ib_logfile1` (risky) or
reinstalling XAMPP (annoying).

**LIWS solves this by always shutting MySQL down with `mysqladmin shutdown`** — including when
Windows itself shuts down. That tells MySQL to flush all writes, mark the log clean, and close
properly. No more corruption.

| Feature                      | XAMPP                    | LIWS                          |
| ---------------------------- | ------------------------ | ----------------------------- |
| Safe shutdown on close       | No — corrupts often      | Yes — always safe             |
| Modern UI                    | Old/dated                | Custom dark UI                |
| Built-in Laravel creator     | No                       | Yes — one click               |
| Visual DB manager            | phpMyAdmin (browser)     | Built-in desktop              |
| SQL query runner             | phpMyAdmin only          | Built-in with results table   |
| Customizable                 | No                       | 100% — your code              |

---

## Features (current)

### Services
- Start / Stop **MySQL** (uses XAMPP's `mysqld.exe` with `--defaults-file=my.ini`)
- Start / Stop **Apache** (uses XAMPP's `httpd.exe` with `-f httpd.conf`)
- Live status pills (Running / Stopped) refreshed every 5 seconds
- Live log tail showing service stdout/stderr

### Safe Shutdown
- `before-quit` handler runs `mysqladmin -u root shutdown` every time the app closes
- Triggers on: window close, Alt+F4, Windows shutdown signal, app quit
- Also kills `httpd.exe` cleanly

### Database Manager
- List all databases
- Create / Drop databases
- Browse tables (with row counts from `information_schema`)
- Browse rows (`SELECT * LIMIT 100`)
- Inline edit + delete rows (tables with an `id` primary key)

### SQL Query Runner
- Free-form SQL textarea
- Per-query database selector
- Auto-renders result tables for `SELECT`
- Shows affected-rows for `INSERT` / `UPDATE` / `DELETE`
- Red error panel for syntax / permission errors

### Laravel Project Creator
- Pick name + folder (with native folder picker)
- Runs `composer create-project laravel/laravel <name>` in the chosen directory
- Streams stdout/stderr to a live build log
- Shows path on success

---

## Tech Stack

| Tech            | Version | Role                            |
| --------------- | ------- | ------------------------------- |
| Electron        | 29.x    | Desktop shell                   |
| Node.js         | 20+     | Main process                    |
| mysql2          | 3.9.x   | MySQL driver (async)            |
| HTML/CSS/JS     | vanilla | UI (no framework)               |
| electron-builder| 24.x    | Windows .exe / NSIS installer   |

---

## Project Structure

```
LWIS/
├── main.js            Electron main process — IPC, service control, safe shutdown
├── renderer.js        UI logic — nav, services, DB browser, query runner, Laravel
├── db-manager.js      mysql2 wrapper — list/create/drop/query/browse/edit/delete
├── laravel.js         composer create-project runner with streaming logs
├── index.html         5 pages: Services, Databases, SQL Query, Laravel, Settings
├── assets/
│   ├── style.css      Dark theme (slate + blue accent)
│   └── icon.png       App icon (256x256, add your own)
├── package.json       deps + electron-builder config
└── .gitignore
```

---

## Requirements

- **Windows 10 / 11**
- **XAMPP** installed at `C:\xampp` (or update the paths in [main.js](main.js#L7-L11))
- **Node.js 20+** and npm
- **Composer** on PATH (only if you use the Laravel creator)

---

## Install & Run

```bash
git clone https://github.com/RaashidMalla/LIWS.git
cd LIWS
npm install
npm start
```

If XAMPP Control Panel is currently running MySQL or Apache, stop them there first or you'll
get a port conflict (MySQL 3306, Apache 80/443).

---

## Build a Windows installer

```bash
npm run build
```

Produces an NSIS installer in `dist/`. Add an icon at `assets/icon.png` (256x256 PNG) before
building or `electron-builder` will fall back to the default Electron icon.

---

## How it works (architecture)

Electron has two processes:

- **Main (`main.js`)** — Node.js. Spawns `mysqld.exe` and `httpd.exe`, runs `mysqladmin
  shutdown`, talks to MySQL through `mysql2`, runs `composer.bat`. Has filesystem and shell
  access.
- **Renderer (`index.html` + `renderer.js`)** — Chromium window. UI only.

They talk over **IPC**:

```
[ Click Start MySQL ]
        ↓
renderer.js  ── ipcRenderer.invoke('start-mysql') ──→  main.js
                                                          ↓
                                                spawn(mysqld.exe, [...])
                                                          ↓
        ←──── { success: true, msg: 'MySQL started' } ────
        ↓
[ Pill turns green ]
```

The safe shutdown is a single `app.on('before-quit', ...)` handler — that's the whole trick.

---

## Roadmap

Things planned / in flight (this is a living list):

- [ ] System tray icon — keep services running while window is closed
- [ ] Auto-start LIWS on Windows boot
- [ ] PHP version switcher (multiple `php.exe` versions)
- [ ] Hosts file manager — add/remove `myapp.test` entries automatically
- [ ] Port conflict detector — warn before starting if 3306 / 80 are in use
- [ ] Database import / export (`.sql` dump support)
- [ ] Project list — scan `C:\xampp\htdocs` and show open-in-browser / open-in-VSCode buttons
- [ ] Light / dark theme toggle
- [ ] Settings page — editable paths, ports, MySQL credentials
- [ ] Query history (recent SQL statements)
- [ ] Schema viewer — column types, indexes, foreign keys
- [ ] Run as a Windows service (optional)
- [ ] Auto-update via electron-updater

---

## License

MIT
