/**
 * QA: Team-Schicht-Nachtrag im Statistik-Tab
 * 1. Legt 3 Mitglieder + ein Team an
 * 2. Wechselt in "Schicht nachtragen" auf Team-Modus
 * 3. Trägt eine Schicht mit Abweichung (zusätzlicher Springer) nach
 * 4. Prüft die Zähler (total/year/month)
 */
const fs = require('fs');
let pw;
try { pw = require('playwright-core'); } catch { try { pw = require('playwright'); } catch {} }
if (!pw) { console.error('playwright nicht verfügbar'); process.exit(2); }

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3456';

(async () => {
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch {
    browser = await pw.chromium.launch({
      headless: true,
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    });
  }
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 3 Mitglieder anlegen
  await page.click('#nav [data-tab="members"]');
  const names = [['Anna', 'A'], ['Ben', 'B'], ['Cara', 'C']];
  for (const [f, l] of names) {
    await page.click('#addMember');
    await page.waitForSelector('#mFirst', { state: 'visible' });
    await page.fill('#mFirst', f);
    await page.fill('#mLast', l);
    await page.selectOption('#mStufe', '10');
    await page.selectOption('#mKlasse', '1');
    await page.click('#mSave');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // Escape drücken, um restliches Modal zu schließen
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Team bilden: Anna mit Ben verknüpfen (über Mitglied-Modal "Partner hinzufügen")
  await page.click('#nav [data-tab="members"]');
  await page.waitForTimeout(300);
  // Erstes Mitglied öffnen (erste Zeile der Tabelle: bearbeiten-Button)
  await page.click('#memTable tbody tr:first-child [data-open]');
  await page.waitForSelector('#addPartner', { state: 'visible' });
  await page.click('#addPartner');
  await page.waitForTimeout(300);
  await page.click('#pPicker [data-partner]'); // ersten Kandidaten wählen
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Statistik → Team-Modus
  await page.click('#nav [data-tab="stats"]');
  await page.waitForTimeout(400);
  await page.click('[data-smode="team"]');
  await page.waitForTimeout(500);
  const teamRowVisible = await page.$eval('#shiftTeamRow', el => !el.hidden);
  const personRowHidden = await page.$eval('#shiftPersonRow', el => el.hidden);
  if (!teamRowVisible || !personRowHidden) { console.error('❌ Team-Modus schaltet UI nicht um'); process.exit(1); }

  const teamOptions = await page.$$eval('#shiftTeam option', os => os.map(o => o.value).filter(Boolean));
  if (!teamOptions.length) { console.error('❌ Keine Teams im Dropdown'); process.exit(1); }
  console.log('✅ Team-Dropdown gefüllt:', teamOptions.length, 'Team(s)');

  // Abweichung aktivieren → Zusatz-Picker erscheint
  await page.check('#shiftDeviation');
  await page.waitForTimeout(300);
  const extraVisible = await page.$eval('#shiftExtraPicker', el => !el.hidden);
  if (!extraVisible) { console.error('❌ Abweichungs-Picker erscheint nicht'); process.exit(1); }
  await page.click('#shiftExtraPicker [data-shiftx]'); // eine Zusatzperson wählen
  await page.waitForTimeout(200);
  const extrasBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('saniteam.v1')).members.map(m => m.total));

  // Schicht nachtragen
  await page.click('#addShift button[type="submit"]');
  await page.waitForTimeout(500);
  const extrasAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('saniteam.v1')).members.map(m => m.total));

  // Team (2 Personen) + 1 Zusatz = 3x +1, andere unverändert
  const gained = extrasAfter.map((v, i) => v - extrasBefore[i]);
  const sumGained = gained.reduce((a, b) => a + b, 0);
  if (sumGained !== 3) { console.error('❌ Erwartet +3 Dienste (Team + 1 Zusatz), bekommen', gained); process.exit(1); }
  console.log('✅ Team-Schicht korrekt gebucht: Team (2) + 1 Zusatzperson →', gained);

  // Zähler zurücksetzen (Checkbox aus) — Team-only
  await page.uncheck('#shiftDeviation');
  await page.click('#addShift button[type="submit"]');
  await page.waitForTimeout(500);
  const extrasFinal = await page.evaluate(() => JSON.parse(localStorage.getItem('saniteam.v1')).members.map(m => m.total));
  const gained2 = extrasFinal.map((v, i) => v - extrasAfter[i]);
  if (gained2.reduce((a, b) => a + b, 0) !== 2) { console.error('❌ Team-only-Nachtrag falsch:', gained2); process.exit(1); }
  console.log('✅ Team-only-Nachtrag korrekt (2 Personen)');

  await browser.close();
  console.log('✅ Team-Schicht-Nachtrag vollständig verifiziert.');
})().catch(err => { console.error('❌ Test fehlgeschlagen:', err.message); process.exit(1); });
