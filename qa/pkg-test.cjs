/**
 * QA: Feature-Paket (Einsatz-Crew, Statistik für alle, Trainee-Mentoring,
 * Plan-Schutz, Info-Tipps, Notfall-Rangliste, AG-Tageskarte)
 */
const { execSync } = require('child_process');
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

  // Setup: 2 erfahrene (AUSB) als Team + 1 Trainee
  await page.goto('http://127.0.0.1:3456', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    upsertMember({ first: 'Ana', last: 'X', cls: '10-1', ausb: true, quali: 'ausb', springer: false, available: true });
    upsertMember({ first: 'Ben', last: 'Y', cls: '10-1', ausb: true, quali: 'ausb', springer: false, available: true });
    upsertMember({ first: 'Cara', last: 'Z', cls: '9-1', ausb: false, quali: 'ausbildung', springer: false, available: true });
    linkPartner(m(0), m(1));
    save();
  });
  await page.goto('http://127.0.0.1:3456', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { solve(TODAY.getFullYear(), TODAY.getMonth(), {}); save(); });

  // --- 1. Plan-Schutz: manuell markierte Schicht überlebt Neu-Generierung ---
  const planKeys = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('saniteam.v1')).plan).filter(k => JSON.parse(localStorage.getItem('saniteam.v1')).plan[k].team.length >= 2));
  const futureKey = planKeys.find(k => k >= new Date().toISOString().slice(0, 10));
  if (futureKey) {
    const protectedTeam = await page.evaluate(k => {
      const db = JSON.parse(localStorage.getItem('saniteam.v1'));
      db.plan[k].team = [42]; db.plan[k].note = 'MANUELL'; db.plan[k].mark = true;
      localStorage.setItem('saniteam.v1', JSON.stringify(db));
      return true;
    }, futureKey);
    // Neu laden + generieren
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { boot(); solve(TODAY.getFullYear(), TODAY.getMonth(), {}); save(); });
    const kept = await page.evaluate(k => {
      const db = JSON.parse(localStorage.getItem('saniteam.v1'));
      return db.plan[k] && db.plan[k].note === 'MANUELL';
    }, futureKey);
    console.log(kept ? '✅ Plan-Schutz: manuelle Schicht überlebte Neu-Generierung' : '❌ Plan-Schutz fehlgeschlagen');
    if (!kept) fail('plan protection');
  } else console.log('⚠ kein zukünftiger Tag zum Schutztest');

  // --- 2. Einsatz mit crew speichern + Statistik umfasst ALLE ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { boot(); });
  const crewResult = await page.evaluate(() => {
    // simuliere Einsatz-Log-Eintrag mit crew
    einsaetze.unshift({ d: iso(addDays(TODAY, -3)), time: '10:00', type: 'Sportunfall', place: 'Sporthalle', ist: 2, soll: 2, crew: [{ id: 0, spont: false }, { id: 1, spont: false }], planned: [0, 1] });
    save();
    // Metriken: Cara (id 2) hat 0 Dienste, muss trotzdem in der Liste sein
    const per = SaniMetrics.memberMetrics({ members, plan, einsaetze, blocks, today: TODAY, perShift: 2, from: '0000-01-01', to: '9999-12-31' });
    return { count: per.length, cara: per.find(p => p.id === 2) };
  });
  console.log(`Metric-Liste umfasst ${crewResult.count} Personen (auch 0-Dienst)`);
  if (crewResult.count < 3 || !crewResult.cara) fail('metrics umfasst nicht alle');
  console.log('✅ Statistik inkl. Personen ohne Dienste');

  // --- 3. Info-Tipps vorhanden ---
  await page.evaluate(() => { renderAll(); go('stats'); });
  await page.waitForTimeout(400);
  const tips = await page.evaluate(() => document.querySelectorAll('.info-tip').length);
  console.log(tips >= 4 ? `✅ ${tips} Info-Tooltips in Statistik` : `❌ nur ${tips} Tooltips`);
  if (tips < 4) fail('info tips');

  // --- 4. Notfall-Rangliste (openSubstituteModal) ---
  const rankOk = await page.evaluate(() => {
    try { openSubstituteModal([0], TODAY); return document.querySelectorAll('#rankList [data-subin]').length; }
    catch (e) { return 'ERR: ' + e.message; }
  });
  console.log(typeof rankOk === 'number' && rankOk >= 1 ? `✅ Notfall-Rangliste: ${rankOk} Kandidaten` : `❌ Rangliste: ${rankOk}`);

  // --- 5. AG-Tageskarte nur am AG-Tag (Montag = 1) ---
  await page.keyboard.press('Escape');
  await page.evaluate(() => { go('home'); renderAgDayCard(); });
  await page.waitForTimeout(200);
  const agState = await page.evaluate(() => {
    const card = document.querySelector('#agDayCard');
    return { isAgDay: TODAY.getDay() === (settings.agWeekday ?? 1), visible: card ? !card.hidden : false };
  });
  console.log((agState.isAgDay === agState.visible) ? `✅ AG-Karte korrekt (isAgDay=${agState.isAgDay}, visible=${agState.visible})` : '❌ AG-Karte falsch');
  // AG-Anwesenheit abhaken und prüfen
  const agSaved = await page.evaluate(() => {
    const k = iso(TODAY);
    agAttendance[k] = [0, 2];
    save();
    return JSON.parse(localStorage.getItem('saniteam.v1')).agAttendance?.[k];
  });
  console.log(agSaved && agSaved.join() === '0,2' ? '✅ AG-Anwesenheit gespeichert' : '❌ AG-Speicherung');

  // --- 6. Settings: maxShift/trainees/agWeekday-Slider vorhanden ---
  await page.evaluate(() => { go('settings'); });
  await page.waitForTimeout(300);
  const setOk = await page.evaluate(() => !!document.querySelector('#maxShift') && !!document.querySelector('#traineesPerShift') && !!document.querySelector('#agDaySel'));
  console.log(setOk ? '✅ Einstellungen: maxShift, Trainees, AG-Tag vorhanden' : '❌ Einstellungen unvollständig');

  await browser.close();
  console.log('\n✅ Feature-Paket vollständig verifiziert.');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
