const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

const XAMPP_CANDIDATES = [
  'C:\\xampp',
  'D:\\xampp',
  'E:\\xampp',
  'C:\\Program Files\\xampp',
  'C:\\Program Files (x86)\\xampp'
];

function detectXamppRoot() {
  for (const root of XAMPP_CANDIDATES) {
    if (fs.existsSync(path.join(root, 'mysql', 'bin', 'mysqld.exe'))) return root;
  }
  return 'C:\\xampp';
}

function buildDefaults() {
  const root = detectXamppRoot();
  return {
    paths: {
      xamppRoot:      root,
      mysqlPath:      path.join(root, 'mysql',  'bin',  'mysqld.exe'),
      mysqlIni:       path.join(root, 'mysql',  'bin',  'my.ini'),
      mysqladminPath: path.join(root, 'mysql',  'bin',  'mysqladmin.exe'),
      apachePath:     path.join(root, 'apache', 'bin',  'httpd.exe'),
      apacheConf:     path.join(root, 'apache', 'conf', 'httpd.conf'),
      htdocsPath:     path.join(root, 'htdocs')
    },
    mysql: {
      host:     '127.0.0.1',
      port:     3306,
      user:     'root',
      password: ''
    },
    ui: {
      theme:  'dark',
      window: { width: 1200, height: 780 }
    }
  };
}

let cache      = null;
let configPath = null;

function getConfigPath() {
  if (!configPath) configPath = path.join(app.getPath('userData'), 'config.json');
  return configPath;
}

function deepMerge(a, b) {
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && a[k]) {
      out[k] = deepMerge(a[k], b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

function load() {
  if (cache) return cache;
  const cp       = getConfigPath();
  const defaults = buildDefaults();
  if (fs.existsSync(cp)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cp, 'utf8'));
      cache = deepMerge(defaults, raw);
    } catch (_) {
      cache = defaults;
    }
  } else {
    cache = defaults;
    save();
  }
  return cache;
}

function save() {
  const cp = getConfigPath();
  fs.mkdirSync(path.dirname(cp), { recursive: true });
  fs.writeFileSync(cp, JSON.stringify(cache, null, 2));
}

function get(key) {
  const s = load();
  if (!key) return s;
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), s);
}

function set(key, value) {
  const s    = load();
  const keys = key.split('.');
  let target = s;
  for (let i = 0; i < keys.length - 1; i++) {
    if (target[keys[i]] == null || typeof target[keys[i]] !== 'object') target[keys[i]] = {};
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
  save();
}

function setAll(obj) {
  cache = deepMerge(load(), obj);
  save();
  return cache;
}

function reset() {
  cache = buildDefaults();
  save();
  return cache;
}

function configFilePath() {
  return getConfigPath();
}

module.exports = { load, get, set, setAll, reset, configFilePath };
