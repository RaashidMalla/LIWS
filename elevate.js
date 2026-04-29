const { spawn } = require('child_process');

function elevatedRun(psCommand) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(psCommand, 'utf16le').toString('base64');
    const wrapper = `try {
  Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}')
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
exit 0`;

    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', wrapper], {
      windowsHide: true
    });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => reject(err));
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        const msg = stderr.trim() || `Elevation failed (code ${code})`;
        if (/canceled by the user|operation was canceled/i.test(stderr)) {
          reject(new Error('Cancelled by user (UAC denied)'));
        } else {
          reject(new Error(msg));
        }
      }
    });
  });
}

module.exports = { elevatedRun };
