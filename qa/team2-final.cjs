const pw = require('playwright-core');
const t0 = Date.now();
const log = m => console.log(`[${Math.round((Date.now() - t0) / 1000)}s]`, m);
(async () => {
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch { browser = await pw.chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }); }
  log('browser ok');
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:3456', { waitUntil: 'domcontentloaded', timeout: 20000 });
  log('goto ok');
  await page.evaluate(() => {
    upsertMember({ first: 'A', last: 'A', cls: '10-1', ausb: true, springer: false, available: true });
    upsertMember({ first: 'B', last: 'B', cls: '10-1', ausb: false, springer: false, available: true });
    upsertMember({ first: 'C', last: 'C', cls: '9-1', ausb: false, springer: true, available: true });
    linkPartner(m(0), m(1));
    save(); renderAll();
  });
  log('members ok');
  await page.click('#nav [data-tab="stats"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-smode="team"]').click());
  await page.waitForTimeout(200);
  const s1 = await page.evaluate(() => ({ hidden: document.querySelector('#shiftTeamRow').hidden, opts: document.querySelectorAll('#shiftTeam option').length }));
  log(`teamMode: hidden=${s1.hidden} opts=${s1.opts}`);
  if (s1.hidden) { console.error('FAIL team modus'); process.exit(1); }
  await page.evaluate(() => { $('#shiftDeviation').checked = true; $('#shiftDeviation').onchange({ target: $('#shiftDeviation') }); });
  await page.waitForTimeout(200);
  const items = await page.evaluate(() => document.querySelectorAll('#shiftExtraPicker [data-shiftx]').length);
  log('picker items:', items);
  await page.evaluate(() => {
    shiftExtras = [+document.querySelector('#shiftExtraPicker [data-shiftx]').dataset.shiftx];
    $('#addShift').requestSubmit();
  });
  await page.waitForTimeout(400);
  const totals = await page.evaluate(() => JSON.parse(localStorage.getItem('saniteam.v1')).members.map(m => m.total));
  log('totals (Team+1):', totals.join(','));
  if (totals.join() !== '1,1,1') { console.error('FAIL totals'); await browser.close(); process.exit(1); }
  await page.evaluate(() => { shiftDeviation = false; shiftExtras = []; $('#addShift').requestSubmit(); });
  await page.waitForTimeout(400);
  const t2 = await page.evaluate(() => JSON.parse(localStorage.getItem('saniteam.v1')).members.map(m => m.total));
  log('totals (Team only):', t2.join(','));
  if (t2.join() !== '2,2,1') { console.error('FAIL totals2'); await browser.close(); process.exit(1); }
  log('✅ Team-Nachtrag verifiziert');
  await browser.close();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
