/* SaniAlarm Desktop – Core: Daten, Persistenz, CRUD, Regeln (ohne DOM-Rendering) */
'use strict';

const SS = SaniSolver;
const { iso, parse, addDays, isSchool, weekKey } = SS;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const icons = () => window.lucide && lucide.createIcons();

/* ---------- Konstanten & Helfer ---------- */
const TODAY = (() => {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) { const [y, m, d] = q.split('-').map(Number); return new Date(y, m - 1, d); }
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate());
})();
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MON3 = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const COLORS = ['#6B4FBB', '#D2588F', '#2F8F6B', '#C8741F', '#3B6FD8', '#8A5A44', '#1F8FA0', '#A146C0'];
const BTYPES = {
  Verhindert: { tag: 'AB', icon: 'user-x' },
  Krank: { tag: 'KR', icon: 'thermometer' },
  Termin: { tag: 'TE', icon: 'calendar-clock' },
  Klassenfahrt: { tag: 'KF', icon: 'bus' },
  Exkursion: { tag: 'EX', icon: 'map' },
  // Wiederkehrend: Person/Team ist regelmäßig an bestimmten Wochentagen nicht da
  Generell: { tag: 'GV', icon: 'repeat', weekly: true },
};
const DEFAULT_LOCATION = 'Sanitätsraum B014';
const DEFAULT_SHIFT_TIME = '09:30 – 09:50';
const DEFAULT_SETTINGS = { perShift: 2, fair: true, weekday: true, friMon: true, notify: true, me: 0 };
const DEFAULT_INVENTORY = {
  coolpack: { label: 'Kühlpacks (Sofort-Kälte)', count: 24, warnAt: 5 },
  bandage: { label: 'Mullbinden / Fixierbinden', count: 30, warnAt: 6 },
  plaster: { label: 'Wundpflaster-Strips (Pack)', count: 15, warnAt: 3 },
  triangle: { label: 'Dreieckstücher', count: 12, warnAt: 2 },
  gloves: { label: 'Einmalhandschuhe (Paar)', count: 50, warnAt: 10 },
  compress: { label: 'Sterile Wundkompressen', count: 40, warnAt: 8 },
};
const DAY_MODES = {
  normal: { key: 'normal', label: 'Normaler Schultag', tag: '', badgeCls: 'ok', shiftWindow: '09:30 – 09:50' },
  free: { key: 'free', label: 'Wandertag / Schulfrei', tag: 'FREI', badgeCls: 'off', shiftWindow: 'Kein Dienst' },
  short: { key: 'short', label: 'Verkürzter Unterricht', tag: 'KURZ', badgeCls: 'warn', shiftWindow: '09:15 – 09:30' },
  event: { key: 'event', label: 'Großevent / Sportfest', tag: 'EVENT', badgeCls: 'spr', shiftWindow: '08:00 – 13:00 (Großschicht 4–6 Sanis)' },
};
const SCHOOL_HOURS = [
  { h: 1, label: '1. Stunde (07:55 – 08:40)' },
  { h: 2, label: '2. Stunde (08:45 – 09:30)' },
  { h: 3, label: '3. Stunde (09:50 – 10:35)' },
  { h: 4, label: '4. Stunde (10:40 – 11:25)' },
  { h: 5, label: '5. Stunde (11:40 – 12:25)' },
  { h: 6, label: '6. Stunde (12:30 – 13:15)' },
  { h: 7, label: '7. Stunde (13:30 – 14:15)' },
];
const DB_KEY = 'saniteam.v1';

/* ---------- Raum- & Ortshelfer ---------- */
const SPECIAL_PLACES = ['Sporthalle', 'Schulhof', 'Mensa', 'Sanitätsraum B014', 'Sekretariat / Verwaltung', 'Pausenhalle / Foyer', 'Bibliothek', 'Außengelände / Sportplatz', 'Sonstiges'];

function formatRoom(building, roomNum) {
  const b = String(building || '').trim().toUpperCase();
  const r = String(roomNum || '').trim();
  if (!b && !r) return '';
  if (!b) return r;
  if (!r) return `${b}-???`;
  return `${b}-${r}`;
}

