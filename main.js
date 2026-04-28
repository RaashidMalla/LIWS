const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const settings = require('./settings');
const db = require('./db-manager');
const { createLaravelProject } = require('./laravel');
const stats = require('./system-stats');
const { scanProjects, recentProjects, getProjectInfo } = require('./project-scanner');

let mainWindow = null;
let mysqlProc  = null;
let apacheProc = null;

function createWindow() {
  const w = settings.get('ui.window') || {};
  const opts = {
    width:    w.width  || 1200,
    height:   w.height || 780,
    minWidth: 980, minHeight: 620,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  };
  if (Number.isFinite(w.x)) opts.x = w.x;
  if (Number.isFinite(w.y)) opts.y = w.y;

  mainWindow = new BrowserWindow(opts);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
    settings.set('ui.window', mainWindow.getBounds());
  };
  mainWindow.on('resized', saveBounds);
  mainWindow.on('moved',   saveBounds);
}

function sendLog(msg) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', `[${new Date().toLocaleTimeString()}] ${msg}`);
  }
}

function isProcessRunning(imageName) {
  return new Promise(resolve => {
    exec(`tasklist /FI "IMAGENAME eq ${imageName}" /NH`, (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes(imageName.toLowerCase()));
    });
  });
}

function mysqladminCmd(action) {
  const bin  = settings.get('paths.mysqladminPath');
  const user = settings.get('mysql.user') || 'root';
  const pass = settings.get('mysql.password') || '';
  const passArg = pass ? ` -p"${pass.replace(/"/g, '\\"')}"` : '';
  return `"${bin}" -u ${user}${passArg} ${action}`;
}

ipcMain.handle('start-mysql', () => new Promise(resolve => {
  if (mysqlProc) return resolve({ success: true, msg: 'MySQL already running' });
  const p = settings.get('paths');
  try {
    mysqlProc = spawn(p.mysqlPath, [`--defaults-file=${p.mysqlIni}`, '--console'], { windowsHide: true });
    mysqlProc.stdout.on('data', d => sendLog(`[mysql] ${d.toString().trim()}`));
    mysqlProc.stderr.on('data', d => sendLog(`[mysql] ${d.toString().trim()}`));
    mysqlProc.on('error', err => {
      sendLog(`[mysql] error: ${err.message}`);
      mysqlProc = null;
      resolve({ success: false, msg: err.message });
    });
    mysqlProc.on('exit', code => {
      sendLog(`[mysql] exited with code ${code}`);
      mysqlProc = null;
    });
    setTimeout(() => resolve({ success: true, msg: 'MySQL started' }), 2500);
  } catch (e) {
    resolve({ success: false, msg: e.message });
  }
}));

ipcMain.handle('stop-mysql', () => new Promise(resolve => {
  exec(mysqladminCmd('shutdown'), (err, _stdout, stderr) => {
    if (err) {
      sendLog(`[mysql] safe shutdown failed: ${stderr || err.message}`);
      return resolve({ success: false, msg: stderr || err.message });
    }
    mysqlProc = null;
    sendLog('[mysql] safely stopped');
    resolve({ success: true, msg: 'MySQL stopped safely' });
  });
}));

ipcMain.handle('start-apache', () => new Promise(resolve => {
  if (apacheProc) return resolve({ success: true, msg: 'Apache already running' });
  const p = settings.get('paths');
  try {
    apacheProc = spawn(p.apachePath, ['-f', p.apacheConf], { windowsHide: true });
    apacheProc.stdout.on('data', d => sendLog(`[apache] ${d.toString().trim()}`));
    apacheProc.stderr.on('data', d => sendLog(`[apache] ${d.toString().trim()}`));
    apacheProc.on('error', err => {
      sendLog(`[apache] error: ${err.message}`);
      apacheProc = null;
      resolve({ success: false, msg: err.message });
    });
    apacheProc.on('exit', code => {
      sendLog(`[apache] exited with code ${code}`);
      apacheProc = null;
    });
    setTimeout(() => resolve({ success: true, msg: 'Apache started' }), 1500);
  } catch (e) {
    resolve({ success: false, msg: e.message });
  }
}));

