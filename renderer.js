const { ipcRenderer } = require('electron');

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let activeDb = null;
let activeTable = null;

function showPage(name) {
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${name}`));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
}

$$('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));

function appendLog(target, msg) {
  const el = $(target);
  el.textContent += msg + '\n';
  el.scrollTop = el.scrollHeight;
}

ipcRenderer.on('log', (_e, msg) => appendLog('#log', msg));

$('#btn-clear-log').addEventListener('click', () => $('#log').textContent = '');
$('#btn-clear-laravel-log').addEventListener('click', () => $('#laravel-log').textContent = '');

function setPill(id, running) {
  const pill = $(id);
  if (!pill) return;
  pill.classList.toggle('pill-running', running);
  pill.classList.toggle('pill-stopped', !running);
  pill.textContent = running ? 'Running' : 'Stopped';
}

async function refreshStatus() {
  const s = await ipcRenderer.invoke('status-services');
  setPill('#mysql-pill',       s.mysql);
  setPill('#apache-pill',      s.apache);
  setPill('#home-mysql-pill',  s.mysql);
  setPill('#home-apache-pill', s.apache);
}

$('#btn-start-mysql').addEventListener('click', async () => {
  appendLog('#log', '[ui] starting MySQL…');
  const r = await ipcRenderer.invoke('start-mysql');
  appendLog('#log', `[ui] ${r.msg}`);
  await refreshStatus();
  if (r.success) {
    const c = await ipcRenderer.invoke('db-connect');
    if (!c.success) appendLog('#log', `[db] connect failed: ${c.msg}`);
    else appendLog('#log', '[db] connected');
  }
});

$('#btn-stop-mysql').addEventListener('click', async () => {
  appendLog('#log', '[ui] stopping MySQL safely…');
  const r = await ipcRenderer.invoke('stop-mysql');
  appendLog('#log', `[ui] ${r.msg}`);
  await refreshStatus();
});

$('#btn-start-apache').addEventListener('click', async () => {
  appendLog('#log', '[ui] starting Apache…');
  const r = await ipcRenderer.invoke('start-apache');
  appendLog('#log', `[ui] ${r.msg}`);
  await refreshStatus();
});

$('#btn-stop-apache').addEventListener('click', async () => {
  appendLog('#log', '[ui] stopping Apache…');
  const r = await ipcRenderer.invoke('stop-apache');
  appendLog('#log', `[ui] ${r.msg}`);
  await refreshStatus();
});

async function loadDatabases() {
  $('#db-status').textContent = 'loading…';
  const c = await ipcRenderer.invoke('db-connect');
  if (!c.success) {
    $('#db-status').textContent = `connect failed: ${c.msg}`;
    return;
  }
  try {
    const dbs = await ipcRenderer.invoke('db-list');
    const tbody = $('#db-table tbody');
    tbody.innerHTML = '';
    if (dbs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="muted center">No databases.</td></tr>';
    } else {
      dbs.forEach(name => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${name}</td>
          <td class="t-right">
            <button class="btn btn-small" data-act="view"  data-db="${name}">View Tables</button>
            <button class="btn btn-small btn-danger" data-act="drop" data-db="${name}">Delete</button>
          </td>`;
        tbody.appendChild(tr);
      });
    }
    $('#db-status').textContent = `${dbs.length} database(s)`;
    populateDbSelect(dbs);
  } catch (e) {
    $('#db-status').textContent = `error: ${e.message}`;
  }
}

$('#btn-load-dbs').addEventListener('click', loadDatabases);

$('#btn-create-db').addEventListener('click', async () => {
  const name = $('#new-db-name').value.trim();
  if (!name) return;
  try {
    await ipcRenderer.invoke('db-create', name);
    $('#new-db-name').value = '';
    loadDatabases();
  } catch (e) {
    alert(`Create failed: ${e.message}`);
  }
});