function parseRoom(str) {
  const s = String(str || '').trim();
  const m = s.match(/^([A-Za-z])-?(\d{1,4})$/);
  if (!m) return null;
  const building = m[1].toUpperCase();
  const numStr = m[2];
  let floor = '', number = '';
  if (numStr.length >= 3) {
    floor = numStr.slice(0, numStr.length - 2);
    number = numStr.slice(numStr.length - 2);
  } else if (numStr.length === 2) {
    floor = '0';
    number = numStr;
  } else {
    floor = '0';
    number = numStr.padStart(2, '0');
  }
  return { building, floor, number, fullRoom: `${building}-${numStr}`, numStr };
}
const pad = n => String(n).padStart(2, '0');
const same = (a, b) => iso(a) === iso(b);
const fmt = d => `${WD[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
const fmtS = d => `${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
const kw = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
const fairnessOf = SS.fairness;

/* ---------- State ---------- */
let members = [], blocks = [], plan = {}, einsaetze = [], settings = { ...DEFAULT_SETTINGS };
let dayModes = {}, inventory = { ...DEFAULT_INVENTORY };
let lastSaved = null, byId = new Map(), prevPlan = null;

const reindex = () => { byId = new Map(members.map(x => [x.id, x])); };
const m = id => byId.get(id);
const ini = x => (x.first[0] || '?') + (x.last[0] || '');
const col = x => COLORS[x.id % COLORS.length];
const av = (x, cls = '') => `<span class="av ${cls}" style="background:${col(x)}" aria-hidden="true">${esc(ini(x))}</span>`;
const fullName = x => `${x.first} ${x.last}`.trim();
const short = x => `${x.first} ${x.last[0] ? x.last[0] + '.' : ''}`.trim();
const nextMemberId = () => members.reduce((a, x) => Math.max(a, x.id), -1) + 1;

/* ---------- Persistenz (.saniteam, .saniplan, .sanilog, .saniblocks) ---------- */
function cleanMember(x) {
  const { id, first = '', last = '', cls = '', ausb = false, springer = false, available = true, total = 0, year = 0, month = 0, team = null } = x;
  return { id, first, last, cls: String(cls).toLowerCase(), ausb: !!ausb, springer: !!springer, available: !!available, total: Number(total) || 0, year: Number(year) || 0, month: Number(month) || 0, team: team == null ? null : Number(team), stufe: parseInt(cls) || 0 };
}

function snapshot(kind = 'all') {
  const ts = new Date().toISOString();
  if (kind === 'team') {
    return { app: 'SaniAlarm', format: 'saniteam', type: 'team', version: 2, exportedAt: ts,
      members: members.map(({ id, first, last, cls, ausb, springer, available, total, year, month, team }) => ({ id, first, last, cls, ausb, springer, available, total, year, month, team })),
      settings };
  }
  if (kind === 'plan') {
    return { app: 'SaniAlarm', format: 'saniplan', type: 'plan', version: 2, exportedAt: ts, plan, dayModes };
  }
  if (kind === 'log') {
    return { app: 'SaniAlarm', format: 'sanilog', type: 'log', version: 2, exportedAt: ts, history: einsaetze, inventory };
  }
  if (kind === 'blocks') {
    return { app: 'SaniAlarm', format: 'saniblocks', type: 'blocks', version: 2, exportedAt: ts, blocks };
  }
  // Standard-Komplett-Backup (.saniteam)
  return { app: 'SaniAlarm', format: 'saniteam', type: 'all', version: 2, exportedAt: ts,
    members: members.map(({ id, first, last, cls, ausb, springer, available, total, year, month, team }) => ({ id, first, last, cls, ausb, springer, available, total, year, month, team })),
    blocks, plan, history: einsaetze, settings, dayModes, inventory };
}

function detectFormat(data) {
  if (!data || typeof data !== 'object') throw new Error('Ungültiges Datenformat (kein JSON-Objekt)');
  if (data.format === 'saniplan' || (data.plan && !data.members && !data.history)) return 'plan';
  if (data.format === 'sanilog' || (Array.isArray(data.history) && !data.members && !data.plan)) return 'log';
  if (data.format === 'saniblocks' || (Array.isArray(data.blocks) && !data.members && !data.plan && !data.history)) return 'blocks';
  if (data.format === 'saniteam' || Array.isArray(data.members)) {
    if (data.type === 'team' || (!data.plan && !data.history && !data.blocks)) return 'team';
    return 'all';
  }
  throw new Error('Unbekanntes Dateiformat. Unterstützt werden .saniteam, .saniplan, .sanilog und .saniblocks.');
}

function restore(data, options = {}) {
  const mode = options.mode || detectFormat(data);
  let summary = [];

  if (mode === 'all' || mode === 'team') {
    if (!Array.isArray(data.members)) throw new Error('Datei enthält keine Mitglieder-Liste');
    const ids = new Set();
    const list = data.members.map(x => {
      if (typeof x.id !== 'number' || ids.has(x.id)) throw new Error('Datei enthält ungültige oder doppelte Personen-IDs');
      ids.add(x.id);
      return cleanMember(x);
    });
    members = list;
    reindex();
    if (data.settings && typeof data.settings === 'object') {
      settings = { ...DEFAULT_SETTINGS, ...data.settings };
    }
    summary.push(`${members.length} Personen`);
  }

  if (mode === 'all' || mode === 'blocks') {
    if (data.blocks != null) {
      if (!Array.isArray(data.blocks)) throw new Error('Sperrtage müssen ein Array sein');
      blocks = data.blocks;
      summary.push(`${blocks.length} Sperrtage`);
    }
  }

  if (mode === 'all' || mode === 'plan') {
    if (data.plan != null) {
      if (typeof data.plan !== 'object' || Array.isArray(data.plan)) throw new Error('Dienstplan ungültig');
      plan = { ...data.plan };
      summary.push(`${Object.keys(plan).length} Diensttage`);
    }
    if (data.dayModes && typeof data.dayModes === 'object') {
      dayModes = { ...data.dayModes };
    }
  }

  if (mode === 'all' || mode === 'log') {
    const hist = data.history ?? data.einsaetze ?? data.log;
    if (hist != null) {
      if (!Array.isArray(hist)) throw new Error('Einsatz-Log muss ein Array sein');
      einsaetze = hist;
      summary.push(`${einsaetze.length} Einsätze`);
    }
    if (data.inventory && typeof data.inventory === 'object') {
      inventory = { ...DEFAULT_INVENTORY, ...data.inventory };
    }
  }

  return { mode, summary: summary.join(', ') || 'Geladen' };
}

function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(snapshot('all'))); } catch (e) { /* Quota/Privatmodus */ } lastSaved = new Date(); }

