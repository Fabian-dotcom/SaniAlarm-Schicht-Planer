/**
 * QA-Browser-Test: Export-Buttons (.sani-Formate) + Stufe/Klasse-Logik im Desktop-Webapp.
 *
 * Lädt die App in einem echten Browser (Playwright-core + lokales Edge/Brave),
 * legt ein Test-Mitglied über die neuen Stufe/Klasse-Dropdowns an, klickt
 * nacheinander alle Export-Buttons im Einstellungs-Tab und prüft, dass für jede
 * Schaltfläche ein Download mit der richtigen Dateiendung startet.
 *
 * Ausführen:  NODE_PATH=".../node_modules" node qa/browser-export-test.js
 */
const fs = require('fs');

let pw;
try { pw = require('playwright-core'); } catch { try { pw = require('playwright'); } catch {} }
if (!pw) { console.error('❌ playwright(-core) nicht verfügbar.'); process.exit(2); }

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
  if (!browser) { console.error('❌ Kein Chromium/Edge/Brave gefunden'); process.exit(2); }

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Mitglied anlegen (neue Stufe/Klasse-Dropdowns)
  await page.click('#nav [data-tab="members"]');
  await page.click('#addMember');
  await page.waitForSelector('#mFirst', { state: 'visible' });
  await page.fill('#mFirst', 'Test');
  await page.fill('#mLast', 'Person');
  await page.selectOption('#mStufe', '10');
  const klasseHidden = await page.$eval('#mKlasseLabel', el => el.hidden);
  if (klasseHidden) { console.error('❌ Klasse-Feld sollte bei Stufe 10 sichtbar sein'); process.exit(1); }
  await page.selectOption('#mKlasse', '2');

  // Q-Stufe: Klasse muss verschwinden
  await page.selectOption('#mStufe', 'Q3');
  const klasseHiddenQ = await page.$eval('#mKlasseLabel', el => el.hidden);
  if (!klasseHiddenQ) { console.error('❌ Klasse-Feld sollte bei Q3 verborgen sein'); process.exit(1); }
  console.log('✅ Stufe/Klasse-Logik: 10 → sichtbar, Q3 → versteckt');

  await page.selectOption('#mStufe', '10');
  await page.click('#mSave');
  await page.waitForTimeout(700);

  // ggf. offenes Modal schließen
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Einstellungen öffnen
  await page.click('#nav [data-tab="settings"]');
  await page.waitForSelector('#dataCard', { state: 'visible' });
  await page.waitForSelector('#bkExport', { state: 'attached' });

  let failures = 0;
  for (const btn of EXPORT_BUTTONS) {
    const handle = await page.$(btn.id);
    if (!handle) { console.error(`❌ Button ${btn.id} existiert nicht`); failures++; continue; }
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      handle.click(),
    ]);
    if (!download) { console.error(`❌ ${btn.id}: kein Download ausgelöst`); failures++; continue; }
    const fname = download.suggestedFilename();
    const ok = fname.endsWith(btn.ext);
    console.log(`${ok ? '✅' : '❌'} ${btn.id} → ${fname}`);
    if (ok) {
      const body = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      const expectedFmt = btn.ext.slice(1);
      if (body.format !== expectedFmt) console.error(`   ⚠️ format-Feld: ${body.format} (erwartet ${expectedFmt})`);
      // Prüfe, dass das angelegte Mitglied mit korrekter cls vorhanden ist
      if (body.members?.length) {
        const cls = body.members[0].cls;
        if (cls !== '10-2') console.error(`   ⚠️ cls: ${cls} (erwartet 10-2)`);
      }
    } else failures++;
  }

  await browser.close();
  if (failures) { console.error(`❌ ${failures} Problem(e)`); process.exit(1); }
  console.log('✅ Alle Export-Buttons + Stufe/Klasse-Logik funktionieren.');
})().catch(err => { console.error('❌ Test fehlgeschlagen:', err); process.exit(1); });
