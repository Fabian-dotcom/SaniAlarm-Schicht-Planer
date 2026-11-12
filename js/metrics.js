/* SaniAlarm – Kennzahlen-Engine (Fairness, Quoten, Trends, Solver-Score)
 *
 * Reine Logik ohne DOM → läuft im Browser (window.SaniMetrics) und in Node (require).
 *
 * Datenquellen:
 *  - plan:   { 'YYYY-MM-DD': { team:[ids], extra:[ids], status, tag, ... } }
 *  - einsaetze: [{ d:'YYYY-MM-DD', time, type, place, ist, soll, extra:[ids], ... }]
 *  - members: [{ id, first, last, cls, ausb, springer, available, total, year, month, team, ... }]
 *  - blocks:  Sperrtage (Klausuren, Krank, Klassenfahrt, …)
 *
 * Exportierte Kennzahlen:
 *  Q_i  Einsatzquote während Bereitschaft   = Einsätze während Dienst / Dienste * 100
 *  V_i  Verfügbarkeitsquote                 = verfügbare mögliche Dienste / alle möglichen * 100
 *  S_i  Dienstquote                         = zugeteilte Dienste / verfügbare mögliche Dienste
 *  L̄    Durchschnittsbelastung, D_i, D_i%, σ, VK
 *  T_i  30-Tage-Trend                       = L_letzte30 / L_vorherige30
 *  P_i  Multi-Faktor-Solver-Score (0.35 F + 0.25 R + 0.20 S + 0.10 K + 0.10 T)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaniMetrics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const t = new Date(d); t.setDate(t.getDate() + n); return t; };
  const isSchool = d => d.getDay() > 0 && d.getDay() < 6;

  /* ---------- Grund-Statistik ---------- */
  const avg = vals => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  function stdDev(vals) {
    if (vals.length < 2) return 0;
    const a = avg(vals);
    return Math.sqrt(vals.reduce((s, v) => s + (v - a) ** 2, 0) / vals.length);
  }
  /** Fairness-Score 0..100 aus VK (100 = perfekt gleich). */
  function fairnessFromVK(vk) { return Math.max(0, Math.min(100, Math.round(100 - vk))); }
  const clamp100 = x => Math.max(0, Math.min(100, Math.round(x)));

  /* ---------- Datenzugriff ---------- */
  /** Alle Plan-Einträge im Zeitraum [fromIso..toIso] mit Typ-Klassifikation. */
  function planInRange(plan, fromIso, toIso) {
    const out = [];
    Object.entries(plan || {}).forEach(([k, e]) => {
      if (k < fromIso || k > toIso) return;
      const sprOnly = e.tag === 'SPR' && (!e.teamId && e.team && e.team.length && (!e.extra || e.extra.length === e.team.length));
      const extraOnly = (e.extra || []).filter(id => !(e.team || []).includes(id));
      out.push({
        k, e, type: e.tag === 'FREI' ? 'free'
          : sprOnly ? 'sprOnly'
            : extraOnly.length ? 'withExtra'
              : e.status === 'bad' ? 'open'
                : e.status === 'warn' ? 'relaxed'
                  : 'regular'
      });
    });
    return out;
  }

  /**
   * Klassifiziert für eine Person einen Dienst-Eintrag nach dem 4-Zustands-Modell:
   *  1 regular+alarm     2 regular+noAlarm     3 offDuty+alarm (Springer)     4 scheduled+absent
   */
  function classifyDay(entry, memberId, einsatzForDay, wasAbsent) {
    const scheduled = entry && (entry.team || []).includes(memberId);
    const extra = entry && (entry.extra || []).includes(memberId) && !scheduled;
    const alarm = !!(einsatzForDay && (einsatzForDay.ist > 0));
    const present = !wasAbsent && entry && entry.status !== 'bad';
    if (scheduled && alarm && present) return 'regular_alarm';
    if (scheduled && !alarm && present) return 'regular_quiet';
    if ((extra || (!entry && alarm)) && alarm) return 'offduty_alarm';
    if (scheduled && wasAbsent) return 'absent';
    if (scheduled || extra) return present ? 'regular_quiet' : 'absent';
    if (alarm && einsatzForDay && (einsatzForDay.ist || []).length) return 'offduty_alarm';
    return null;
  }

  /* ---------- Per-Person-Metriken ---------- */
  /**
   * @param {object} o { members, plan, einsaetze, blocks, today(Date), perShift (Soll pro Dienst),
   *                    weights? {f,r,s,k,t}, timeframe {from,to} }
   * @returns per Mitglied: { duties, alarms, Q, V, S, L, D, Dpct, T, P, lastShift, daysSinceLast,
   *                          examPressure, springerShifts, absent, byType:{...} }
   */
  function memberMetrics(o) {
    const { members, plan, einsaetze = [], blocks = [], today, perShift = 2 } = o;
    const fromIso = o.from || '0000-01-01', toIso = o.to || '9999-12-31';
    const w = { f: 0.35, r: 0.25, s: 0.20, k: 0.10, t: 0.10, ...(o.weights || {}) };
    const einsatzByDay = new Map();
    (einsaetze || []).forEach(ev => { if (!einsatzByDay.has(ev.d)) einsatzByDay.set(ev.d, ev); });
    // Sperrtage pro Person
    const blockedIdsOf = b => {
      const s = b.scope;
      if (s.kind === 'stufe') return members.filter(m => (m.stufe ?? parseInt(m.cls)) === +s.value).map(m => m.id);
      if (s.kind === 'class') return members.filter(m => m.cls === s.value).map(m => m.id);
      return [...(s.value || [])];
    };
    const weeklyHit = (b, d) => b.weekly?.enabled && Array.isArray(b.weekly.days) ? b.weekly.days.includes(d.getDay()) : false;
    const blockFor = (id, d) => blocks.find(b => {
      const k = iso(d);
      if (b.weekly?.enabled && Array.isArray(b.weekly.days)) return b.weekly.days.includes(d.getDay()) && blockedIdsOf(b).includes(id);
      return b.from <= k && k <= b.to && blockedIdsOf(b).includes(id);
    });
    // Klausur am Tag NACH einem Dienst (Schuldruck-Score)
    const examOn = (id, d) => {
      const b = blockFor(id, d);
      return b && (b.type === 'Termin' || b.type === 'Klausur' || /klausur/i.test(b.title || ''));
    };

    const range = o.timeframe || { from: fromIso, to: toIso };
    const plannedDays = planInRange(plan, range.from, range.to);

    return members.map(x => {
      const duties = [], alarms = [], springerShifts = [], absentDays = [];
      let lastShift = null;
      plannedDays.forEach(({ k, e }) => {
        const d = parse(k);
        const scheduled = (e.team || []).includes(x.id);
        const extra = (e.extra || []).includes(x.id) && !scheduled;
        if (!scheduled && !extra) return;
        const cls = classifyDay(e, x.id, einsatzByDay.get(k), blockFor(x.id, d) ? true : false);
        const rec = { k, type: cls || (extra ? 'withExtra' : 'regular_quiet'), e };
        duties.push(rec);
        if (extra) springerShifts.push(rec);
        if (cls === 'regular_alarm' || cls === 'offduty_alarm') alarms.push(rec);
        if (cls === 'absent') absentDays.push(rec);
        if (!lastShift || k > lastShift) lastShift = k;
      });
      // Echte Einsätze aus dem Log (crew-Teilnahme) zählen zusätzlich:
      (einsaetze || []).forEach(ev => {
        if (ev.d < range.from || ev.d > range.to) return;
        if (!(ev.crew || []).some(c => c.id === x.id)) return;
        const plannedBefore = (ev.planned || []).includes(x.id);
        if (!plannedBefore) { // Off-Duty + Alarm (Spontan-Springer)
          const rec = { k: ev.d, type: 'offduty_alarm', ev };
          alarms.push(rec); springerShifts.push(rec); duties.push(rec);
        }
      });
      // Echte Einsätze (aus Einsatz-Log) während eigener Bereitschaft
      const alarmCount = alarms.length;
      const dutyCount = duties.length;
      const Q = dutyCount ? clamp100(alarmCount / dutyCount * 100) : null;

      // Verfügbarkeit: Schultage im Zeitraum ohne Sperrtag / ohne available=false
      // Sicherheitsgrenze: maximal 370 Tage auswerten (sonst wird 'Gesamt' zur Schleife über Jahrtausende)
      const fromEff = iso(addDays(today, -365)) > range.from ? iso(addDays(today, -365)) : range.from;
      let possible = 0, avail = 0;
      for (let d = parse(fromEff); iso(d) <= range.to && iso(d) <= iso(today); d = addDays(d, 1)) {
        if (!isSchool(d)) continue;
        possible++;
        const blocked = blockFor(x.id, d) || !x.available;
        if (!blocked) avail++;
      }
      const V = possible ? clamp100(avail / possible * 100) : null;
      const S = avail ? +(dutyCount / avail).toFixed(3) : null;

      const daysSinceLast = lastShift ? Math.max(0, Math.round((today - parse(lastShift)) / 864e5)) : null;
      // Klausur-Druck: gesperrte (Klausur-)Tage in den nächsten 14 Tagen
      let examPressure = 0;
      for (let i = 0; i <= 14; i++) {
        const d = addDays(today, i);
        if (examOn(x.id, d) || blockFor(x.id, d)) examPressure++;
      }
      // 30-Tage-Trend
      const l30 = duties.filter(r => r.k >= iso(addDays(today, -30))).length;
      const l30prev = duties.filter(r => r.k >= iso(addDays(today, -60)) && r.k < iso(addDays(today, -30))).length;
      const T = l30prev === 0 ? (l30 > 0 ? 2 : 1) : +(l30 / l30prev).toFixed(2);

      return {
        id: x.id, first: x.first, last: x.last, cls: x.cls,
        duties: dutyCount, alarms: alarmCount, springerShifts: springerShifts.length,
        absent: absentDays.length, Q, V, S, daysSinceLast, lastShift,
        examPressure, T, L: dutyCount
      };
    });
  }

  /* ---------- Gruppen-Fairness ---------- */
  /**
   * @returns { L̄, σ, VK, fairnessScore, perMember: {id → {L, D, Dpct}} }
   */
  function groupFairness(perList) {
    const loads = perList.map(p => p.L);
    const Lbar = avg(loads);
    const sd = stdDev(loads);
    const vk = Lbar ? (sd / Lbar * 100) : 0;
    const perMember = {};
    perList.forEach(p => {
      const D = p.L - Lbar;
      perMember[p.id] = { L: p.L, D: +D.toFixed(2), Dpct: Lbar ? +(D / Lbar * 100).toFixed(1) : 0 };
    });
    return {
      Lbar: +Lbar.toFixed(2), sigma: +sd.toFixed(2), vk: +vk.toFixed(1),
      fairnessScore: fairnessFromVK(vk), perMember
    };
  }

  /* ---------- Multi-Faktor-Solver-Score P_i ---------- */
  /**
   * @param weights {f,r,s,k,t} — Standard 0.35/0.25/0.20/0.10/0.10
   * @returns [{id, P, F, R, S, K, T}] (P = gewichtete Summe, niedriger = zuerst dran)
   */
  function solverScores(perList, opts = {}) {
    const w = { f: 0.35, r: 0.25, s: 0.20, k: 0.10, t: 0.10, ...(opts.weights || {}) };
    const maxLoad = Math.max(1, ...perList.map(p => p.L));
    return perList.map(p => {
      const F = p.L / maxLoad;                              // 0..1 Gesamtlast (hoch = viel belastet)
      const R = p.daysSinceLast == null ? 1 : Math.min(1, p.daysSinceLast / 14); // 0..1, hoch = lange her → bevorzugt
      const S = Math.min(1, (p.examPressure || 0) / 5);     // 0..1 Klausurdruck
      const K = p.springerShifts / Math.max(1, p.duties || 1); // 0..1 Springer-Anteil
      const T = p.T == null ? 1 : Math.min(2, Math.max(0, p.T)) / 2; // 0..1 Trend
      const P = w.f * F + w.r * R + w.s * S + w.k * K + w.t * T;
      return { id: p.id, P: +P.toFixed(3), F: +F.toFixed(2), R: +R.toFixed(2), S: +S.toFixed(2), K: +K.toFixed(2), T: +T.toFixed(2) };
    });
  }

  /* ---------- Dashboard-KPIs ---------- */
  /** 4 KPI-Karten des Statistik-Dashboards. */
  function dashboardKPIs(perList, group) {
    const loads = perList.map(p => p.L);
    const alarms = perList.map(p => p.alarms);
    const g = group || groupFairness(perList);
    const readinessFairness = g.fairnessScore;                                    // Bereitschafts-Fairness
    const alarmFair = fairnessFromVK(stdDev(alarms) / (avg(alarms) || 1) * 100);  // Einsatz-Fairness
    const combined = Math.round(readinessFairness * 0.6 + alarmFair * 0.4);       // Gesamtbelastung
    return { readinessFairness, alarmFairness: alarmFair, combined, vk: g.vk, vkOk: g.vk < 15 };
  }

  /* ---------- Heatmap-Klassifikation ---------- */
  /**
   * Liefert für eine Person pro Tag des Zeitraums eine Farbe-Klasse für die Heatmap.
   * @returns Map k → { cls, label }
   *  empty | quiet | alarm | extra | exam | absent
   */
  function heatmap(personId, plan, einsaetze = [], blocks = [], members = [], from, to, today) {
    const map = new Map();
    const einsatzByDay = new Map();
    (einsaetze || []).forEach(ev => { if (!einsatzByDay.has(ev.d)) einsatzByDay.set(ev.d, ev); });
    const blockedIdsOf = b => {
      const s = b.scope;
      if (s.kind === 'stufe') return members.filter(m => (m.stufe ?? parseInt(m.cls)) === +s.value).map(m => m.id);
      if (s.kind === 'class') return members.filter(m => m.cls === s.value).map(m => m.id);
      return [...(s.value || [])];
    };
    const blockFor = (id, d) => blocks.find(b => {
      const k = iso(d);
      if (b.weekly?.enabled && Array.isArray(b.weekly.days)) return b.weekly.days.includes(d.getDay()) && blockedIdsOf(b).includes(id);
      return b.from <= k && k <= b.to && blockedIdsOf(b).includes(id);
    });
    for (let d = parse(from); iso(d) <= to; d = addDays(d, 1)) {
      const k = iso(d);
      const e = plan[k];
      const scheduled = e && (e.team || []).includes(personId);
      const extra = e && (e.extra || []).includes(personId) && !scheduled;
      const ev = einsatzByDay.get(k);
      const blocked = blockFor(personId, d);
      let cls = 'empty', label = 'Kein Dienst';
      if (scheduled && ev && ev.ist > 0) { cls = 'alarm'; label = `Alarm: ${ev.type || 'Einsatz'} (${ev.place || ''})`; }
      else if (extra && ev && ev.ist > 0) { cls = 'alarm'; label = `Springer-Alarm: ${ev.type || ''}`; }
      else if (extra) { cls = 'extra'; label = 'Springer-Dienst'; }
      else if (scheduled && e.status === 'bad' && k <= iso(today)) { cls = 'absent'; label = `Fehlend/offen: ${e.note || ''}`; }
      else if (scheduled) { cls = 'quiet'; label = `Bereitschaft (${e.note || 'regulär'})`; }
      else if (blocked && /klausur|termin/i.test(blocked.type + ' ' + (blocked.title || ''))) { cls = 'exam'; label = `Klausur/Termin: ${blocked.title}`; }
      else if (blocked) { cls = 'exam'; label = `Verhindert: ${blocked.title || blocked.type}`; }
      map.set(k, { cls, label });
    }
    return map;
  }

  return { avg, stdDev, fairnessFromVK, clamp100, planInRange, classifyDay, memberMetrics, groupFairness, solverScores, dashboardKPIs, heatmap, iso, parse, addDays, isSchool };
});
