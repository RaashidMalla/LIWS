const fs       = require('fs');
const path     = require('path');
const settings = require('./settings');

const BLOCK_BEGIN = '# === BEGIN LWIS managed vhosts ===';
const BLOCK_END   = '# === END LWIS managed vhosts ===';

function vhostsConfPath() {
  const apacheConf = settings.get('paths.apacheConf');
  if (!apacheConf) return null;
  return path.join(path.dirname(apacheConf), 'extra', 'httpd-vhosts.conf');
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (_) { return null; }
}

function isInLwisBlock(content, blockStartIdx) {
  const beginIdx = content.lastIndexOf(BLOCK_BEGIN, blockStartIdx);
  const endIdx   = content.lastIndexOf(BLOCK_END,   blockStartIdx);
  return beginIdx >= 0 && (endIdx < beginIdx || endIdx === -1);
}

function parseVhosts(content) {
  const entries = [];
  const re = /<VirtualHost\b[^>]*>([\s\S]*?)<\/VirtualHost>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const block      = m[1];
    const sn         = block.match(/ServerName\s+(\S+)/i);
    const dr         = block.match(/DocumentRoot\s+["']?([^"'\r\n]+)["']?/i);
    const portMatch  = m[0].match(/<VirtualHost\s+\*?:?(\d+)/i);
    entries.push({
      domain:     sn ? sn[1] : '',
      docRoot:    dr ? dr[1].trim() : '',
      port:       portMatch ? portMatch[1] : '80',
      lwisManaged: isInLwisBlock(content, m.index)
    });
  }
  return entries;
}

function readVhosts() {
  const p = vhostsConfPath();
  if (!p) return { success: false, msg: 'Apache config path not set' };
  const content = readFileSafe(p);
  if (content === null) {
    return { success: false, msg: `httpd-vhosts.conf not found at ${p}`, path: p };
  }
  return { success: true, path: p, content, entries: parseVhosts(content) };
}

function isVhostsIncludeEnabled() {
  const httpdConf = settings.get('paths.apacheConf');
  if (!httpdConf) return { ok: false, msg: 'Apache config path not set' };
  const content = readFileSafe(httpdConf);
  if (content === null) return { ok: false, msg: 'Cannot read httpd.conf' };
  const enabled    = /^\s*Include\s+conf\/extra\/httpd-vhosts\.conf/m.test(content);
  const commented  = /^\s*#\s*Include\s+conf\/extra\/httpd-vhosts\.conf/m.test(content);
  return { ok: true, enabled, commented, httpdConf };
}

function ensureVhostsEnabled() {
  const status = isVhostsIncludeEnabled();
  if (!status.ok) return { success: false, msg: status.msg };
  if (status.enabled) return { success: true, alreadyEnabled: true };
  if (!status.commented) return { success: false, msg: 'No vhost include line found in httpd.conf' };
  let content = readFileSafe(status.httpdConf);
  content = content.replace(
    /^([ \t]*)#\s*Include\s+conf\/extra\/httpd-vhosts\.conf/m,
    '$1Include conf/extra/httpd-vhosts.conf'
  );
  fs.writeFileSync(status.httpdConf, content, 'utf8');
  return { success: true, enabled: true };
}

function generateVhostBlock(domain, docRoot, port = 80) {
  const root = docRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return `<VirtualHost *:${port}>
    ServerName ${domain}
    ServerAlias www.${domain}
    DocumentRoot "${root}"
    <Directory "${root}">
        Options Indexes FollowSymLinks Includes ExecCGI
        AllowOverride All
        Require all granted
    </Directory>
    ErrorLog "logs/${domain}-error.log"
    CustomLog "logs/${domain}-access.log" combined
</VirtualHost>`;
}

function ensureLwisBlock(content) {
  if (content.includes(BLOCK_BEGIN) && content.includes(BLOCK_END)) return content;
  const trailer = content.endsWith('\n') ? '' : '\n';
  return content + trailer + '\n' + BLOCK_BEGIN + '\n\n' + BLOCK_END + '\n';
}

function addVhost(domain, docRoot, port = 80) {
  const r = readVhosts();
  if (!r.success) return r;
  if (r.entries.some(e => e.domain.toLowerCase() === domain.toLowerCase())) {
    return { success: false, msg: `vhost for ${domain} already exists` };
  }

  let content = ensureLwisBlock(r.content);
  const block = generateVhostBlock(domain, docRoot, port);
  const endIdx = content.indexOf(BLOCK_END);
  content = content.substring(0, endIdx).trimEnd() + '\n\n' + block + '\n\n' + content.substring(endIdx);

  fs.writeFileSync(r.path, content, 'utf8');
  return { success: true, path: r.path };
}

function removeVhost(domain) {
  const r = readVhosts();
  if (!r.success) return r;
  let content = r.content;
  const re = /<VirtualHost\b[^>]*>([\s\S]*?)<\/VirtualHost>/gi;
  let m;
  let target = null;
  while ((m = re.exec(content)) !== null) {
    const sn = m[1].match(/ServerName\s+(\S+)/i);
    if (sn && sn[1].toLowerCase() === domain.toLowerCase()) {
      if (!isInLwisBlock(content, m.index)) {
        return { success: false, msg: 'vhost is outside LWIS-managed block; refusing to delete' };
      }
      target = { start: m.index, end: m.index + m[0].length };
      break;
    }
  }
  if (!target) return { success: false, msg: 'vhost not found' };

  content = content.substring(0, target.start).trimEnd() + '\n\n' + content.substring(target.end).trimStart();
  content = content.replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(r.path, content, 'utf8');
  return { success: true };
}

module.exports = {
  vhostsConfPath,
  readVhosts,
  isVhostsIncludeEnabled,
  ensureVhostsEnabled,
  addVhost,
  removeVhost,
  generateVhostBlock
};
