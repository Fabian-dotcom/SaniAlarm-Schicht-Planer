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
  // Rollen: ausgebildet (AUSB) vs in Ausbildung (trainee); alte Backups haben nur Flag-Felder.
  const isTrainee = m => m.quali === 'ausbildung' || m.ausbildungsStatus === 'ausbildung'
    || m.inAusbildung === true || m.trainee === true || m.azubi === true || m.isTrainee === true;
  const isAusb = m => !isTrainee(m) && (m.quali === 'ausb' || m.ausbildungsStatus === 'ausb'
    || (m.ausb && m.quali !== 'helfer'));

  /* Strafkosten: Sperrtage haben keine Kosten, weil sie gar nicht erst in der Domäne vorkommen */
  const PEN = { wd: 20, week: 60, fm: 80, sprWeek: 30, sprOnly: 40, missing: 150, none: 1000, extra: 2 };
  const LABEL = {
    wd: 'Wochentag-Regel gelockert',
    week: 'Wochen-Limit gelockert',
    fm: 'Fr–Mo-Regel gelockert',
    sprWeek: 'Springer mehrfach in der Woche',
    sprOnly: 'ohne festes Team (nur Springer)'
  };
  const RULE_DETAILS = {
    week: 'Das Team wurde bereits an einem anderen Tag derselben Kalenderwoche eingesetzt. Es wurde trotzdem gewählt, weil es die beste verfügbare Besetzung für diesen Tag war.',
    wd: 'Das Team hatte diesen Wochentag bereits in diesem Monat. Die Wochentag-Regel wurde gelockert, weil sonst keine bessere gültige Besetzung gefunden wurde.',
    fm: 'Das Team ist bereits am Freitag oder am folgenden Montag eingeteilt. Die Fr–Mo-Pause wurde gelockert, damit dieser Dienst besetzt werden kann.',
    sprWeek: 'Mindestens ein Springer wurde diese Kalenderwoche schon eingesetzt und wird hier erneut als Ergänzung gebraucht.',
    sprOnly: 'Es gab kein einsetzbares festes Team mit anwesender ausgebildeter Person. Deshalb wurde auf ein reines Springer-Team zurückgegriffen.',
    sprOnlyDisabled: 'Ein reines Springer-Team wäre nötig gewesen, aber der dafür benötigte ausgebildete Springer ist nicht verfügbar.',
    trainee: 'Eine oder mehrere Personen in Ausbildung wurden zur Soll-Besetzung ergänzt. Der Dienst ist als Warnung markiert, weil Azubis zusätzlich zu einem erfahrenen Team eingesetzt werden.',
    springerAdded: 'Die Soll-Besetzung wurde durch Springer ergänzt; die regulären Teammitglieder allein haben nicht alle Plätze gefüllt.',
    pref: 'Eine verfügbare Azubi-Gruppe hatte andere Ausbilder-Teams als Präferenz. Diese Teams konnten an diesem Tag nicht passend besetzt werden, daher wurde die Präferenz übergangen.',
    teamOnly: 'Nicht alle Mitglieder des festen Teams sind anwesend oder verfügbar. Das verfügbare Teammitglied wird durch geeignete Personen ergänzt.',
    soleMember: 'Das feste Team besteht nur aus einer Person. Sie wurde durch geeignete Personen ergänzt, damit ein sicher besetzter Dienst entsteht.',
    missing: 'Das Team konnte nicht auf die eingestellte Soll-Größe ergänzt werden. Es fehlen verfügbare, nicht gesperrte und für diesen Dienst zulässige Personen.',
    none: 'Es gab keine verfügbare Besetzung, die unveränderlichen Anforderungen (AUSB, Verfügbarkeit und Sperrtage) erfüllt.'
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
      return { team: [], teamId: null, extra: [], status: 'bad', tag: `0/${per}`, rules: ['none'],
        note: RULE_DETAILS.none, warningDetails: [RULE_DETAILS.none] };
    }
    const names = o.team.map(first).join(' & ');
    const labels = o.viol.map(v => LABEL[v]).filter(Boolean);
    const warningDetails = o.warningDetails?.length ? [...o.warningDetails] : o.viol.map(v => RULE_DETAILS[v]).filter(Boolean);
    if (o.missing > 0 && !warningDetails.includes(RULE_DETAILS.missing)) warningDetails.push(RULE_DETAILS.missing);
    const extraTrainees = o.extra.some(id => isTrainee(byId.get(id) || {}));
    const extraOthers = o.extra.some(id => !isTrainee(byId.get(id) || {}));
    if (extraTrainees && !warningDetails.includes(RULE_DETAILS.trainee)) warningDetails.push(RULE_DETAILS.trainee);
    if (extraOthers && !warningDetails.includes(RULE_DETAILS.springerAdded)) warningDetails.push(RULE_DETAILS.springerAdded);
    const base = { team: o.team, teamId: o.teamId, extra: o.extra, rules: o.viol, warningDetails };
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
    if (status === 'warn' && extraLabels.length) note += ` · ${extraLabels.join(', ')}`;
    if (o.sprOnly && o.viol.includes('pref')) note += ' · Ausbilder-Präferenz nicht verfügbar';
    return { ...base, status, tag, note };
  }

  /**
   * @param {object} o {year, month(0-11), members, blocks, plan, settings, today, ignoreBlocks?, budget?, timeMs?}
   * @returns {{plan:Object, stats:Object}} plan enthält nur die neu berechneten Tage
   */
  function solveMonth(o) {
    const t0 = Date.now();
    const { year, month, members, blocks, settings, today } = o;
    const einsaetzeRef = o.einsaetze || [];
    const plan = o.plan || {};
    const dayModes = o.dayModes || {};
    const defaultPer = Math.max(1, settings.perShift | 0);
    const budget = o.budget || 20000, timeMs = o.timeMs || 1200;
    const byId = new Map(members.map(m => [m.id, m]));
    const teams = buildTeams(members);
    const todayK = iso(today);
    const fromK = o.from || `${year}-${pad(month + 1)}-01`;
    const toK = o.to || iso(new Date(year, month + 1, 0));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromK) || !/^\d{4}-\d{2}-\d{2}$/.test(toK) || fromK > toK) {
      throw new Error('Ungültiger Planungszeitraum');
    }

    /* --- Variablen: nur leere Tage im ausgewählten Zeitraum; bestehende Pläne bleiben fix --- */
    const days = [], solveKeys = new Set();
    const lockedMap = o.locked || {};   // { key: entry } – händisch gesetzte Tage (immer Vorrang)
    const rangeStart = parse(fromK), rangeEnd = parse(toK);
    const boundedStart = rangeStart < today ? new Date(today) : rangeStart;
    for (let d = boundedStart; d <= rangeEnd; d = addDays(d, 1)) {
      if (!isSchool(d)) continue;
      const k = iso(d);
      if (k < todayK) continue;
      const isLocked = !!(lockedMap[k] || (o.replaceExisting && plan[k] && plan[k].mark));
      if (isLocked) continue;          // händisch fixierte Tage haben immer Vorrang
      if (!o.replaceExisting && plan[k]) continue;
      const modeKey = dayModes[k] || 'normal';
      const per = modeKey === 'event' ? Math.max(defaultPer, 4) : defaultPer;
      const ym = `${d.getFullYear()}-${d.getMonth()}`;
      days.push({ d, k, wk: weekKey(d), wd: d.getDay(), ym,
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
      // Ausgebildete ohne festes Team helfen als Ausb-Springer zwischen Präferenz-Teams
      day.ausbSpringers = members.filter(m => isAusb(m) && !isTrainee(m) && m.team == null && m.available && !day.blocked.has(m.id) && !m.springer);
      // Trainee-Pool: Auszubildende ohne festes Team, für Mentoring-Dienste
      day.traineePool = members.filter(m => isTrainee(m) && m.available && !day.blocked.has(m.id));
      day.maxShift = Math.max(day.per, (settings.maxShift || day.per + 2));
    });

    /* --- Nutzungszähler (mit Undo) --- */
    const U = { week: new Map(), wd: new Map(), day: new Map(), spr: new Map(), cnt: new Map(), trainee: new Map() };
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
      (e.extra || []).forEach(id => {
        inc(U.spr, id + '|' + m.wk, s);
        if (isTrainee(byId.get(id) || {})) inc(U.trainee, id, s);
      });
    }
    // Bestehende Einträge außerhalb des Lösungsraums wirken als Randbedingung;
    // explizit zur Neuoptimierung ausgewählte Tage werden dagegen aus der Statistik entfernt.
    Object.entries(plan).forEach(([k, e]) => { if (!solveKeys.has(k)) apply(e, meta(parse(k)), 1); });

    /* --- Wochenvorziehung: spätere Sperren bevorzugen passende frühe Tage --- */
    const pressBonus = new Map();
    if (!o.ignoreBlocks) members.forEach(mm => {
      let late = 0, early = 0;
      days.forEach(day => {
        if (day.wd < 1 || day.wd > 5) return;
        if (blockedMap(day.d, blocks, members).has(mm.id)) { if (day.wd >= 4) late++; else early++; }
      });
      pressBonus.set(mm.id, late - early);
    });

    /* --- Multi-Faktor-Score P_i = wF*F + wR*R + wS*S + wK*K + wT*T (Gewichte aus Settings) --- */
    const W = { f: settings.wF ?? 0.35, r: settings.wR ?? 0.25, s: settings.wS ?? 0.20, k: settings.wK ?? 0.10, t: settings.wT ?? 0.10 };
    // pressBonus wird aus den konkreten Tagen dieses Generierungszeitraums berechnet.
    const todayTs = +today;
    // Historische Daten pro Person: letzte Dienst-Tage + Springer-Einsätze + Sperrtage (Klausurdruck)
    const lastDuty = new Map(), sprCount = new Map();
    members.forEach(mm => { lastDuty.set(mm.id, null); sprCount.set(mm.id, 0); });
    Object.entries(plan).forEach(([k, e]) => {
      if (k >= todayK) return;
      const d = parse(k);
      (e.team || []).forEach(id => { const cur = lastDuty.get(id); if (!cur || k > cur) lastDuty.set(id, k); });
    });
    (einsaetzeRef || []).forEach(ev => { (ev.extra || []).forEach(id => sprCount.set(id, (sprCount.get(id) || 0) + 1)); });
    const maxTotal = Math.max(1, ...members.map(mm => mm.total || 0));
    // Klausurdruck pro Person vorberechnen (nächste 14 Tage)
    const examAhead = new Map();
    if (!o.ignoreBlocks) members.forEach(mm => {
      let n = 0;
      for (let i = 0; i <= 14; i++) {
        const d = addDays(today, i);
        if (!isSchool(d)) continue;
        if (blockedMap(d, blocks, members).has(mm.id)) n++;
      }
      examAhead.set(mm.id, n);
    });
    function piScore(id) {
      const mm = byId.get(id) || {};
      const F = (mm.total || 0) / maxTotal;
      const ld = lastDuty.get(id);
      const R = ld ? Math.min(1, (todayTs - +parse(ld)) / (14 * 864e5)) : 1;
      // Klausurdruck: Sperrtage in den nächsten 14 Tagen (vorberechnet pro Person)
      const S = Math.min(1, (examAhead.get(id) || 0) / 5);
      const K = Math.min(1, (sprCount.get(id) || 0) / 5);
      const base = mm.total || 0;
      const prev30 = members.reduce((a, x) => a + (x.total || 0), 0) / (members.length || 1);
      const T = prev30 ? Math.min(2, base / prev30) / 2 : 1;
      return W.f * F + W.r * R + W.s * S + W.k * K + W.t * T;
    }
    let piCache = new Map();
    const pi = id => { if (!piCache.has(id)) piCache.set(id, piScore(id)); return piCache.get(id); };
    const piRefresh = () => { piCache = new Map(); };

    /* --- Domäne eines Tages unter dem aktuellen Zustand --- */
    function options(day) {
      if (day.modeKey === 'free') {
        return [{ team: [], teamId: null, extra: [], viol: [], missing: 0, cost: 0, sprOnly: false, isFree: true }];
      }
      const out = [];
      const curPer = day.per;
      for (const c of day.cands) {
        const t = c.t, viol = []; let cost = 0;
        const sameWeek = get(U.week, t.id + '|' + day.wk) > 0;
        if (sameWeek) { viol.push('week'); cost += PEN.week; }
        if (!sameWeek && settings.weekday && get(U.wd, t.id + '|' + day.ym + '|' + day.wd) > 0) { viol.push('wd'); cost += PEN.wd; }
        if (!sameWeek && settings.friMon) {
          const other = day.wd === 1 ? day.fri : day.wd === 5 ? day.mon : null;
          if (other && get(U.day, t.id + '|' + other) > 0) { viol.push('fm'); cost += PEN.fm; }
        }
        const team = [...c.usable], extra = [];
        let missing = 0, prefSkipped = false;
        const reasonCodes = new Set();
        // Ausb-Springer (ausgebildet, ohne Team) zuerst als Ergänzung – sie sammeln Rotation
        const auxPool = [
          ...day.springers.filter(s => !team.includes(s.id) && isAusb(s)).map(s => ({ s, kind: 'spr' })),
          ...day.ausbSpringers.filter(s => !team.includes(s.id)).map(s => ({ s, kind: 'aux' })),
          ...day.traineePool.filter(s => !team.includes(s.id)).map(s => ({ s, kind: 'trainee' })),
          ...day.springers.filter(s => !team.includes(s.id) && !isAusb(s) && !isTrainee(s)).map(s => ({ s, kind: 'spr' })),
        ];
        const need = curPer - team.length;
        const fillUp = (limit, allowTraineeBonus) => {
          const usedWeek = id => get(U.spr, id + '|' + day.wk) > 0;
          // Trainee-Duos (2 Trainees mit gleicher team-ID) haben „Lieblingspartner":
          // wenn beide verfügbar sind, kommen sie gemeinsam (Partner-Bonus) in die Schicht;
          // ist nur ein Platz frei, gewinnt der Trainee mit dem größten Bedarf
          // (wenigste Dienste = am längsten nicht dran = höchste Fairness-Priorität).
          const maxTrainees = Math.max(0, settings.traineesPerShift ?? 2);
          const traineeCount = () => team.filter(id => isTrainee(byId.get(id) || {})).length;
          const eligibleForTeam = auxPool.filter(a => !team.includes(a.s.id));
          if (eligibleForTeam.some(a => a.kind === 'trainee' && a.s.ausbilderTeamsSpecified && !a.s.ausbilderTeams.includes(t.id))) { prefSkipped = true; reasonCodes.add('pref'); }
          const ranked = eligibleForTeam
            .filter(a => a.kind !== 'trainee' || !a.s.ausbilderTeamsSpecified || a.s.ausbilderTeams.includes(t.id))
            .filter(a => a.kind !== 'trainee' || traineeCount() < maxTrainees)
            .map(a => ({ ...a, used: usedWeek(a.s.id) }))
            .sort((a, b) => {
              const rank = k => k === 'aux' ? 0 : k === 'spr' ? 1 : 2;
              const due = (x, y) => x.kind === 'trainee' && y.kind === 'trainee'
                ? (get(U.trainee, x.s.id) - get(U.trainee, y.s.id)) || (x.s.total - y.s.total)
                : 0;
              return (a.used - b.used) || (rank(a.kind) - rank(b.kind)) || due(a, b) || (a.s.total - b.s.total);
            });
          // Trainee-Duos nur gemeinsam einplanen, wenn sowohl maxShift als auch
          // traineesPerShift die gesamte Gruppe aufnehmen können.
          const maxAdd = Math.max(0, day.maxShift - team.length);
          const traineePartners = new Map();
          members.forEach(mm => { if (isTrainee(mm) && mm.team != null) {
            const duo = members.filter(x => x.team === mm.team && isTrainee(x) && x.id !== mm.id
                && x.available && !day.blocked.has(x.id));
            if (duo.length) traineePartners.set(mm.id, duo.map(x => x.id));
          }});
          // Ganze Azubi-Gruppe (Duo) nur nehmen, wenn sie ins Limit passt und
          // das Ziel-Team daraus noch Platz bietet – sonst einzelner Trainee.
          const duoFits = (p) => {
            if (p.kind !== 'trainee' || (p.s.ausbilderTeamsSpecified && !p.s.ausbilderTeams.includes(t.id))) return false;
            const partners = (traineePartners.get(p.s.id) || []).filter(pid => !team.includes(pid) && !day.blocked.has(pid) && byId.get(pid)?.available
              && (!byId.get(pid).ausbilderTeamsSpecified || byId.get(pid).ausbilderTeams.includes(t.id)));
            return partners.length > 0 && traineeCount() + 1 + partners.length <= maxTrainees
              && (1 + partners.length) <= (day.maxShift - team.length - taken);
          };
          let taken = 0;
          for (let i = 0; i < ranked.length && taken < limit; i++) {
            const p = ranked[i];
            if (!p || team.includes(p.s.id)) continue;
            if (p.kind === 'trainee' && traineeCount() >= maxTrainees) continue;
            team.push(p.s.id); extra.push(p.s.id); taken++;
            if (p.kind === 'trainee' && allowTraineeBonus) {
              cost -= 4;
              if (p.s.ausbilderTeamsSpecified && p.s.ausbilderTeams.includes(t.id)) cost -= 8;
              cost += get(U.trainee, p.s.id) * 8;
            } // Mentoring, Präferenz und Rotation
            else cost += PEN.extra;
            if (p.used) { if (!viol.includes('sprWeek')) viol.push('sprWeek'); cost += PEN.sprWeek; reasonCodes.add('sprWeek'); }
            // Lieblingspartner (Trainee-Duo) mitnehmen, wenn noch Platz ist
            if (p.kind === 'trainee' && duoFits(p)) {
              const partners = (traineePartners.get(p.s.id) || [])
                .filter(pid => !team.includes(pid) && !day.blocked.has(pid))
                .map(pid => ({ pid, mm: byId.get(pid) }))
                .filter(x => x.mm && x.mm.available)
                .sort((a, b) => (a.mm.total || 0) - (b.mm.total || 0));
              if (partners.length) {
                team.push(partners[0].pid); extra.push(partners[0].pid); taken++;
                cost -= 2; // Duo-Bonus: Lieblingspartner zusammen
              }
            }
          }
          return taken;
        };
        let filled = 0;
        // Azubi-Anbindung: Trainees bevorzugt an Teams mit genug freiem Platz
        // (ganze 2er-Gruppe braucht z. B. 2 freie Plätze neben dem erfahrenen Team).
        const roomFor = Math.max(0, day.maxShift - team.length);
        if (need > 0) filled = fillUp(Math.min(need, roomFor), true);
        else if (day.traineePool.length) filled = fillUp(Math.min(2, roomFor), true);
        else if (day.ausbSpringers.length) filled = fillUp(Math.min(1, roomFor), false);
        if (need > 0 && filled < need) missing = need - filled;
        cost += missing * PEN.missing;
        // Fairness: durchschnittlicher P_i-Score des Teams (dezent skaliert, Regelkosten dominieren)
        if (prefSkipped && !viol.includes('pref')) { viol.push('pref'); cost += PEN.extra; reasonCodes.add('pref'); }
        for (const code of viol) if (!reasonCodes.has(code)) reasonCodes.add(code);
        const warningDetails = [...reasonCodes].map(v => RULE_DETAILS[v]).filter(Boolean);
        if (c.usable.length < t.ids.length) warningDetails.push(t.ids.length === 1 ? RULE_DETAILS.soleMember : RULE_DETAILS.teamOnly);
        if (viol.includes('week') && !warningDetails.includes(RULE_DETAILS.week)) warningDetails.push(RULE_DETAILS.week);
        if (viol.includes('wd') && !warningDetails.includes(RULE_DETAILS.wd)) warningDetails.push(RULE_DETAILS.wd);
        if (viol.includes('fm') && !warningDetails.includes(RULE_DETAILS.fm)) warningDetails.push(RULE_DETAILS.fm);
        if (missing > 0) warningDetails.push(RULE_DETAILS.missing);
        if (extra.some(id => isTrainee(byId.get(id) || {}))) warningDetails.push(RULE_DETAILS.trainee);
        if (extra.some(id => !isTrainee(byId.get(id) || {}))) warningDetails.push(RULE_DETAILS.springerAdded);
        let teamCost = t.ids.reduce((a, id) => a + pi(id), 0) / Math.max(1, t.ids.length) * 8;
        teamCost += get(U.cnt, t.id) * 5; // Einsatz-Rotation über alle neu berechneten Tage
        const prefTrainees = members.filter(mm => isTrainee(mm) && mm.available
          && mm.ausbilderTeamsSpecified && mm.ausbilderTeams.includes(t.id));
        if (prefTrainees.length) teamCost -= Math.max(0, 3 - prefTrainees.reduce((n, mm) => n + get(U.trainee, mm.id), 0)) * 40;
        // Pressung: Teams mit Do/Fr-blockierten Mitgliedern früher priorisieren (Wochenvorziehung)
        teamCost -= t.ids.reduce((a, id) => a + (pressBonus.get(id) || 0), 0) / Math.max(1, t.ids.length) * 1.5;
        cost += teamCost;
        cost += ((t.id * 7 + day.d.getDate()) % 11) * 0.001;               // deterministischer Tie-Break
        out.push({ team, teamId: t.id, extra, viol, missing, cost, sprOnly: false, warningDetails });
      }
      if (!day.cands.length && day.springers.some(s => s.ausb)) {         // Notlösung: nur Springer
        const pool = day.springers.map(s => ({ s, used: get(U.spr, s.id + '|' + day.wk) > 0 }));
        const byUse = (a, b) => (a.used - b.used) || a.s.total - b.s.total;
        const first = pool.filter(p => p.s.ausb).sort(byUse)[0];
        const chosen = [first, ...pool.filter(p => p !== first).sort(byUse)].slice(0, curPer);
        const viol = ['sprOnly']; let cost = PEN.sprOnly;
        chosen.forEach(p => { if (p.used) { if (!viol.includes('sprWeek')) viol.push('sprWeek'); cost += PEN.sprWeek; } });
        const missing = curPer - chosen.length; cost += missing * PEN.missing;
        const ids = chosen.map(p => p.s.id);
        const warningDetails = viol.map(v => RULE_DETAILS[v]).filter(Boolean);
        if (members.some(mm => isTrainee(mm) && mm.available && mm.ausbilderTeamsSpecified && mm.ausbilderTeams.length)) warningDetails.push(RULE_DETAILS.pref);
        if (missing > 0) warningDetails.push(RULE_DETAILS.missing);
        out.push({ team: ids, teamId: null, extra: ids, viol, missing, cost, sprOnly: true, warningDetails });
      }
      const noTeam = { team: [], teamId: null, extra: [], viol: ['none'], missing: curPer, cost: PEN.none, sprOnly: false };
      const unavailableLead = members.some(mm => isTrainee(mm) && mm.available && mm.ausbilderTeamsSpecified && mm.ausbilderTeams.length)
        && !members.some(mm => mm.available && !day.blocked.has(mm.id) && mm.springer && isAusb(mm));
      noTeam.warningDetails = [RULE_DETAILS.none, ...(unavailableLead ? [RULE_DETAILS.sprOnlyDisabled, RULE_DETAILS.pref] : [])];
      out.push(noTeam);
      return out;
    }

    /* --- Branch-and-Bound-Backtracking --- */
    const cmp = (a, b) => a.cost - b.cost;
    const sel = new Array(days.length);
    let best = { cost: Infinity, sel: null }, nodes = 0, aborted = false;

    function dfs(cost, remaining) {
      if (!remaining.length) { if (cost < best.cost) { best = { cost, sel: sel.slice() }; piRefresh(); } return; }
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
    // Bestehende und händisch fixierte Tage außerhalb des Lösungsraums erhalten.
    Object.entries(plan).forEach(([k, e]) => { if (!solveKeys.has(k)) out[k] = e; });
    Object.entries(lockedMap).forEach(([k, e]) => { out[k] = e; });
    return { plan: out, stats: { days: days.length, relaxed, understaffed, open,
      cost: best.cost === Infinity ? 0 : Math.round(best.cost * 100) / 100, nodes, aborted, ms: Date.now() - t0 } };
  }
  /* Mit jeder Neuberechnung frisch bewertet: die Tages-Statistik (lastDuty/pi-Score) wird
     zu Beginn von solveMonth aus dem Ist-Zustand neu aufgebaut – kein veralteter Zwischenstand. */

  return { solveMonth, blockedIds, blockedMap, buildTeams, fairness, iso, parse, addDays, isSchool, weekKey, stufeOf, PEN, LABEL, RULE_DETAILS };
});
