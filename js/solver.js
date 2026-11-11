/* SaniAlarm – Scheduling-Solver (Branch-and-Bound-Backtracking)
 *
 * Reine Logik ohne DOM → läuft im Browser (window.SaniSolver) und in Node (require).
 *
 * Ablauf:
 *  - Jeder Schultag ist eine Variable, die Domäne sind alle Teams (+ Springer-Auffüllung,
 *    + reine Springer-Besetzung, + "unbesetzt").
 *  - HARTE Regeln (nie gebrochen, nie relaxiert):
 *      · Sperrtage / Klausuren / Klassenfahrten / Abwesenheit
 *      · Verfügbarkeit (krank gemeldet)
 *      · mindestens eine ausgebildete Person (AUSB) pro Dienst
 *  - WEICHE Regeln (werden bei engem Plan mit Strafkosten gelockert → Warn-Badge):
 *      · max. 1 Dienst pro Woche pro Team / Springer
 *      · kein Wochentag doppelt pro Team und Monat
 *      · kein Freitag→Montag-Doppeldienst
 *      · volle Besetzung (perShift) / festes Team statt reiner Springer-Besetzung
 *  - Suche: Tiefensuche mit Backtracking, "most constrained day first", Lower-Bound-Pruning
 *    (Summe der minimalen Resttageskosten) und Node-/Zeitbudget.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaniSolver = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const t = new Date(d); t.setDate(t.getDate() + n); return t; };
  const isSchool = d => d.getDay() > 0 && d.getDay() < 6;
  const weekKey = d => iso(addDays(d, -((d.getDay() + 6) % 7)));
  const stufeOf = m => m.stufe != null ? +m.stufe : parseInt(m.cls, 10);

  /* Strafkosten: Sperrtage haben keine Kosten, weil sie gar nicht erst in der Domäne vorkommen */
  const PEN = { wd: 20, week: 60, fm: 80, sprWeek: 30, sprOnly: 40, missing: 150, none: 1000, extra: 2 };
  const LABEL = {
    wd: 'Wochentag-Regel gelockert',
    week: 'Wochen-Limit gelockert',
    fm: 'Fr–Mo-Regel gelockert',
    sprWeek: 'Springer mehrfach in der Woche',
    sprOnly: 'ohne festes Team (nur Springer)'
  };

  function blockedIds(block, members) {
    const s = block.scope;
    if (s.kind === 'stufe') return members.filter(m => stufeOf(m) === +s.value).map(m => m.id);
    if (s.kind === 'class') return members.filter(m => m.cls === s.value).map(m => m.id);
    return [...(s.value || [])];
  }
  function blockedMap(date, blocks, members) {
    const k = iso(date), map = new Map();
    blocks.forEach(b => {
      // Wiederkehrende Sperre ("Generell verhindert"): gilt immer an bestimmten Wochentagen,
      // unabhängig vom Datumsbereich (weeks = true → unbefristet).
      if (b.weekly && b.weekly.enabled && Array.isArray(b.weekly.days)) {
        if (!b.weekly.days.includes(date.getDay())) return;
        blockedIds(b, members).forEach(id => { if (!map.has(id)) map.set(id, b); });
        return;
      }
      if (b.from <= k && k <= b.to) blockedIds(b, members).forEach(id => { if (!map.has(id)) map.set(id, b); });
    });
    return map;
  }
  function buildTeams(members) {
    const g = new Map();
    members.forEach(m => { if (m.team != null) { if (!g.has(m.team)) g.set(m.team, []); g.get(m.team).push(m.id); } });
    return [...g].filter(([, ids]) => ids.length > 1).map(([id, ids]) => ({ id: +id, ids }));
  }
  function fairness(vals) {
    if (!vals.length) return 100;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length || 1;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length);
    return Math.max(0, Math.round(100 - sd / avg * 100));
  }

  function toEntry(o, per, byId) {
    const first = id => (byId.get(id) || { first: '?' }).first;
    if (!o.team.length) {
      return { team: [], teamId: null, extra: [], status: 'bad', tag: `0/${per}`, rules: [],
        note: 'Kein gültiges Team – alle gesperrt oder ohne AUSB' };
    }
    const names = o.team.map(first).join(' & ');
    const labels = o.viol.map(v => LABEL[v]);
    const base = { team: o.team, teamId: o.teamId, extra: o.extra, rules: o.viol };
    const sprNames = o.extra.map(first).join(', ');
    let note, status = 'warn', tag;
    if (o.missing > 0) {
      tag = `${o.team.length}/${per}`;
      note = `Unterbesetzt · ${names}`;
    } else if (o.sprOnly) {
      tag = 'SPR'; note = `${names} · nur Springer`;
    } else if (o.extra.length) {
      tag = 'SPR'; note = `${names} · Springer ${sprNames} ergänzt`;
    } else if (o.viol.length) {
      tag = 'REG'; note = `${names}`;
    } else {
      status = 'ok'; tag = 'OK'; note = `Team ${names}`;
    }
    const extraLabels = labels.filter(l => !(o.sprOnly && l === LABEL.sprOnly));
    if (status === 'warn' && extraLabels.length && tag !== 'SPR') note += ` · ${extraLabels.join(', ')}`;
    else if (status === 'warn' && extraLabels.length) note += ` · ${extraLabels.join(', ')}`;
    return { ...base, status, tag, note };
  }

  /**
   * @param {object} o {year, month(0-11), members, blocks, plan, settings, today, ignoreBlocks?, budget?, timeMs?}
   * @returns {{plan:Object, stats:Object}} plan enthält nur die neu berechneten Tage
   */
  function solveMonth(o) {
    const t0 = Date.now();
    const { year, month, members, blocks, settings, today } = o;
    const plan = o.plan || {};
    const dayModes = o.dayModes || {};
    const defaultPer = Math.max(1, settings.perShift | 0);
    const budget = o.budget || 20000, timeMs = o.timeMs || 1200;
    const byId = new Map(members.map(m => [m.id, m]));
    const teams = buildTeams(members);
    const todayK = iso(today);
    const len = new Date(year, month + 1, 0).getDate();

    /* --- Variablen: Tage, die (neu) berechnet werden; vergangene Tage mit Plan bleiben fix --- */
    const days = [], solveKeys = new Set();
    for (let i = 1; i <= len; i++) {
      const d = new Date(year, month, i);
      if (!isSchool(d)) continue;
      const k = iso(d);
      if (k < todayK && plan[k]) continue;
      const modeKey = dayModes[k] || 'normal';
      const per = modeKey === 'event' ? Math.max(defaultPer, 4) : defaultPer;
      days.push({ d, k, wk: weekKey(d), wd: d.getDay(), ym: `${year}-${month}`,
        fri: iso(addDays(d, -3)), mon: iso(addDays(d, 3)), modeKey, per });
      solveKeys.add(k);
    }

    const loadOf = ids => ids.reduce((a, id) => a + byId.get(id).total, 0) / ids.length;
    const minLoad = teams.length ? Math.min(...teams.map(t => loadOf(t.ids))) : 0;

    days.forEach(day => {
      if (day.modeKey === 'free') {
        day.cands = [];
        day.springers = [];
        day.blocked = new Map();
        return;
      }
      day.blocked = o.ignoreBlocks ? new Map() : blockedMap(day.d, blocks, members);
      day.cands = teams.map(t => ({
        t, usable: t.ids.filter(id => { const m = byId.get(id); return m.available && !day.blocked.has(id); })
      })).filter(c => c.usable.length && c.usable.some(id => byId.get(id).ausb)).map(c => {
        if (c.usable.length > day.per) {            // Team größer als Soll-Besetzung: AUSB + wenig belastete zuerst
          c.usable = [...c.usable].sort((a, b) => (byId.get(b).ausb - byId.get(a).ausb) || byId.get(a).total - byId.get(b).total).slice(0, day.per);
        }
        return c;
      });
      day.springers = members.filter(m => m.springer && m.available && !day.blocked.has(m.id));
    });

    /* --- Nutzungszähler (mit Undo) --- */
    const U = { week: new Map(), wd: new Map(), day: new Map(), spr: new Map(), cnt: new Map() };
    const get = (m, k) => m.get(k) || 0;
    const inc = (m, k, v) => { const n = get(m, k) + v; if (n) m.set(k, n); else m.delete(k); };
    const meta = d => ({ wk: weekKey(d), wd: d.getDay(), ym: `${d.getFullYear()}-${d.getMonth()}`, k: iso(d) });
    function apply(e, m, s) {
      if (e.teamId != null) {
        inc(U.week, e.teamId + '|' + m.wk, s);
        inc(U.wd, e.teamId + '|' + m.ym + '|' + m.wd, s);
        inc(U.day, e.teamId + '|' + m.k, s);
        inc(U.cnt, e.teamId, s);
      }
      (e.extra || []).forEach(id => inc(U.spr, id + '|' + m.wk, s));
    }
    // bereits bestehende Einträge außerhalb des Lösungsraums (Vergangenheit, Nachbarmonate) wirken als Randbedingung
    Object.entries(plan).forEach(([k, e]) => { if (!solveKeys.has(k)) apply(e, meta(parse(k)), 1); });

    /* --- Domäne eines Tages unter dem aktuellen Zustand --- */
    function options(day) {
      if (day.modeKey === 'free') {
        return [{ team: [], teamId: null, extra: [], viol: [], missing: 0, cost: 0, sprOnly: false, isFree: true }];
      }
      const out = [];
      const curPer = day.per;
      for (const c of day.cands) {
        const t = c.t, viol = []; let cost = 0;
        if (get(U.week, t.id + '|' + day.wk) > 0) { viol.push('week'); cost += PEN.week; }
        if (settings.weekday && get(U.wd, t.id + '|' + day.ym + '|' + day.wd) > 0) { viol.push('wd'); cost += PEN.wd; }
        if (settings.friMon) {
          const other = day.wd === 1 ? day.fri : day.wd === 5 ? day.mon : null;
          if (other && get(U.day, t.id + '|' + other) > 0) { viol.push('fm'); cost += PEN.fm; }
        }
        const team = [...c.usable], extra = [];
        let missing = 0;
        const need = curPer - team.length;
        if (need > 0) {
          const pool = day.springers.filter(s => !team.includes(s.id))
            .map(s => ({ s, used: get(U.spr, s.id + '|' + day.wk) > 0 }))
            .sort((a, b) => (a.used - b.used) || a.s.total - b.s.total);
          for (let i = 0; i < need; i++) {
            const p = pool[i];
            if (!p) { missing++; continue; }
            team.push(p.s.id); extra.push(p.s.id);
            cost += PEN.extra;
            if (p.used) { if (!viol.includes('sprWeek')) viol.push('sprWeek'); cost += PEN.sprWeek; }
          }
        }
        cost += missing * PEN.missing;
        cost += 0.8 * get(U.cnt, t.id);                                   // konvex → gleichmäßige Rotation
        if (settings.fair) cost += Math.max(0, loadOf(t.ids) - minLoad) * 0.05; // Fairness über Gesamtdienste
        cost += ((t.id * 7 + day.d.getDate()) % 11) * 0.001;               // deterministischer Tie-Break
        out.push({ team, teamId: t.id, extra, viol, missing, cost, sprOnly: false });
      }
      if (day.springers.some(s => s.ausb)) {                              // Notlösung: nur Springer
        const pool = day.springers.map(s => ({ s, used: get(U.spr, s.id + '|' + day.wk) > 0 }));
        const byUse = (a, b) => (a.used - b.used) || a.s.total - b.s.total;
        const first = pool.filter(p => p.s.ausb).sort(byUse)[0];
        const chosen = [first, ...pool.filter(p => p !== first).sort(byUse)].slice(0, curPer);
        const viol = ['sprOnly']; let cost = PEN.sprOnly;
        chosen.forEach(p => { if (p.used) { if (!viol.includes('sprWeek')) viol.push('sprWeek'); cost += PEN.sprWeek; } });
        const missing = curPer - chosen.length; cost += missing * PEN.missing;
        const ids = chosen.map(p => p.s.id);
        out.push({ team: ids, teamId: null, extra: ids, viol, missing, cost, sprOnly: true });
      }
      out.push({ team: [], teamId: null, extra: [], viol: ['none'], missing: curPer, cost: PEN.none, sprOnly: false }); // unbesetzt
      return out;
    }

    /* --- Branch-and-Bound-Backtracking --- */
    const cmp = (a, b) => a.cost - b.cost;
    const sel = new Array(days.length);
    let best = { cost: Infinity, sel: null }, nodes = 0, aborted = false;

    function dfs(cost, remaining) {
      if (!remaining.length) { if (cost < best.cost) best = { cost, sel: sel.slice() }; return; }
      nodes++;
      if (best.sel && (nodes > budget || Date.now() - t0 > timeMs)) { aborted = true; return; }
      let lb = 0, pick = -1, pickOpts = null, pickScore = Infinity, pickMin = 0;
      for (const di of remaining) {
        const opts = options(days[di]).sort(cmp);
        lb += opts[0].cost;                                               // zulässige untere Schranke
        let score = 0;
        for (const x of opts) if (!x.viol.length && !x.missing && !x.sprOnly && x.team.length) score++;
        if (score < pickScore) { pickScore = score; pick = di; pickOpts = opts; pickMin = opts[0].cost; }
      }
      if (cost + lb >= best.cost) return;
      const rest = remaining.filter(x => x !== pick), lbRest = lb - pickMin;
      for (const x of pickOpts) {
        if (cost + x.cost + lbRest >= best.cost) break;
        sel[pick] = x; apply(x, days[pick], 1);
        dfs(cost + x.cost, rest);
        apply(x, days[pick], -1);
        if (aborted) return;
      }
    }
    if (days.length) dfs(0, days.map((_, i) => i));

    /* --- Ergebnis --- */
    const out = {}; let relaxed = 0, understaffed = 0, open = 0;
    days.forEach((day, i) => {
      const selItem = best.sel[i];
      if (day.modeKey === 'free' || selItem.isFree) {
        out[day.k] = { team: [], teamId: null, extra: [], status: 'ok', tag: 'FREI', rules: [],
          note: 'Wandertag / Schulfrei – regulärer Dienst entfällt' };
        return;
      }
      const e = toEntry(selItem, day.per, byId);
      if (day.modeKey === 'event') {
        e.note = `[Großevent] ${e.note}`;
      } else if (day.modeKey === 'short') {
        e.note = `[Verkürzt] ${e.note}`;
      }
      out[day.k] = e;
      if (e.status === 'bad') open++;
      else if (e.tag === 'REG' || (e.rules && e.rules.length)) relaxed++;
      if (/^\d\//.test(e.tag) && e.status === 'warn') understaffed++;
    });
    return { plan: out, stats: { days: days.length, relaxed, understaffed, open,
      cost: best.cost === Infinity ? 0 : Math.round(best.cost * 100) / 100, nodes, aborted, ms: Date.now() - t0 } };
  }

  return { solveMonth, blockedIds, blockedMap, buildTeams, fairness, iso, parse, addDays, isSchool, weekKey, stufeOf, PEN, LABEL };
});
