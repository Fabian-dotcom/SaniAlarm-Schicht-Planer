/**
 * QA-Browser-Test: Export-Buttons (.sani-Formate), Stufe/Klasse-Logik und
 * "Generell verhindert"-Sperrtage im Desktop-Webapp.
 *
 * Ausfuehren:  NODE_PATH=".../node_modules" node qa/browser-export-test.js
 */
const fs = require('fs');

let pw;
try { pw = require('playwright-core'); } catch { try { pw = require('playwright'); } catch {} }
if (!pw) { console.error('playwright(-core) nicht verfuegbar.'); process.exit(2); }

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3456';

const EXPORT_BUTTONS = [
  { id: '#bkExport', ext: '.saniteam' },
  { id: '#bkExportPlan', ext: '.saniplan' },
  { id: '#bkExportLog', ext: '.sanilog' },
  { id: '#bkExportBlocks', ext: '.saniblocks' },
  { id: '#bkExportMembers', ext: '.saniteam' },
];

(async () => {
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch {
    for (const exe of [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ]) {
      if (fs.existsSync(exe)) {
        browser = await pw.chromium.launch({ headless: true, executablePath: exe });
        break;
      }
    }
  }
  if (!browser) { console.error('Kein Chromium/Edge/Brave gefunden'); process.exit(2); }

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 1) Mitglied ueber neue Stufe/Klasse-Dropdowns anlegen
  await page.click('#nav [data-tab="members"]');
  await page.click('#addMember');
  await page.waitForSelector('#mFirst', { state: 'visible' });
  await page.fill('#mFirst', 'Test');
  await page.fill('#mLast', 'Person');
  await page.selectOption('#mStufe', '10');
  if (!(await page.$eval('#mKlasseLabel', el => !el.hidden))) {
    console.error('Klasse-Feld sollte bei Stufe 10 sichtbar sein'); process.exit(1);
  }
  await page.selectOption('#mKlasse', '2');
  await page.selectOption('#mStufe', 'Q3');
  if (!(await page.$eval('#mKlasseLabel', el => el.hidden))) {
    console.error('Klasse-Feld sollte bei Q3 verborgen sein'); process.exit(1);
  }
  console.log('OK Stufe/Klasse-Logik (10 sichtbar, Q3 versteckt)');
  await page.selectOption('#mStufe', '10');
  await page.selectOption('#mKlasse', '2');
  await page.click('#mSave');
  await page.waitForTimeout(700);

  // 2) "Generell verhindert"-Sperrtag anlegen
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.click('#nav [data-tab="home"]');
  await page.click('#blockBtn');
  await page.waitForSelector('[data-bt="Generell"]', { state: 'visible' });
  await page.click('[data-bt="Generell"]');
  await page.waitForTimeout(400);
  const weeklyVisible = await page.$eval('#bWeeklyBox', el => !el.hidden);
  const dateHidden = await page.$eval('#bDateRow', el => el.hidden);
  if (!weeklyVisible || !dateHidden) {
    console.error('Weekly-Box/Datums-Reihe falsch sichtbar'); process.exit(1);
  }
  await page.click('#bWeeklyDays [data-wd="1"]'); // Montag
  const wdPressed = await page.$eval('#bWeeklyDays [data-wd="1"]', el => el.getAttribute('aria-pressed'));
  if (wdPressed !== 'true') { console.error('Wochentag konnte nicht gewaehlt werden'); process.exit(1); }
  await page.click('#bKind [data-bk="person"]');
  await page.waitForTimeout(600);
  await page.waitForSelector('[data-sp]', { state: 'attached', timeout: 8000 });
  await page.click('[data-sp]');
  await page.click('#bSave');
  await page.waitForTimeout(500);
  console.log('OK Generell-verhindert-Sperrtag angelegt');

  // 3) Export-Buttons testen
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('#nav [data-tab="settings"]');
  await page.waitForSelector('#bkExport', { state: 'attached' });

  let failures = 0;
  for (const btn of EXPORT_BUTTONS) {
    const handle = await page.$(btn.id);
    if (!handle) { console.error('Button fehlt: ' + btn.id); failures++; continue; }
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      handle.click(),
    ]);
    if (!download) { console.error('Kein Download: ' + btn.id); failures++; continue; }
    const fname = download.suggestedFilename();
    const ok = fname.endsWith(btn.ext);
    console.log((ok ? 'OK ' : 'FAIL ') + btn.id + ' -> ' + fname);
    if (!ok) failures++;
  }

  await browser.close();
  if (failures) { console.error(failures + ' Problem(e)'); process.exit(1); }
  console.log('Alle Checks bestanden (Export, Stufe/Klasse, Generell verhindert).');
})().catch(err => { console.error('Test fehlgeschlagen:', err); process.exit(1); });
