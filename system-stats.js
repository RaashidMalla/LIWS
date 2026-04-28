const os   = require('os');
const { exec } = require('child_process');

let lastCpuMeasure = null;

function getCpuUsage() {
  const cpus = os.cpus();
  let total = 0, idle = 0;
  for (const cpu of cpus) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  if (!lastCpuMeasure) {
    lastCpuMeasure = { total, idle };
    return 0;
  }
  const totalDelta = total - lastCpuMeasure.total;
  const idleDelta  = idle - lastCpuMeasure.idle;
  lastCpuMeasure = { total, idle };
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - (idleDelta / totalDelta) * 100)));
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  return {
    total,
    free,
    used,
    percent: total > 0 ? Math.round((used / total) * 100) : 0
  };
}

function getDiskUsage() {
  return new Promise(resolve => {
    exec(
      'wmic logicaldisk where DriveType=3 get Caption,Size,FreeSpace /format:csv',
      { windowsHide: true },
      (err, stdout) => {
        if (err) return resolve([]);
        const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const out = [];
        for (const line of lines) {
          if (!line.includes(',')) continue;
          if (line.toLowerCase().startsWith('node,')) continue;
          const parts = line.split(',');
          if (parts.length < 4) continue;
          const caption   = parts[1];
          const freespace = parseInt(parts[2], 10);
          const size      = parseInt(parts[3], 10);
          if (!caption || isNaN(size) || isNaN(freespace) || size === 0) continue;
          const used = size - freespace;
          out.push({
            drive:   caption,
            total:   size,
            free:    freespace,
            used,
            percent: Math.round((used / size) * 100)
          });
        }
        resolve(out);
      }
    );
  });
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const i of nets[name]) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

function getSystemInfo() {
  return {
    hostname:    os.hostname(),
    platform:    os.platform(),
    release:     os.release(),
    arch:        os.arch(),
    uptime:      os.uptime(),
    nodeVersion: process.versions.node,
    electronVer: process.versions.electron,
    cpuModel:    os.cpus()[0] && os.cpus()[0].model,
    cpuCount:    os.cpus().length,
    lanIp:       getLanIp()
  };
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function getAllStats() {
  return {
    cpu:    getCpuUsage(),
    memory: getMemoryUsage(),
    disks:  await getDiskUsage(),
    info:   getSystemInfo()
  };
}

module.exports = {
  getCpuUsage,
  getMemoryUsage,
  getDiskUsage,
  getSystemInfo,
  getLanIp,
  getAllStats,
  formatBytes,
  formatUptime
};
