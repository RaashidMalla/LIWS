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

module.exports = { scanProjects, recentProjects };
