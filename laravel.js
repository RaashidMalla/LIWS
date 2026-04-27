const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function createLaravelProject(name, location, onLog) {
  return new Promise(resolve => {
    if (!name || !location) {
      return resolve({ success: false, msg: 'Project name and location are required' });
    }
    if (!fs.existsSync(location)) {
      return resolve({ success: false, msg: `Folder does not exist: ${location}` });
    }

    const target = path.join(location, name);
    if (fs.existsSync(target)) {
      return resolve({ success: false, msg: `Folder already exists: ${target}` });
    }

    onLog(`Starting: composer create-project laravel/laravel ${name}`);
    onLog(`Working dir: ${location}`);

    const proc = spawn('composer.bat', ['create-project', 'laravel/laravel', name], {
      cwd: location,
      shell: true,
      windowsHide: true
    });

    proc.stdout.on('data', d => onLog(d.toString().trim()));
    proc.stderr.on('data', d => onLog(d.toString().trim()));

    proc.on('error', err => {
      onLog(`error: ${err.message}`);
      resolve({ success: false, msg: err.message });
    });

    proc.on('close', code => {
      if (code === 0) {
        onLog(`Done. Project ready at ${target}`);
        resolve({ success: true, path: target });
      } else {
        onLog(`composer exited with code ${code}`);
        resolve({ success: false, msg: `composer exited with code ${code}` });
      }
    });
  });
}

module.exports = { createLaravelProject };
