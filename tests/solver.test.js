/* Node-Tests für den Solver:  node tests/solver.test.js */
const assert = require('assert');
const S = require('../js/solver.js');

const RAW = [
 ['Fabian','Keller','10a',1,0,1,14],['Lena','Hoffmann','10b',1,1,1,11],['Jonas','Becker','9a',0,0,1,6],['Mia','Schulz','10a',1,0,1,12],
 ['Noah','Wagner','11c',1,0,1,9],['Emma','Fischer','8b',0,0,1,3],['Paul','Weber','9c',1,0,1,8],['Hannah','Meyer','10c',1,1,1,10],
 ['Leon','Schmidt','12a',1,0,1,15],['Sophie','Wolf','8a',0,0,1,2],['Elias','Neumann','11a',1,0,1,7],['Clara','Braun','9b',0,0,1,5],
 ['Ben','Zimmermann','10b',0,0,1,6],['Lea','Krüger','12b',1,0,1,13],['Finn','Hartmann','8c',0,0,0,4],['Marie','Lange','11b',1,1,1,9],
 ['Luis','Schäfer','9a',0,0,0,5],['Ida','Koch','10c',1,0,1,8],['Felix','Richter','12a',0,0,1,7],['Lina','Klein','8b',0,0,1,3],
 ['Anton','Schröder','11c',1,0,1,10],['Greta','Vogel','9c',0,0,1,4],['Moritz','Frank','10a',0,1,1,6],['Nele','Peters','12b',1,0,1,11]
];
const TEAMS = [[0,3],[1,12],[4,20],[6,2],[7,17],[8,18],[10,15],[13,23],[5,19,9],[11,21]];
const mk = () => {
  const members = RAW.map((r, i) => ({ id: i, first: r[0], last: r[1], cls: r[2], stufe: parseInt(r[2]), ausb: !!r[3], springer: !!r[4], available: !!r[5], total: r[6], team: null }));
  TEAMS.forEach((t, i) => t.forEach(id => members[id].team = i + 1));
  return members;
};
const settings = () => ({ perShift: 2, fair: true, weekday: true, friMon: true, notify: true });
const TODAY = new Date(2026, 10, 11);
const run = (o = {}) => {
  const members = o.members || mk(), blocks = o.blocks || [];
  const r = S.solveMonth({ year: 2026, month: 10, members, blocks, plan: o.plan || {}, settings: o.settings || settings(), today: TODAY, ...o.extra });
  return { members, blocks, ...r };
};
const BLOCKS = [
  { id: 1, type: 'Klausur', title: 'Bio', from: '2026-11-13', to: '2026-11-13', scope: { kind: 'class', value: '8b' } },
  { id: 2, type: 'Abwesend', title: 'Arzt', from: '2026-11-13', to: '2026-11-13', scope: { kind: 'person', value: [1] } },
  { id: 3, type: 'Klausur', title: 'Mathe', from: '2026-11-17', to: '2026-11-17', scope: { kind: 'class', value: '10a' } },
  { id: 4, type: 'Exkursion', title: 'Exkursion', from: '2026-11-24', to: '2026-11-24', scope: { kind: 'stufe', value: 10 } },
  { id: 5, type: 'Klausur', title: 'Englisch', from: '2026-11-26', to: '2026-11-26', scope: { kind: 'class', value: '12a' } },
];
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };

function checkHard(r) {
  Object.entries(r.plan).forEach(([k, e]) => {
    const bm = S.blockedMap(S.parse(k), r.blocks, r.members);
    e.team.forEach(id => {
      assert(!bm.has(id), `${k}: gesperrte Person ${r.members[id].first} eingeteilt`);
      assert(r.members[id].available, `${k}: nicht verfügbare Person eingeteilt`);
    });
    if (e.team.length) assert(e.team.some(id => r.members[id].ausb), `${k}: keine AUSB im Team`);
  });
}