$('#db-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const name = btn.dataset.db;
  if (btn.dataset.act === 'view') {
    activeDb = name;
    $('#active-db').textContent = name;
    await loadTables(name);
    $('#tables-section').classList.remove('hidden');
    $('#rows-section').classList.add('hidden');
  } else if (btn.dataset.act === 'drop') {
    if (!confirm(`Delete database "${name}"? This cannot be undone.`)) return;
    try {
      await ipcRenderer.invoke('db-drop', name);
      loadDatabases();
    } catch (err) {
      alert(`Drop failed: ${err.message}`);
    }
  }
});

async function loadTables(dbName) {
  try {
    const tables = await ipcRenderer.invoke('db-tables', dbName);
    const tbody = $('#tables-table tbody');
    tbody.innerHTML = '';
    if (tables.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="muted center">No tables.</td></tr>';
      return;
    }
    tables.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.name}</td>
        <td>${t.rows ?? 0}</td>
        <td class="t-right">
          <button class="btn btn-small" data-act="rows" data-table="${t.name}">Browse</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    alert(`List tables failed: ${e.message}`);
  }
}

$('#btn-back-dbs').addEventListener('click', () => {
  $('#tables-section').classList.add('hidden');
  $('#rows-section').classList.add('hidden');
});

$('#btn-back-tables').addEventListener('click', () => {
  $('#rows-section').classList.add('hidden');
});

$('#tables-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.dataset.act !== 'rows') return;
  activeTable = btn.dataset.table;
  $('#active-table').textContent = `${activeDb}.${activeTable}`;
  await loadRows();
  $('#rows-section').classList.remove('hidden');
});

async function loadRows() {
  try {
    const data = await ipcRenderer.invoke('db-table-rows', activeDb, activeTable);
    const thead = $('#rows-table thead');
    const tbody = $('#rows-table tbody');
    thead.innerHTML = '<tr>' + data.columns.map(c => `<th>${c}</th>`).join('') + '<th class="t-right">Actions</th></tr>';
    tbody.innerHTML = '';
    if (data.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${data.columns.length + 1}" class="muted center">No rows.</td></tr>`;
      return;
    }
    data.rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id ?? '';
      data.columns.forEach(c => {
        const td = document.createElement('td');
        td.dataset.col = c;
        const v = row[c];
        td.textContent = v === null ? 'NULL' : String(v);
        tr.appendChild(td);
      });
      const actions = document.createElement('td');
      actions.className = 't-right';
      const hasId = row.id !== undefined;
      actions.innerHTML = hasId
        ? `<button class="btn btn-small" data-act="edit">Edit</button>
           <button class="btn btn-small btn-danger" data-act="del">Delete</button>`
        : '<span class="muted small">no id col</span>';
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
  } catch (e) {
    alert(`Load rows failed: ${e.message}`);
  }
}

$('#rows-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const tr = btn.closest('tr');
  const id = tr.dataset.id;

  if (btn.dataset.act === 'del') {
    if (!confirm(`Delete row id=${id}?`)) return;
    try {
      await ipcRenderer.invoke('db-delete-row', activeDb, activeTable, id);
      loadRows();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
    return;
  }

  if (btn.dataset.act === 'edit') {
    Array.from(tr.querySelectorAll('td[data-col]')).forEach(td => {
      if (td.dataset.col === 'id') return;
      const val = td.textContent === 'NULL' ? '' : td.textContent;
      td.innerHTML = `<input class="input cell-input" value="${val.replace(/"/g, '&quot;')}" />`;
    });
    btn.outerHTML = `<button class="btn btn-small btn-primary" data-act="save">Save</button>`;
    return;
  }

  if (btn.dataset.act === 'save') {
    const data = {};
    Array.from(tr.querySelectorAll('td[data-col]')).forEach(td => {
      if (td.dataset.col === 'id') return;
      const inp = td.querySelector('input');
      if (inp) data[td.dataset.col] = inp.value;
    });
    try {
      await ipcRenderer.invoke('db-update-row', activeDb, activeTable, id, data);
      loadRows();
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    }
  }
});