ipcMain.handle('stop-apache', () => new Promise(resolve => {
  exec('taskkill /F /IM httpd.exe', err => {
    apacheProc = null;
    if (err) {
      sendLog(`[apache] stop failed: ${err.message}`);
      return resolve({ success: false, msg: err.message });
    }
    sendLog('[apache] stopped');
    resolve({ success: true, msg: 'Apache stopped' });
  });
}));

ipcMain.handle('status-services', async () => ({
  mysql:  await isProcessRunning('mysqld.exe'),
  apache: await isProcessRunning('httpd.exe')
}));

ipcMain.handle('settings-get',    ()         => settings.load());
ipcMain.handle('settings-save',   (_e, obj)  => settings.setAll(obj));
ipcMain.handle('settings-reset',  ()         => settings.reset());
ipcMain.handle('settings-path',   ()         => settings.configFilePath());

ipcMain.handle('system-stats',    ()         => stats.getAllStats());
ipcMain.handle('system-info',     ()         => stats.getSystemInfo());

ipcMain.handle('projects-recent', (_e, n)    => recentProjects(settings.get('paths.htdocsPath'), n || 5));
ipcMain.handle('projects-all',    ()         => scanProjects(settings.get('paths.htdocsPath')));
ipcMain.handle('project-info',    (_e, p)    => getProjectInfo(p));

ipcMain.handle('project-favorites',         () => settings.get('ui.favorites') || []);
ipcMain.handle('project-favorite-toggle',   (_e, name) => {
  const favs = settings.get('ui.favorites') || [];
  const idx  = favs.indexOf(name);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(name);
  settings.set('ui.favorites', favs);
  return favs;
});

ipcMain.handle('open-url',  (_e, url) => shell.openExternal(url));
ipcMain.handle('open-path', (_e, p)   => shell.openPath(p));

ipcMain.handle('terminal-open', (_e, p) => new Promise(resolve => {
  const wt = spawn('wt', ['-d', p], { detached: true, stdio: 'ignore' });
  wt.on('error', () => {
    spawn('cmd', ['/K', `cd /d "${p}"`], { detached: true, stdio: 'ignore', shell: true }).unref();
    resolve({ success: true, fallback: 'cmd' });
  });
  wt.on('spawn', () => { wt.unref(); resolve({ success: true }); });
}));

ipcMain.handle('vscode-open', (_e, p) => new Promise(resolve => {
  const proc = spawn('code', [p], { detached: true, stdio: 'ignore', shell: true });
  proc.on('error', err => resolve({ success: false, msg: err.message }));
  proc.on('spawn', () => { proc.unref(); resolve({ success: true }); });
}));

ipcMain.handle('npm-run', (_e, cwd, script) => new Promise(resolve => {
  const proc = spawn('cmd', ['/K', `cd /d "${cwd}" && npm run ${script}`], { detached: true, stdio: 'ignore', shell: true });
  proc.on('error', err => resolve({ success: false, msg: err.message }));
  proc.on('spawn', () => { proc.unref(); resolve({ success: true }); });
}));

ipcMain.handle('db-connect',         ()                  => db.connectDB());
ipcMain.handle('db-list',            ()                  => db.listDatabases());
ipcMain.handle('db-tables',          (e, name)           => db.listTables(name));
ipcMain.handle('db-create',          (e, name)           => db.createDatabase(name));
ipcMain.handle('db-drop',            (e, name)           => db.dropDatabase(name));
ipcMain.handle('db-query',           (e, sql, dbName)    => db.runQuery(sql, dbName));
ipcMain.handle('db-table-rows',      (e, dbName, table)  => db.getTableRows(dbName, table));
ipcMain.handle('db-update-row',      (e, dbName, table, id, data) => db.updateRow(dbName, table, id, data));
ipcMain.handle('db-delete-row',      (e, dbName, table, id)       => db.deleteRow(dbName, table, id));

ipcMain.handle('laravel-create', (e, name, location) =>
  createLaravelProject(name, location, msg => sendLog(`[laravel] ${msg}`))
);

ipcMain.handle('pick-folder', async (_e, defaultPath) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose folder',
    defaultPath
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('pick-file', async (_e, defaultPath, filters) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Choose file',
    defaultPath,
    filters: filters || []
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

app.on('before-quit', () => {
  try { exec(mysqladminCmd('shutdown')); } catch (_) {}
  try { exec('taskkill /F /IM httpd.exe'); } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(createWindow);