/* ---------- Seed (Demo-Daten, Termine relativ zu heute) ---------- */
const RAW = [
  ['Fabian', 'Keller', '10a', 1, 0, 1, 14], ['Lena', 'Hoffmann', '10b', 1, 1, 1, 11], ['Jonas', 'Becker', '9a', 0, 0, 1, 6], ['Mia', 'Schulz', '10a', 1, 0, 1, 12],
  ['Noah', 'Wagner', '11c', 1, 0, 1, 9], ['Emma', 'Fischer', '8b', 0, 0, 1, 3], ['Paul', 'Weber', '9c', 1, 0, 1, 8], ['Hannah', 'Meyer', '10c', 1, 1, 1, 10],
  ['Leon', 'Schmidt', '12a', 1, 0, 1, 15], ['Sophie', 'Wolf', '8a', 0, 0, 1, 2], ['Elias', 'Neumann', '11a', 1, 0, 1, 7], ['Clara', 'Braun', '9b', 0, 0, 1, 5],
  ['Ben', 'Zimmermann', '10b', 0, 0, 1, 6], ['Lea', 'Krüger', '12b', 1, 0, 1, 13], ['Finn', 'Hartmann', '8c', 0, 0, 0, 4], ['Marie', 'Lange', '11b', 1, 1, 1, 9],
  ['Luis', 'Schäfer', '9a', 0, 0, 0, 5], ['Ida', 'Koch', '10c', 1, 0, 1, 8], ['Felix', 'Richter', '12a', 0, 0, 1, 7], ['Lina', 'Klein', '8b', 0, 0, 1, 3],
  ['Anton', 'Schröder', '11c', 1, 0, 1, 10], ['Greta', 'Vogel', '9c', 0, 0, 1, 4], ['Moritz', 'Frank', '10a', 0, 1, 1, 6], ['Nele', 'Peters', '12b', 1, 0, 1, 11]
];
const TEAMS_INIT = [[0, 3], [1, 12], [4, 20], [6, 2], [7, 17], [8, 18], [10, 15], [13, 23], [5, 19, 9], [11, 21]];