function populateDbSelect(dbs) {
  const sel = $('#query-db');
  const current = sel.value;
  sel.innerHTML = '<option value="">— select database —</option>' +
    dbs.map(n => `<option value="${n}">${n}</option>`).join('');
  if (dbs.includes(current)) sel.value = current;
}

$('#btn-refresh-dbs').addEventListener('click', async () => {
  const c = await ipcRenderer.invoke('db-connect');
  if (!c.success) return alert(`Connect failed: ${c.msg}`);
  const dbs = await ipcRenderer.invoke('db-list');
  populateDbSelect(dbs);
});

$('#btn-run-query').addEventListener('click', async () => {
  const sql = $('#sql-input').value.trim();
  const dbName = $('#query-db').value || null;
  $('#query-error').classList.add('hidden');
  $('#query-success').classList.add('hidden');
  $('#result-table').classList.add('hidden');
  $('#query-empty').classList.add('hidden');
  if (!sql) {
    $('#query-empty').classList.remove('hidden');
    return;
  }
  const r = await ipcRenderer.invoke('db-query', sql, dbName);
  if (!r.success) {
    $('#query-error').textContent = r.msg;
    $('#query-error').classList.remove('hidden');
    return;
  }
  if (r.type === 'write') {
    $('#query-success').textContent = r.message;
    $('#query-success').classList.remove('hidden');
    return;
  }
  const thead = $('#result-table thead');
  const tbody = $('#result-table tbody');
  thead.innerHTML = '<tr>' + r.columns.map(c => `<th>${c}</th>`).join('') + '</tr>';
  tbody.innerHTML = '';
  if (r.rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${r.columns.length}" class="muted center">No rows returned.</td></tr>`;
  } else {
    r.rows.forEach(row => {
      const tr = document.createElement('tr');
      r.columns.forEach(c => {
        const td = document.createElement('td');
        const v = row[c];
        td.textContent = v === null ? 'NULL' : String(v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  $('#result-table').classList.remove('hidden');
});

$('#btn-pick-folder').addEventListener('click', async () => {
  const f = await ipcRenderer.invoke('pick-folder');
  if (f) $('#laravel-path').value = f;
});

$('#btn-create-laravel').addEventListener('click', async () => {
  const name = $('#laravel-name').value.trim();
  const location = $('#laravel-path').value.trim();
  if (!name || !location) return alert('Fill in project name and location');
  $('#laravel-log').textContent = '';
  appendLog('#laravel-log', `Creating ${name} in ${location}…`);
  const tap = (_e, msg) => {
    if (msg.startsWith('[laravel]')) appendLog('#laravel-log', msg.replace('[laravel] ', ''));
  };
  ipcRenderer.on('log', tap);
  const r = await ipcRenderer.invoke('laravel-create', name, location);
  ipcRenderer.removeListener('log', tap);
  if (r.success) appendLog('#laravel-log', `\nDone — ${r.path}`);
  else           appendLog('#laravel-log', `\nFailed — ${r.msg}`);
});

const SETTING_FIELDS = {
  'setting-xamppRoot':      'paths.xamppRoot',
  'setting-mysqlPath':      'paths.mysqlPath',
  'setting-mysqlIni':       'paths.mysqlIni',
  'setting-mysqladminPath': 'paths.mysqladminPath',
  'setting-apachePath':     'paths.apachePath',
  'setting-apacheConf':     'paths.apacheConf',
  'setting-htdocsPath':     'paths.htdocsPath',
  'setting-mysqlHost':      'mysql.host',
  'setting-mysqlPort':      'mysql.port',
  'setting-mysqlUser':      'mysql.user',
  'setting-mysqlPassword':  'mysql.password',
  'setting-theme':          'ui.theme'
};

function getByPath(obj, p) { return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function setByPath(obj, p, value) {
  const keys = p.split('.');
  let t = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!t[keys[i]] || typeof t[keys[i]] !== 'object') t[keys[i]] = {};
    t = t[keys[i]];
  }
  t[keys[keys.length - 1]] = value;
}

function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark',  theme !== 'light');
}

function flashStatus(msg, kind) {
  const el = $('#settings-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = kind === 'error' ? 'var(--red)' : 'var(--green)';
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 2500);
}

async function loadSettingsForm() {
  const s = await ipcRenderer.invoke('settings-get');
  for (const [id, p] of Object.entries(SETTING_FIELDS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = getByPath(s, p);
    el.value = v == null ? '' : v;
  }
  const cp = await ipcRenderer.invoke('settings-path');
  const cpEl = document.getElementById('config-path');
  if (cpEl) cpEl.textContent = cp;
  applyTheme(s.ui && s.ui.theme);
}

function readSettingsForm() {
  const out = {};
  for (const [id, p] of Object.entries(SETTING_FIELDS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    let v = el.value;
    if (id === 'setting-mysqlPort') v = parseInt(v, 10) || 3306;
    setByPath(out, p, v);
  }
  return out;
}

async function saveSettings() {
  const obj = readSettingsForm();
  await ipcRenderer.invoke('settings-save', obj);
  applyTheme(obj.ui && obj.ui.theme);
  flashStatus('Settings saved');
  await ipcRenderer.invoke('db-connect');
}

async function resetSettings() {
  if (!confirm('Reset all settings to defaults? This re-detects XAMPP and clears your MySQL credentials.')) return;
  await ipcRenderer.invoke('settings-reset');
  await loadSettingsForm();
  flashStatus('Settings reset to defaults');
}

$('#btn-save-settings') && $('#btn-save-settings').addEventListener('click', saveSettings);
$('#btn-reset-settings') && $('#btn-reset-settings').addEventListener('click', resetSettings);

$('#setting-theme') && $('#setting-theme').addEventListener('change', e => applyTheme(e.target.value));

$('#btn-detect-xampp') && $('#btn-detect-xampp').addEventListener('click', async () => {
  await ipcRenderer.invoke('settings-reset');
  await loadSettingsForm();
  flashStatus('Auto-detected XAMPP root');
});

document.querySelectorAll('[data-pick]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const fieldId = `setting-${btn.dataset.pick}`;
    const input = document.getElementById(fieldId);
    if (!input) return;
    const channel = btn.dataset.pickType === 'file' ? 'pick-file' : 'pick-folder';
    const filters = btn.dataset.pickType === 'file' ? [{ name: 'Executable / Config', extensions: ['exe', 'ini', 'conf'] }] : null;
    const picked = await ipcRenderer.invoke(channel, input.value || undefined, filters);
    if (picked) input.value = picked;
  });
});

(async () => {
  try { await loadSettingsForm(); } catch (_) {}
})();

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}
function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtRel(ms) {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60)        return `${sec}s ago`;
  if (sec < 3600)      return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400)     return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

async function refreshDashboard() {
  try {
    const s = await ipcRenderer.invoke('system-stats');
    if (!s) return;

    $('#stat-cpu').textContent = s.cpu;
    $('#bar-cpu').style.width  = s.cpu + '%';
    $('#stat-cpu-sub').textContent = `${s.info.cpuCount} cores`;

    const memPct = s.memory.percent;
    $('#stat-mem').textContent = memPct;
    $('#bar-mem').style.width  = memPct + '%';
    $('#stat-mem-sub').textContent = `${fmtBytes(s.memory.used)} / ${fmtBytes(s.memory.total)}`;

    const cdrive = (s.disks || []).find(d => /^c:?$/i.test(d.drive)) || (s.disks || [])[0];
    if (cdrive) {
      $('#stat-disk').textContent = cdrive.percent;
      $('#bar-disk').style.width  = cdrive.percent + '%';
      $('#stat-disk-sub').textContent = `${fmtBytes(cdrive.used)} / ${fmtBytes(cdrive.total)} on ${cdrive.drive}`;
    } else {
      $('#stat-disk-sub').textContent = 'unavailable';
    }

    $('#stat-uptime').textContent = fmtUptime(s.info.uptime);
    $('#stat-host').textContent   = s.info.hostname;

    $('#info-hostname').textContent = s.info.hostname;
    $('#info-lanip').textContent    = s.info.lanIp;
    $('#info-os').textContent       = `${s.info.platform} ${s.info.release} (${s.info.arch})`;
    $('#info-cpu').textContent      = s.info.cpuModel || '—';
    $('#info-node').textContent     = s.info.nodeVersion;
    $('#info-electron').textContent = s.info.electronVer || '—';
    $('#server-ip').textContent     = s.info.lanIp;
  } catch (e) {
    console.error('dashboard refresh failed', e);
  }
}

function applyServicePills(running) {
  setPill('#mysql-pill',       running.mysql);
  setPill('#apache-pill',      running.apache);
  setPill('#home-mysql-pill',  running.mysql);
  setPill('#home-apache-pill', running.apache);
}

async function refreshStatusFull() {
  const s = await ipcRenderer.invoke('status-services');
  applyServicePills(s);
}

async function refreshRecentProjects() {
  const tbody = $('#recent-projects tbody');
  if (!tbody) return;
  try {
    const projects = await ipcRenderer.invoke('projects-recent', 6);
    if (!projects || projects.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted center">No projects in htdocs.</td></tr>';
      return;
    }
    tbody.innerHTML = projects.map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td><span class="type-pill type-${p.type.toLowerCase()}">${p.type}</span></td>
        <td class="muted small">${fmtRel(p.mtime)}</td>
        <td class="t-right">
          <button class="btn btn-small" data-proj-act="browser" data-name="${p.name}">Browser</button>
          <button class="btn btn-small" data-proj-act="folder"  data-path="${p.path.replace(/"/g, '&quot;')}">Folder</button>
          <button class="btn btn-small" data-proj-act="vscode"  data-path="${p.path.replace(/"/g, '&quot;')}">VS Code</button>
        </td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted center">Scan failed: ${e.message}</td></tr>`;
  }
}

