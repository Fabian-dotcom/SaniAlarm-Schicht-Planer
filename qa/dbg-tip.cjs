const pw = require('playwright-core');
(async () => {
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch { browser = await pw.chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }); }
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:3456', { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(() => {
    const lbls = document.querySelectorAll('#summary .stat .lbl').length;
    const cards = document.querySelectorAll('#summary .stat').length;
    let tipErr = '';
    try { attachInfoTips(document); } catch (e) { tipErr = e.message; }
    const tips = document.querySelectorAll('.info-tip').length;
    return { lbls, cards, tips, tipErr };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