function seed() {
  members = RAW.map((r, i) => ({ id: i, first: r[0], last: r[1], cls: r[2], stufe: parseInt(r[2]), ausb: !!r[3], springer: !!r[4], available: !!r[5],
    total: r[6], year: Math.round(r[6] * .62) + (i % 2), month: Math.max(0, Math.round(r[6] * .14) + (i % 3) - 1), team: null }));
  TEAMS_INIT.forEach((t, i) => t.forEach(id => members[id].team = i + 1));
  reindex();
  settings = { ...DEFAULT_SETTINGS }; plan = {};
  const sd = off => { let d = addDays(TODAY, off); while (!isSchool(d)) d = addDays(d, 1); return iso(d); };
  let bid = 1; blocks = [];
  const add = (off, len, type, title, kind, value) => {
    const from = sd(off); let to = from;
    if (len > 1) { let d = parse(from), n = 1; while (n < len) { d = addDays(d, 1); if (isSchool(d)) n++; } to = iso(d); }
    blocks.push({ id: bid++, type, title, from, to, scope: { kind, value } });
  };
  add(2, 1, 'Termin', 'Termin Stufe 8', 'class', '8b');
  add(2, 1, 'Verhindert', 'Arzttermin', 'person', [1]);
  add(4, 1, 'Termin', 'Termin Stufe 10', 'class', '10a');
  add(9, 1, 'Exkursion', 'Exkursion Stufe 10', 'stufe', 10);
  add(11, 1, 'Verhindert', 'Termin 9b', 'class', '9b');
  add(11, 1, 'Krank', 'Krankmeldung 12a', 'class', '12a');
  add(16, 1, 'Termin', 'Termin Stufe 11', 'class', '11c');
  add(20, 3, 'Klassenfahrt', 'Klassenfahrt Berlin', 'class', '9a');
  add(25, 1, 'Termin', 'Termin Stufe 10', 'class', '10b');
  add(30, 1, 'Krank', 'Krankmeldung 12b', 'class', '12b');
  add(65, 1, 'Verhindert', 'Verhindert 10c', 'class', '10c');
  einsaetze = [
    { d: iso(addDays(TODAY, -2)), time: '10:05', type: 'Kreislauf', place: 'Mensa', ist: 2, soll: 2 },
    { d: iso(addDays(TODAY, -6)), time: '09:40', type: 'Sportunfall', place: 'Sporthalle', ist: 3, soll: 2 },
    { d: iso(addDays(TODAY, -8)), time: '10:20', type: 'Schnittwunde', place: 'Raum B014', ist: 1, soll: 2 },
  ];
  // Alter Plan ohne Sperrtage → zeigt Konflikte, bis neu generiert wird
  const y = TODAY.getFullYear(), mo = TODAY.getMonth();
  solve(y, mo, { ignoreBlocks: true });
  const nx = new Date(y, mo + 1, 1); solve(nx.getFullYear(), nx.getMonth(), { ignoreBlocks: true });
  blocks.slice(0, 4).forEach(b => {
    const person = SS.blockedIds(b, members).map(m).find(x => x.team != null);
    if (!person || b.from < iso(TODAY)) return;
    const team = members.filter(x => x.team === person.team).map(x => x.id).slice(0, settings.perShift);
    plan[b.from] = { team, teamId: person.team, extra: [], status: 'ok', tag: 'OK', rules: [], note: `Team ${team.map(id => m(id).first).join(' & ')}` };
  });
}
function emptyDb() {
  members = []; blocks = []; plan = {}; einsaetze = []; settings = { ...DEFAULT_SETTINGS, me: null };
  dayModes = {}; inventory = JSON.parse(JSON.stringify(DEFAULT_INVENTORY));
  reindex();
}

function boot() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      restore(JSON.parse(raw));
      return;
    }
  } catch (e) { /* kaputte Daten → Leere DB */ }
  // Wenn keine Daten vorhanden sind: Starte mit sauberer, leerer Datenbank statt Fake-Seed
  emptyDb();
}

/* ---------- Solver-Wrapper ---------- */
function solve(y, mo, opts = {}) {
  const r = SS.solveMonth({ year: y, month: mo, members, blocks, plan, settings, today: TODAY, dayModes, ...opts });
  Object.assign(plan, r.plan);
  return r.stats;
}

