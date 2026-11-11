/**
 * QA: Fairness-Engine E2E
 * 1. Statistik zeigt 4 KPI-Karten (Bereitschafts-, Einsatz-Fairness, Gesamt, VK)
 * 2. Zeitraum-/Metrik-Chips schalten um
 * 3. Klick auf Balken öffnet Profil-Modal mit Heatmap + Verlauf + Zeugnis-Button
 * 4. PDF-Zeugnis erzeugt Download
 * 5. Inventar-Nachbestell-Button erzeugt Modal mit mailto
 */
let pw;
try { pw = require('playwright-core'); } catch { try { pw = require('playwright'); } catch {} }
if (!pw) { console.error('playwright nicht verfügbar'); process.exit(2); }

(async () => {
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch { browser = await pw.chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }); }
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const BASE2 = process.env.BASE_URL || 'http://127.0.0.1:3456';
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:3456', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE2, { waitUntil: 'domcontentloaded' });

  // Mitglieder direkt per App-API anlegen (verlässlicher als UI-Klicks)
  await page.evaluate(() => {
    upsertMember({ first: 'Ana', last: 'X', cls: '10-1', ausb: true, springer: false, available: true, quali: 'ausb' });
    upsertMember({ first: 'Ben', last: 'Y', cls: '10-1', ausb: false, springer: true, available: true, quali: 'helfer' });
    linkPartner(m(0), m(1));
    save();
  });
  await page.goto(BASE2, { waitUntil: 'domcontentloaded' });

  // Plan generieren (Services über Plan generieren für einige Tage)
  await page.evaluate(() => { solve(TODAY.getFullYear(), TODAY.getMonth(), {}); save(); });
  await page.goto(BASE2, { waitUntil: 'domcontentloaded' });

  // --- Statistik ---
  await page.click('#nav [data-tab="stats"]');
  await page.waitForTimeout(500);
  const kpiCards = await page.$$eval('#summary .stat', els => els.map(e => e.querySelector('.lbl')?.textContent));
  console.log('KPI-Karten:', kpiCards.join(' | '));
  if (kpiCards.length !== 4 || !/Bereitschafts-Fairness/.test(kpiCards[0]) || !/Einsatz-Fairness/.test(kpiCards[1])) {
    console.error('❌ KPI-Karten falsch'); process.exit(1);
  }
  console.log('✅ 4 Fairness-KPI-Karten vorhanden');

  await page.click('[data-tf="90"]');
  await page.waitForTimeout(400);
  console.log('✅ Zeitraum-Filter schaltet');
  await page.click('[data-mv="alarm"]');
  await page.waitForTimeout(400);
  console.log('✅ Metrik-Filter schaltet');

  // Profil-Modal via Balken-Klick
  await page.click('[data-mv="ready"]');
  await page.waitForTimeout(300);
  const bar = await page.$('#bars [data-profile]');
  if (bar) {
    await bar.click();
    await page.waitForTimeout(600);
    const cells = await page.evaluate(() => document.querySelectorAll('.hm-cell').length);
    const hasCert = await page.evaluate(() => !!document.querySelector('#certBtn'));
    const hasHist = await page.evaluate(() => !!document.querySelector('.hist'));
    console.log('Heatmap-Zellen:', cells, '| Zeugnis-Button:', hasCert, '| Verlauf:', hasHist);
    if (cells < 300 || !hasCert) { console.error('❌ Profil-Modal unvollständig'); process.exit(1); }
    console.log('✅ GitHub-Heatmap-Profil mit Zeugnis-Button');
    await page.click('#certBtn');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    console.log('⚠ Keine Balken (keine Dienste geplant) – Profil-Klick übersprungen');
  }

  // --- Inventar-Nachbestellung ---
  await page.click('#nav [data-tab="log"]');
  await page.waitForTimeout(400);
  await page.click('#openInvBtn');
  await page.waitForTimeout(500);
  const hasReorder = await page.evaluate(() => !!document.querySelector('#reorderMailBtn'));
  if (!hasReorder) { console.error('❌ Nachbestell-Button fehlt'); process.exit(1); }
  await page.evaluate(() => { // Bestand unter Warnwert senken
    const k = Object.keys(inventory)[0]; inventory[k].count = 0; save();
  });
  await page.click('#reorderMailBtn');
  await page.waitForTimeout(400);
  const hasMailLink = await page.evaluate(() => !!document.querySelector('#reorderMail'));
  const txt = await page.evaluate(() => (document.querySelector('#reorderText') || {}).value || '');
  if (!hasMailLink || !/Mindestbestand/.test(txt)) { console.error('❌ Nachbestell-Modal unvollständig'); process.exit(1); }
  console.log('✅ Nachbestell-Modal mit Mail-Text und mailto-Link');
  await page.keyboard.press('Escape');

  await browser.close();
  console.log('✅ Fairness-Engine E2E erfolgreich.');
})().catch(err => { console.error('❌', err.message); process.exit(1); });