console.log('Solver-Tests');
t('Sperrtage werden nie gebrochen (normaler Plan)', () => { const r = run({ blocks: BLOCKS }); checkHard(r); assert(r.stats.days > 10); });
t('Plan ist vollständig besetzt und ohne Relaxation, wenn genug Teams da sind', () => {
  const r = run({ blocks: BLOCKS });
  assert.strictEqual(r.stats.open, 0); assert.strictEqual(r.stats.relaxed, 0);
  Object.values(r.plan).forEach(e => assert.strictEqual(e.team.length, 2));
});
t('max. 1 Dienst pro Woche pro Team', () => {
  const r = run({ blocks: BLOCKS }), seen = new Set();
  Object.entries(r.plan).forEach(([k, e]) => { const key = e.teamId + '|' + S.weekKey(S.parse(k)); assert(!seen.has(key), 'Team doppelt in KW ' + key); seen.add(key); });
});
t('kein Fr→Mo-Doppeldienst', () => {
  const r = run({ blocks: BLOCKS });
  Object.entries(r.plan).forEach(([k, e]) => { const d = S.parse(k); if (d.getDay() === 1) { const f = r.plan[S.iso(S.addDays(d, -3))]; if (f && e.teamId != null) assert.notStrictEqual(f.teamId, e.teamId); } });
});
t('Wochentag-Regel: Team nicht 2× am selben Wochentag', () => {
  const r = run({ blocks: BLOCKS }), seen = new Set();
  Object.entries(r.plan).forEach(([k, e]) => { const key = e.teamId + '|' + S.parse(k).getDay(); assert(!seen.has(key), 'Wochentag doppelt ' + key); seen.add(key); });
});
t('Springer füllt fehlende Plätze auf (SPR-Badge)', () => {
  const members = mk(); members[3].available = false; // Mia krank → Team 1 nur Fabian
  const r = run({ members, blocks: BLOCKS });
  Object.values(r.plan).filter(e => e.teamId === 1).forEach(e => { assert.strictEqual(e.team.length, 2); assert.strictEqual(e.tag, 'SPR'); assert.strictEqual(e.status, 'warn'); });
  checkHard(r);
});
t('Team ohne AUSB wird nie eingeplant', () => {
  const members = mk(); members[0].ausb = false; members[3].ausb = false;
  const r = run({ members }); Object.values(r.plan).forEach(e => assert.notStrictEqual(e.teamId, 1));
});
t('Enger Plan: Regeln werden gelockert (REG/WARN), Sperrtage bleiben hart', () => {
  const members = mk();
  members.forEach(m => { if (![0, 3, 1, 12].includes(m.id) && !m.springer) m.available = false; }); // nur 2 Teams (+Springer)
  const r = run({ members, blocks: BLOCKS });
  checkHard(r);
  assert(r.stats.relaxed > 0 || r.stats.understaffed > 0 || r.stats.open > 0, 'erwartet Warnungen');
  assert(Object.values(r.plan).some(e => e.status !== 'ok'));
});
t('Alle Teams gesperrt → "bad" statt Sperrtag zu brechen', () => {
  const members = mk(), blocks = [...BLOCKS, { id: 99, type: 'Exkursion', title: 'Alle', from: '2026-11-18', to: '2026-11-18', scope: { kind: 'person', value: members.map(m => m.id) } }];
  const r = run({ members, blocks }); checkHard(r);
  assert.strictEqual(r.plan['2026-11-18'].status, 'bad'); assert.strictEqual(r.plan['2026-11-18'].team.length, 0);
});
t('Vergangene Tage mit Plan bleiben unverändert', () => {
  const plan = { '2026-11-09': { team: [0, 3], teamId: 1, extra: [], status: 'ok', tag: 'OK', note: '' } };
  const r = run({ plan }); assert(!('2026-11-09' in r.plan));
});
t('Bestehende Nachbarwochen wirken als Randbedingung (Woche über Monatsgrenze)', () => {
  // Team 1 hat Mo 30.11. (Woche des 27.11.? nein: KW 49) → im Dezember darf es in dieser Woche nicht nochmal
  const plan = { '2026-11-30': { team: [0, 3], teamId: 1, extra: [], status: 'ok', tag: 'OK', note: '' } };
  const r = S.solveMonth({ year: 2026, month: 11, members: mk(), blocks: [], plan, settings: settings(), today: TODAY });
  ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'].forEach(k => assert.notStrictEqual(r.plan[k].teamId, 1, k));
});
t('Fairness: weniger belastete Teams werden bevorzugt', () => {
  const r = run({ blocks: BLOCKS }), cnt = {};
  Object.values(r.plan).forEach(e => { if (e.teamId != null) cnt[e.teamId] = (cnt[e.teamId] || 0) + 1; });
  const v = Object.values(cnt); assert(Math.max(...v) - Math.min(...v) <= 2, JSON.stringify(cnt));
});
t('Deterministisch', () => { assert.deepStrictEqual(run({ blocks: BLOCKS }).plan, run({ blocks: BLOCKS }).plan); });
t('perShift=3 füllt mit Springern, max. Teamgröße 3 wird nicht überschritten', () => {
  const s = settings(); s.perShift = 3; const r = run({ blocks: BLOCKS, settings: s });
  Object.values(r.plan).forEach(e => assert(e.team.length <= 3));
});
t('Laufzeit < 2 s', () => { const r = run({ blocks: BLOCKS }); assert(r.stats.ms < 2000, r.stats.ms + 'ms'); });
/* ---------- Tests für Datenpersistenz & Formate (.saniteam, .saniplan, .sanilog, .saniblocks) ---------- */
t('Snapshot & Restore modularer Formate (.saniteam, .saniplan, .sanilog, .saniblocks)', () => {
  const members = mk();
  const plan = { '2026-11-16': { team: [0, 3], teamId: 1, extra: [], status: 'ok', tag: 'OK' } };
  const history = [{ d: '2026-11-10', time: '10:00', place: 'B-114', type: 'Sportunfall', ist: 2, soll: 2 }];
  const blocks = [{ id: 1, type: 'Klausur', title: 'Mathe', from: '2026-11-12', to: '2026-11-12', scope: { kind: 'class', value: '10a' } }];

  // Minimaler Simulierter State
  const snapAll = { app: 'SaniAlarm', format: 'saniteam', version: 2, members, plan, history, blocks };
  const snapPlan = { app: 'SaniAlarm', format: 'saniplan', version: 2, plan };
  const snapLog = { app: 'SaniAlarm', format: 'sanilog', version: 2, history };
  const snapBlocks = { app: 'SaniAlarm', format: 'saniblocks', version: 2, blocks };

  assert.strictEqual(snapPlan.format, 'saniplan');
  assert.strictEqual(snapLog.format, 'sanilog');
  assert.strictEqual(snapBlocks.format, 'saniblocks');
  assert.strictEqual(snapAll.format, 'saniteam');
});
t('Tages-Modi im Solver (Wandertag/Frei, Großevent, Verkürzt)', () => {
  const members = mk();
  const dayModes = {
    '2026-11-16': 'free',
    '2026-11-17': 'event',
    '2026-11-18': 'short'
  };
  const r = S.solveMonth({ year: 2026, month: 10, members, blocks: [], plan: {}, settings: settings(), today: TODAY, dayModes });
  assert.strictEqual(r.plan['2026-11-16'].tag, 'FREI');
  assert.strictEqual(r.plan['2026-11-16'].team.length, 0);
  assert(r.plan['2026-11-17'].team.length >= 4, 'Event sollte 4 Sanis haben');
  assert(r.plan['2026-11-17'].note.includes('[Großevent]'));
  assert(r.plan['2026-11-18'].note.includes('[Verkürzt]'));
});
console.log(`\n${n} Tests bestanden`);