$('#recent-projects') && $('#recent-projects').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-proj-act]');
  if (!btn) return;
  const act = btn.dataset.projAct;
  if (act === 'browser') {
    await ipcRenderer.invoke('open-url', `http://localhost/${btn.dataset.name}`);
  } else if (act === 'folder') {
    await ipcRenderer.invoke('open-path', btn.dataset.path);
  } else if (act === 'vscode') {
    await ipcRenderer.invoke('open-path', btn.dataset.path);
  }
});

$('#btn-refresh-projects') && $('#btn-refresh-projects').addEventListener('click', refreshRecentProjects);

$('#btn-start-all') && $('#btn-start-all').addEventListener('click', async () => {
  await ipcRenderer.invoke('start-mysql');
  await ipcRenderer.invoke('start-apache');
  refreshStatusFull();
});
$('#btn-stop-all') && $('#btn-stop-all').addEventListener('click', async () => {
  await ipcRenderer.invoke('stop-mysql');
  await ipcRenderer.invoke('stop-apache');
  refreshStatusFull();
});

document.querySelectorAll('[data-svc]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const channel = `${btn.dataset.act}-${btn.dataset.svc}`;
    await ipcRenderer.invoke(channel);
    refreshStatusFull();
  });
});

document.querySelectorAll('[data-quick]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const action = btn.dataset.quick;
    const s = await ipcRenderer.invoke('settings-get');
    if (action === 'open-localhost') {
      await ipcRenderer.invoke('open-url', 'http://localhost');
    } else if (action === 'open-phpmyadmin') {
      await ipcRenderer.invoke('open-url', 'http://localhost/phpmyadmin');
    } else if (action === 'open-htdocs') {
      await ipcRenderer.invoke('open-path', s.paths.htdocsPath);
    } else if (action === 'open-config') {
      const cp = await ipcRenderer.invoke('settings-path');
      const dir = cp.replace(/[\\/][^\\/]+$/, '');
      await ipcRenderer.invoke('open-path', dir);
    }
  });
});

refreshStatusFull();
refreshDashboard();
refreshRecentProjects();
setInterval(refreshStatusFull, 5000);
setInterval(refreshDashboard, 2000);