/* ---------- Sperrtage ---------- */
const affected = scope => SS.blockedIds({ scope }, members);
function scopeLabel(s) {
  if (s.kind === 'stufe') return `Stufe ${s.value}`;
  if (s.kind === 'class') return `Klasse ${s.value}`;
  const ids = (s.value || []).filter(m);
  return ids.length <= 2 ? ids.map(id => short(m(id))).join(', ') : `${ids.length} Personen`;
}
const covers = (b, d) => { const k = iso(d); return b.from <= k && k <= b.to; };
const blocksOn = d => blocks.filter(b => covers(b, d));
const blockedMap = d => SS.blockedMap(d, blocks, members);
const rangeLabel = b => {
  // Wiederkehrende Sperre: Wochentage anzeigen statt Datumsbereich
  if (b.weekly?.enabled && Array.isArray(b.weekly.days)) {
    const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const sorted = [...b.weekly.days].sort((a, z) => a - z);
    const label = sorted.map(d => names[d]).join(', ') || '–';
    return `jeden ${label} (unbefristet)`;
  }
  const base = b.from === b.to ? fmtS(parse(b.from)) : `${fmtS(parse(b.from))} – ${fmtS(parse(b.to))}`;
  if (b.hour) {
    const hr = SCHOOL_HOURS.find(h => h.h === +b.hour);
    return `${base} (${hr ? hr.h + '. Std.' : b.hour + '. Std.'})`;
  }
  return base;
};

/* ---------- Tages-Modi Helfer ---------- */
function getDayMode(d) {
  const k = iso(d);
  const m = dayModes[k] || 'normal';
  return DAY_MODES[m] || DAY_MODES.normal;
}
function setDayMode(d, modeKey) {
  const k = iso(d);
  if (!modeKey || modeKey === 'normal') {
    delete dayModes[k];
  } else {
    dayModes[k] = modeKey;
  }
  save();
}

/* ---------- Morgen-Alarm / Panic Mode Helfer ---------- */
function morningEmergencyCheck(d = TODAY) {
  const k = iso(d);
  const mode = getDayMode(d);
  if (mode.key === 'free') return null;
  const entry = evaluate(d);
  if (!entry) return null;
  const currentTeam = entry.team.filter(id => m(id));
  const absentOrSick = currentTeam.filter(id => !m(id).available || blockedMap(d).has(id));
  const activeMembers = currentTeam.filter(id => !absentOrSick.includes(id));
  const hasAusb = activeMembers.some(id => m(id).ausb);
  const neededPer = mode.key === 'event' ? 4 : settings.perShift;
  const isEmergency = absentOrSick.length > 0 || !hasAusb || activeMembers.length < neededPer;

  const bm = blockedMap(d);
  const standbys = members.filter(x => x.available && !bm.has(x.id) && !activeMembers.includes(x.id))
    .sort((a, b) => (b.ausb - a.ausb) || (b.springer - a.springer) || (a.total - b.total));

  return {
    date: d,
    dateIso: k,
    entry,
    activeMembers,
    absentOrSick,
    hasAusb,
    neededPer,
    isEmergency,
    standbys,
    mode
  };
}

/* ---------- Teams ---------- */
function teamsList() {
  const g = {};
  members.forEach(x => { if (x.team != null) (g[x.team] ||= []).push(x.id); });
  return Object.entries(g).filter(([, ids]) => ids.length > 1).map(([id, ids]) => ({ id: +id, ids }));
}
const teamMates = x => x.team == null ? [] : members.filter(y => y.team === x.team && y.id !== x.id);
const teamHasAusb = ids => ids.some(id => m(id) && m(id).ausb);
function linkPartner(a, b) {
  const ga = a.team != null ? members.filter(x => x.team === a.team) : [a];
  const gb = b.team != null ? members.filter(x => x.team === b.team) : [b];
  const merged = new Set([...ga, ...gb]);
  if (merged.size > 3) { toast('Ein Team hat maximal 3 Personen', true); return false; }
  const tid = a.team ?? b.team ?? (Math.max(0, ...members.map(x => x.team ?? 0)) + 1);
  merged.forEach(x => x.team = tid);
  return true;
}
function unlinkPartner(p) {
  const t = p.team; p.team = null;
  const rest = members.filter(x => x.team === t);
  if (rest.length === 1) rest[0].team = null;
}
function dissolveTeam(tid) { members.forEach(x => { if (x.team === tid) x.team = null; }); }

