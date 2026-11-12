/**
 * QA: (1) Statistik zeigt alle Mitglieder (auch 0-Dienste, aufsteigend),
 * (2) Schulzeiten editierbar + speicherbar + Reset,
 * (3) Trainee-Duo (Lieblingspartner) wird bevorzugt gemeinsam eingeteilt.
 */
let pw;
try { pw = require('playwright-core'); } catch { try { pw = require('playwright'); } catch {} }
if (!pw) { console.error('playwright nicht verfügbar'); process.exit(2); }
const fail = m => { console.error('❌', m); process.exit(1); };

(async () => {
  let browser;
  try { browser = await pw.chromium.launch({ headless: true }); }
  catch { browser = await pw.chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }); }
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:3456', { waitUntil: 'domcontentloaded' });

  // Setup + Plan
  await page.evaluate(() => {
    localStorage.clear();
    upsertMember({ first: 'Ausb1', last: 'A', cls: '10-1', ausb: true, quali: 'ausb', available: true, total: 10 });
    upsertMember({ first: 'Ausb2', last: 'B', cls: '10-1', ausb: true, quali: 'ausb', available: true, total: 10 });
    upsertMember({ first: 'Azubi1', last: 'C', cls: '9-1', ausb: false, quali: 'ausbildung', available: true, total: 0 });
    upsertMember({ first: 'Azubi2', last: 'D', cls: '9-1', ausb: false, quali: 'ausbildung', available: true, total: 0 });
    linkPartner(m(0), m(1));
    linkPartner(m(2), m(3));
    save();
    solve(TODAY.getFullYear(), TODAY.getMonth(), {});
    save();
    renderAll();
  });
  await page.waitForTimeout(400);

  // --- 1. Statistik: alle 4 Personen, aufsteigend (0 zuerst) ---
  await page.evaluate(() => go('stats'));
  await page.waitForTimeout(300);
  const bars = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#bars .bar-row')];
    return { n: rows.length, values: rows.map(r => parseInt(r.querySelector('.idx b').textContent)) };
  });
  console.log(`Balken: ${bars.n} · Indizes: ${bars.values.join(', ')}`);
  if (bars.n !== 4) fail(`nur ${bars.n} statt 4 Personen in der Statistik`);
  if (bars.values.some((v, i) => i > 0 && bars.values[i - 1] > v)) fail('Sortierung nicht aufsteigend');
  const zeroMark = await page.evaluate(() => [...document.querySelectorAll('#bars .bar-row')].filter(r => /NOCH OHNE DIENST/i.test(r.textContent)).length);
  console.log(`✅ Alle 4 in Statistik · ${zeroMark} mit „NOCH OHNE DIENST“-Hinweis`);

  // --- 2. Schulzeiten editieren & speichern ---
  const r2 = await page.evaluate(() => {
    go('settings');
    const editor = document.querySelector('#schoolTimesEditor');
    if (!editor) return { err: 'Editor fehlt' };
    const inp = editor.querySelector('[data-sd="schoolDay"][data-idx="2"][data-field="von"]');
    inp.value = '10:00';
    inp.dispatchEvent(new Event('change'));
    const stored = JSON.parse(localStorage.getItem('saniteam.v1')).settings.schoolDay[2].von;
    document.querySelector('#sdReset').click();
    return { stored };
  });
  if (r2.err) fail(r2.err);
  console.log(r2.stored === '10:00' ? '✅ Schulzeit geändert & gespeichert (3. Stunde 10:00)' : `❌ gespeichert: ${r2.stored}`);
  if (r2.stored !== '10:00') fail('schulzeit');
  await page.waitForTimeout(300);
  const resetOk = await page.evaluate(() => JSON.parse(localStorage.getItem('saniteam.v1')).settings.schoolDay[2].von === '09:50');
  console.log(resetOk ? '✅ Standardzeiten-Reset ok' : '❌ Reset fehlgeschlagen');
  if (!resetOk) fail('reset');

  // --- 3. Trainee-Duo gemeinsam ---
  const duo = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('saniteam.v1'));
    let together = 0, solo = 0;
    Object.values(db.plan).forEach(e => {
      const h2 = (e.team || []).includes(2), h3 = (e.team || []).includes(3);
      if (h2 && h3) together++;
      else if (h2 !== h3) solo++;
    });
    return { together, solo };
  });
  console.log(`Trainee-Duo: ${duo.together}x gemeinsam, ${duo.solo}x getrennt`);
  if (duo.together === 0) fail('Duo kam nie gemeinsam vor');
  if (duo.together < duo.solo) fail('Duo nicht bevorzugt');
  console.log('✅ Trainee-Lieblingspartner bevorzugt gemeinsam');

  await browser.close();
  console.log('\n✅ Alle 3 Fixes verifiziert.');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
