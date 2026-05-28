const { spawn } = require('child_process');
const path = require('path');
const logger = require('../config/logger');

const scriptPath = path.resolve(__dirname, '../../scripts/generate_meli_shortlink.js');

const generateShortLink = (productUrl, tag, timeoutMs = 30000) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, productUrl, tag], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let finished = false;

    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });

    const to = setTimeout(() => {
      if (!finished) {
        proc.kill('SIGKILL');
        finished = true;
        reject(new Error('timeout'));
      }
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(to);
      finished = true;
      const m = out.match(/SHORTLINK:\s*(https?:\/\/[^\s]+)/);
      if (m) return resolve(m[1].trim());
      const saved = out.includes('COOKIES_SAVED') || out.includes('COOKIES_LOADED');
      logger.debug('generate_meli_shortlink output:', out, err);
      reject(new Error(`no-shortlink (code ${code})`));
    });
  });
};

module.exports = { generateShortLink };
