const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { elevatedRun } = require('./elevate');

const HOSTS_PATH = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
  : '/etc/hosts';

const BLOCK_BEGIN = '# === BEGIN LWIS managed hosts ===';
const BLOCK_END   = '# === END LWIS managed hosts ===';

function parseHosts(content) {
  const entries = [];
  const lines = content.split(/\r?\n/);
  let inLwis = false;
  for (const line of lines) {
    if (line.includes(BLOCK_BEGIN)) { inLwis = true;  continue; }
    if (line.includes(BLOCK_END))   { inLwis = false; continue; }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(\S+)\s+(\S+)(?:\s+#\s*(.*))?$/);
    if (m) entries.push({ ip: m[1], hostname: m[2], comment: m[3] || '', lwisManaged: inLwis });
  }
  return entries;
}

function readHostsFile() {
  try {
    return fs.readFileSync(HOSTS_PATH, 'utf8');
  } catch (e) {
    return null;
  }
}

function readHosts() {
  const content = readHostsFile();
  if (content === null) return { success: false, msg: 'Cannot read hosts file' };
  return { success: true, content, entries: parseHosts(content), path: HOSTS_PATH };
}

function buildLwisBlock(lwisEntries) {
  if (lwisEntries.length === 0) return '';
  let block = '\n' + BLOCK_BEGIN + '\n';
  for (const e of lwisEntries) {
    const comment = e.comment ? `   # ${e.comment}` : '';
    block += `${e.ip}\t${e.hostname}${comment}\n`;
  }
  block += BLOCK_END + '\n';
  return block;
}

function rewriteContent(originalContent, lwisEntries) {
  const beginIdx = originalContent.indexOf(BLOCK_BEGIN);
  const endIdx   = originalContent.indexOf(BLOCK_END);
  let stripped = originalContent;
  if (beginIdx >= 0 && endIdx > beginIdx) {
    stripped = originalContent.substring(0, beginIdx) +
               originalContent.substring(endIdx + BLOCK_END.length);
  }
  stripped = stripped.replace(/\r?\n\s*\r?\n\s*\r?\n+/g, '\n\n').trimEnd();
  const block = buildLwisBlock(lwisEntries);
  return (stripped + (block ? '\n' + block : '\n')).replace(/\r?\n/g, os.EOL);
}

async function commitHosts(lwisEntries) {
  const current = readHostsFile();
  if (current === null) throw new Error('Cannot read hosts file');
  const updated = rewriteContent(current, lwisEntries);

  const tmpPath = path.join(os.tmpdir(), `lwis-hosts-${Date.now()}.txt`);
  fs.writeFileSync(tmpPath, updated, 'utf8');

  const psCommand = `Copy-Item -LiteralPath '${tmpPath.replace(/'/g, "''")}' -Destination '${HOSTS_PATH.replace(/'/g, "''")}' -Force; Remove-Item -LiteralPath '${tmpPath.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue; ipconfig /flushdns | Out-Null`;

  try {
    await elevatedRun(psCommand);
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

async function addEntry(ip, hostname, comment) {
  if (!ip || !hostname) return { success: false, msg: 'IP and hostname required' };
  const r = readHosts();
  if (!r.success) return r;
  const lwis = r.entries.filter(e => e.lwisManaged);
  if (lwis.some(e => e.hostname.toLowerCase() === hostname.toLowerCase())) {
    return { success: false, msg: `Entry for ${hostname} already exists in this LWIS-managed block` };
  }
  if (r.entries.some(e => !e.lwisManaged && e.hostname.toLowerCase() === hostname.toLowerCase())) {
    return { success: false, msg: `Entry for ${hostname} exists outside the LWIS block — refusing to add a duplicate` };
  }
  lwis.push({ ip, hostname, comment: comment || '' });
  try {
    await commitHosts(lwis);
    return { success: true };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

async function removeEntry(hostname) {
  const r = readHosts();
  if (!r.success) return r;
  const lwis = r.entries.filter(e => e.lwisManaged);
  const target = lwis.find(e => e.hostname.toLowerCase() === hostname.toLowerCase());
  if (!target) {
    return { success: false, msg: 'Entry not found in LWIS-managed block (system entries are read-only)' };
  }
  const remaining = lwis.filter(e => e.hostname.toLowerCase() !== hostname.toLowerCase());
  try {
    await commitHosts(remaining);
    return { success: true };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

async function setEntries(lwisEntries) {
  try {
    await commitHosts(lwisEntries || []);
    return { success: true };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

module.exports = {
  HOSTS_PATH,
  readHosts,
  addEntry,
  removeEntry,
  setEntries
};
