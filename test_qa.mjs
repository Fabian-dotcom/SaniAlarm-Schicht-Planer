import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png'
};

function startServer(port = 4567) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let file = req.url.split('?')[0];
      if (file === '/' || file === '') file = '/index.html';
      const filePath = path.join(__dirname, file);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export default async function run(page, ui) {
  const server = await startServer(4567);
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[error] ${e.message} ${e.stack}`));

  try {
    await page.goto('http://127.0.0.1:4567/');
    await page.waitForTimeout(500);

    // Jetzt zur Kartei gehen
    await page.evaluate(() => go('members'));
    await page.waitForTimeout(200);

    // Klick auf "Mitglied hinzufügen"
    const addMemberResult = await page.evaluate(() => {
      const btn = document.querySelector('#addMember');
      if (!btn) return { error: '#addMember not found' };
      btn.click();
      const modal = document.querySelector('#modal');
      return {
        clicked: true,
        modalOpen: modal ? modal.open : false,
        modalTitle: document.querySelector('#mTitle')?.textContent,
        hasFirstInput: !!document.querySelector('#mFirst'),
        hasClsInput: !!document.querySelector('#mCls')
      };
    });

    // Klick auf "QR-Code Einladung"
    const qrInviteResult = await page.evaluate(() => {
      const btn = document.querySelector('#memQrInvite');
      if (!btn) return { error: '#memQrInvite not found' };
      btn.click();
      const modal = document.querySelector('#modal');
      return {
        clicked: true,
        modalOpen: modal ? modal.open : false,
        modalTitle: document.querySelector('#mTitle')?.textContent
      };
    });

    return { logs, addMemberResult, qrInviteResult };
  } finally {
    server.close();
  }
}