/* ---------- Mitglieder-CRUD ---------- */
function upsertMember(data, id) {
  const clean = { first: data.first.trim(), last: data.last.trim(), cls: data.cls.trim().toLowerCase(),
    ausb: !!data.ausb, springer: !!data.springer, available: !!data.available };
  clean.stufe = parseInt(clean.cls) || 0;
  // Oberstufen-Stufe (Q1-Q4) als 11-14 abbilden
  const q = clean.cls.match(/^q([1-4])$/);
  if (q) clean.stufe = 10 + parseInt(q[1]);
  if (id == null) {
    const x = { id: nextMemberId(), total: 0, year: 0, month: 0, team: null, ...clean };
    members.push(x); reindex(); save(); return x;
  }
  Object.assign(m(id), clean); save(); return m(id);
}
function deleteMember(id) {
  const x = m(id); if (!x) return;
  const t = x.team;
  members = members.filter(y => y.id !== id); reindex();
  if (t != null) { const rest = members.filter(y => y.team === t); if (rest.length === 1) rest[0].team = null; }
  blocks = blocks.map(b => b.scope.kind === 'person' ? { ...b, scope: { ...b.scope, value: b.scope.value.filter(v => v !== id) } } : b)
    .filter(b => b.scope.kind !== 'person' || b.scope.value.length);
  Object.entries(plan).forEach(([k, e]) => {
    if (!e.team.includes(id) && !(e.extra || []).includes(id)) return;
    e.team = e.team.filter(v => v !== id); e.extra = (e.extra || []).filter(v => v !== id);
    if (k >= iso(TODAY)) { e.status = 'bad'; e.tag = 'DEL'; e.note = 'Person entfernt – Plan neu generieren'; }
  });
  if (settings.me === id) settings.me = members[0]?.id ?? null;
  save();
}

/* ---------- Bewertung des Plans (hart gegen aktuelle Sperrtage/Verfügbarkeit) ---------- */
function evaluate(d) {
  const mode = getDayMode(d);
  const k = iso(d);
  if (mode.key === 'free') {
    return { team: [], teamId: null, extra: [], status: 'ok', tag: 'FREI', hit: [], note: 'Wandertag / Schulfrei – regulärer Dienst entfällt' };
  }
  const e = plan[k]; if (!e) return null;
  const bm = blockedMap(d);
  const hit = e.team.filter(id => !m(id) || bm.has(id) || !m(id).available);
  const active = e.team.filter(id => !hit.includes(id));
  const hasAusb = active.some(id => m(id) && m(id).ausb);
  if (!hit.length) {
    if (!hasAusb && active.length > 0) {
      return { ...e, hit, status: 'bad', tag: 'AUSB!', note: 'Konflikt: Kein anwesendes Teammitglied hat Sanitätsausbildung (AUSB)' };
    }
    return { ...e, hit };
  }
  const b = hit.map(id => bm.get(id)).find(Boolean);
  let note = `Konflikt: ${hit.map(id => m(id)?.first || '?').join(', ')} – ${b ? b.title : 'krank gemeldet'}.`;
  if (!hasAusb) note += ' (Keine AUSB mehr vor Ort)';
  return { ...e, hit, status: 'bad', tag: b ? BTYPES[b.type].tag : 'KR', note: `${note} Plan neu generieren.` };
}
function monthDays(y, mo) { const out = [], len = new Date(y, mo + 1, 0).getDate(); for (let i = 1; i <= len; i++) { const d = new Date(y, mo, i); if (isSchool(d)) out.push(d); } return out; }
const openIn = (y, mo) => monthDays(y, mo).filter(d => d >= TODAY).filter(d => evaluate(d)?.status === 'bad').length;
function planCounts(y, mo) {
  const c = new Map(); members.forEach(x => { if (x.team != null || x.springer) c.set(x.id, 0); });
  monthDays(y, mo).forEach(d => { const e = evaluate(d); if (e) e.team.forEach(id => { if (c.has(id)) c.set(id, c.get(id) + 1); }); });
  return c;
}

/* ---------- Export-Text ---------- */
const planRows = (y, mo) => monthDays(y, mo).map(d => ({ d, e: evaluate(d) }));
function planText(y, mo) {
  const lines = [`*SaniAlarm · Dienstplan ${MONTHS[mo]} ${y}*`, `${DEFAULT_LOCATION} · 1. große Pause`, ''];
  let wk = null;
  planRows(y, mo).forEach(({ d, e }) => {
    if (weekKey(d) !== wk) { if (wk) lines.push(''); lines.push(`_KW ${kw(d)}_`); wk = weekKey(d); }
    const team = e ? (e.team.length ? e.team.map(id => short(m(id))).join(' & ') : 'OFFEN – bitte melden') : '–';
    lines.push(`${fmtS(d)}  ${team}${e && e.status === 'bad' ? '  (!)' : ''}`);
  });
  lines.push('', 'Tausch nur nach Absprache mit der AG-Leitung.');
  return lines.join('\n');
}
