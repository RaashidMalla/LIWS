const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const db = require('./db-manager');
const { createLaravelProject } = require('./laravel');

const MYSQL_PATH       = 'C:\\xampp\\mysql\\bin\\mysqld.exe';
const MYSQL_INI        = 'C:\\xampp\\mysql\\bin\\my.ini';
const MYSQLADMIN_PATH  = 'C:\\xampp\\mysql\\bin\\mysqladmin.exe';
const APACHE_PATH      = 'C:\\xampp\\apache\\bin\\httpd.exe';
const APACHE_CONF      = 'C:\\xampp\\apache\\conf\\httpd.conf';

let mainWindow = null;
let mysqlProc  = null;
let apacheProc = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
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

ipcMain.handle('start-mysql', () => new Promise(resolve => {
  if (mysqlProc) {
    return resolve({ success: true, msg: 'MySQL already running' });
  }
  try {
    mysqlProc = spawn(MYSQL_PATH, [`--defaults-file=${MYSQL_INI}`, '--console'], {
      windowsHide: true
    });
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
  exec(`"${MYSQLADMIN_PATH}" -u root shutdown`, (err, stdout, stderr) => {
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
  if (apacheProc) {
    return resolve({ success: true, msg: 'Apache already running' });
  }
  try {
    apacheProc = spawn(APACHE_PATH, ['-f', APACHE_CONF], { windowsHide: true });
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

ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose folder'
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

app.on('before-quit', () => {
  try {
    exec(`"${MYSQLADMIN_PATH}" -u root shutdown`);
  } catch (_) {}
  try {
    exec('taskkill /F /IM httpd.exe');
  } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(createWindow);
