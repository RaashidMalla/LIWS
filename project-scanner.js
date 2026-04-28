const fs   = require('fs');
const path = require('path');

const SKIP_FOLDERS = new Set([
  'xampp', 'webalizer', 'tmp', 'forbidden', 'phpmyadmin',
  'dashboard', 'img', 'restricted', 'examples', 'imgs', 'favicon'
]);

function detectType(folder) {
  if (fs.existsSync(path.join(folder, 'artisan')))             return 'Laravel';
  if (fs.existsSync(path.join(folder, 'wp-config.php')))       return 'WordPress';
  if (fs.existsSync(path.join(folder, 'wp-config-sample.php'))) return 'WordPress';
  if (fs.existsSync(path.join(folder, 'package.json')))        return 'Node';
  if (fs.existsSync(path.join(folder, 'composer.json')))       return 'Composer';
  if (fs.existsSync(path.join(folder, 'index.php')))           return 'PHP';
  if (fs.existsSync(path.join(folder, 'index.html')))          return 'Static';
  return 'Folder';
}

function scanProjects(htdocsPath, limit = 100) {
  if (!htdocsPath || !fs.existsSync(htdocsPath)) return [];
  let entries;
  try {
    entries = fs.readdirSync(htdocsPath, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    if (SKIP_FOLDERS.has(e.name.toLowerCase())) continue;
    const full = path.join(htdocsPath, e.name);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }
    out.push({
      name:  e.name,
      path:  full,
      mtime: stat.mtimeMs,
      type:  detectType(full)
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

function recentProjects(htdocsPath, n = 5) {
  return scanProjects(htdocsPath, n);
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (_) { return null; }
}

function readEnv(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
  } catch (_) { return null; }
}

function getProjectInfo(folder) {
  if (!fs.existsSync(folder)) return { exists: false };
  const info = { exists: true, path: folder, name: path.basename(folder) };
  try { info.mtime = fs.statSync(folder).mtimeMs; } catch (_) {}
  info.type = detectType(folder);

  const composer = readJsonSafe(path.join(folder, 'composer.json'));
  if (composer) {
    info.composer = {
      name:        composer.name,
      description: composer.description,
      type:        composer.type,
      version:     composer.version,
      require:     Object.keys(composer.require     || {}).slice(0, 12),
      requireDev:  Object.keys(composer['require-dev'] || {}).slice(0, 12)
    };
  }

  const pkg = readJsonSafe(path.join(folder, 'package.json'));
  if (pkg) {
    info.package = {
      name:         pkg.name,
      version:      pkg.version,
      description:  pkg.description,
      scripts:      pkg.scripts || {},
      dependencies: Object.keys(pkg.dependencies    || {}).slice(0, 12),
      devDeps:      Object.keys(pkg.devDependencies || {}).slice(0, 12)
    };
  }

  const wpConfig = path.join(folder, 'wp-config.php');
  if (fs.existsSync(wpConfig)) {
    try {
      const wp = fs.readFileSync(wpConfig, 'utf8');
      const dbName     = (wp.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]/)     || [])[1];
      const dbUser     = (wp.match(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"]([^'"]+)['"]/)     || [])[1];
      const dbHost     = (wp.match(/define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"]([^'"]+)['"]/)     || [])[1];
      const tablePref  = (wp.match(/\$table_prefix\s*=\s*['"]([^'"]+)['"]/)                    || [])[1];
      info.wordpress = { dbName, dbUser, dbHost, tablePrefix: tablePref };
    } catch (_) {}
  }

  const env = readEnv(path.join(folder, '.env'));
  if (env) {
    info.env = {
      appName:      env.APP_NAME,
      appUrl:       env.APP_URL,
      appEnv:       env.APP_ENV,
      dbConnection: env.DB_CONNECTION,
      dbHost:       env.DB_HOST,
      dbDatabase:   env.DB_DATABASE,
      dbUsername:   env.DB_USERNAME
    };
  }

  return info;
}

module.exports = { scanProjects, recentProjects, detectType, getProjectInfo };
