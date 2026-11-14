/* SaniAlarm Desktop – UI (Rendering, Events, Dialoge) */
'use strict';

let viewMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
let selected = new Date(TODAY);
let tab = 'home';
let openMemo = null;           // {key, n} → Trend "Offene Tage" nach dem Generieren
let modalRefresh = null;

// Hilfsfunktion zum Escapen von HTML-Sonderzeichen
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ---------- Toast & Modal ---------- */
let tt;
function toast(msg, warn) {
  const t = $('#toast'); t.querySelector('span').textContent = msg;
  const s = t.querySelector('svg'); if (s) s.style.color = warn ? 'var(--red)' : 'var(--green)';
  t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600);
}
const modal = $('#modal');
function openModal(html, { wide = false, refresh = null } = {}) {
  modalRefresh = refresh;
  $('#modalBody').innerHTML = html;
  modal.classList.toggle('wide', wide);
  try {
    if (!modal.open) {
      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.setAttribute('open', '');
    }
  } catch (err) {
    modal.setAttribute('open', '');
  }
  icons();
  $$('#modal [data-close]').forEach(b => b.onclick = closeModal);
}
function closeModal() {
  modalRefresh = null;
  try {
    if (typeof modal.close === 'function' && modal.open) modal.close();
    else modal.removeAttribute('open');
  } catch (err) {
    modal.removeAttribute('open');
  }
}
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
modal.addEventListener('close', () => { modalRefresh = null; });
function confirmBox(title, text, okLabel, onOk, details = null) {
  openModal(`<h3 id="mTitle">${esc(title)}</h3><p class="lead">${esc(text)}</p>
    ${details ? `<details class="confirm-details" style="margin:10px 0 0;border:1px solid var(--border,#444);border-radius:8px;padding:8px 12px"><summary style="cursor:pointer;font-weight:600">Warum kommt diese Warnung?</summary><div style="margin-top:8px;font-size:.9em;color:var(--muted,#aaa);white-space:pre-line">${esc(details)}</div></details>` : ''}
    <div class="modal-actions"><button class="btn ghost" data-close>Abbrechen</button><button class="btn danger" id="cfOk"><i data-lucide="trash-2"></i>${esc(okLabel)}</button></div>`);
  $('#cfOk').onclick = () => { closeModal(); onOk(); };
}

/* ---------- Navigation ---------- */
function go(t) {
  if (!$('#s-' + t)) t = 'home';
  tab = t;
  $$('#nav [data-tab]').forEach(x => { if (x.dataset.tab === t) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + t));
  try { history_replace(t); } catch (e) { /* ignore */ }
  window.scrollTo(0, 0);
}
function history_replace(t) { if (window.history && window.history.replaceState) window.history.replaceState(null, '', '#' + t); }
$$('#nav [data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));

/* ---------- Dashboard ---------- */
const statCard = (icon, color, lbl, val, trend, suffix = '') =>
  `<div class="stat"><i data-lucide="${icon}" style="color:${color}"></i><span class="lbl">${lbl}</span>
   <span class="val">${val}${suffix ? `<small>${suffix}</small>` : ''}${trend ? `<span class="trend ${trend.good ? 'up' : 'down'}"><i data-lucide="${trend.dir === 'up' ? 'arrow-up' : 'arrow-down'}"></i>${trend.n}</span>` : ''}</span></div>`;

function renderHeader() {
  const me = m(settings.me);
  $('#hello').textContent = me ? `Hallo, ${me.first}` : 'Hallo';
  $('#todayLine').textContent = `${WDL[TODAY.getDay()]}, ${TODAY.getDate()}. ${MONTHS[TODAY.getMonth()]} ${TODAY.getFullYear()} · KW ${kw(TODAY)}`;
  $('#meBox').innerHTML = me ? `${av(me)}<span class="mt">${esc(fullName(me))}<small>Klasse ${esc(me.cls)}</small></span>` : `<span class="mt">Kein Profil<small>in Einstellungen wählen</small></span>`;
  $('#dbState').textContent = lastSaved ? `Gespeichert ${pad(lastSaved.getHours())}:${pad(lastSaved.getMinutes())}` : 'Lokal gespeichert';
}

function renderStats() {
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth(), key = `${y}-${mo}`;
  const active = members.filter(x => x.available).length;
  const teams = teamsList(), noAusb = teams.filter(t => !teamHasAusb(t.ids)).length;
  const od = openIn(y, mo);
  const hasPlan = monthDays(y, mo).some(d => plan[iso(d)]);
  const counts = [...planCounts(y, mo)].filter(([id]) => m(id).available).map(([, c]) => c);
  const fair = hasPlan && counts.length ? fairnessOf(counts) : null;
  const trend = openMemo && openMemo.key === key && openMemo.n !== od ? { n: Math.abs(openMemo.n - od), dir: od < openMemo.n ? 'down' : 'up', good: od < openMemo.n } : null;
  $('#stats').innerHTML =
    statCard('users', 'var(--pink)', 'Aktive Sanis', active, members.length - active ? { n: members.length - active, dir: 'down', good: false } : null, `/ ${members.length}`)
    + statCard('users-round', 'var(--lav)', 'Teams', teams.length, noAusb ? { n: noAusb, dir: 'down', good: false } : null)
    + statCard('triangle-alert', od ? 'var(--orange)' : 'var(--green)', `Offene Tage · ${MONTHS[mo]}`, od, trend)
    + statCard('scale', 'var(--green)', 'Plan-Fairness', fair == null ? '–' : fair, null, fair == null ? '' : '%');
  renderPanicBanner();
}

function renderPanicBanner() {
  const el = $('#panicBanner');
  if (!el) return;
  const em = morningEmergencyCheck(TODAY);
  if (!em) { el.innerHTML = ''; return; }

  if (em.isEmergency) {
    const reason = !em.hasAusb ? 'Kein ausgebildeter Sani (AUSB) anwesend!' : `${absentOrSickNames(em.absentOrSick)} ausgefallen / krank`;
    const standbyText = em.standbys.length ? `Verfügbare Springer an der Schule: ${em.standbys.slice(0, 3).map(s => s.first + (s.ausb ? ' (AUSB)' : '')).join(', ')}` : 'Keine Springer sofort verfügbar!';
    el.innerHTML = `
      <div class="panic-banner">
        <div class="panic-left">
          <div class="panic-icon"><i data-lucide="siren"></i></div>
          <div class="panic-info">
            <b>Morgen-Alarm! Heutiger Dienst gefährdet</b>
            <p>${esc(reason)} · ${esc(standbyText)}</p>
          </div>
        </div>
        <button class="btn danger" id="bannerResolveBtn"><i data-lucide="sparkles"></i>Springer einwechseln</button>
      </div>`;
    $('#bannerResolveBtn').onclick = openPanicModal;
  } else {
    el.innerHTML = '';
  }
  icons();
}

function absentOrSickNames(ids) {
  if (!ids.length) return 'Niemand';
  return ids.map(id => m(id)?.first || '?').join(', ');
}

function renderNext() {
  const el = $('#nextShift'), me = m(settings.me);
  if (!me) { el.innerHTML = `<div class="eyebrow">Kein Profil gewählt</div><div class="date" style="font-size:18px">Wähle in den Einstellungen, wer du bist.</div>`; el.onclick = null; return; }
  let d = new Date(TODAY), info = null, foundMode = null;
  for (let i = 0; i < 90; i++) {
    const md = getDayMode(d);
    if (md.key !== 'free') {
      const e = isSchool(d) && evaluate(d);
      if (e && e.team.includes(me.id)) { info = e; foundMode = md; break; }
    }
    d = addDays(d, 1);
  }
  if (!info) { el.innerHTML = `<div class="eyebrow">Mein nächster Dienst</div><div class="date" style="font-size:18px">Kein Dienst geplant – generiere einen Plan für die nächsten Wochen.</div>`; el.onclick = null; return; }
  const diff = Math.round((d - TODAY) / 864e5), rel = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : `In ${diff} Tagen`;
  const partners = info.team.map(m).filter(Boolean);
  const shiftTime = foundMode?.shiftWindow || DEFAULT_SHIFT_TIME;
  el.innerHTML = `
    <div class="row"><div><div class="eyebrow">Mein nächster Dienst</div><div class="date">${WDL[d.getDay()]}, ${d.getDate()}. ${MON3[d.getMonth()]}</div></div>
      <span class="pill"><i data-lucide="clock"></i>${rel}</span></div>
    <div class="meta"><span><i data-lucide="clock-3"></i>${shiftTime}</span><span><i data-lucide="map-pin"></i>${DEFAULT_LOCATION}</span></div>
    <div class="partners"><span class="stack">${partners.map(x => av(x)).join('')}</span>mit ${esc(partners.filter(x => x.id !== me.id).map(x => x.first).join(', ') || 'niemandem')}</div>`;
  el.setAttribute('aria-label', 'Nächsten Dienst im Kalender anzeigen');
  const dd = new Date(d);
  el.onclick = () => { viewMonth = new Date(dd.getFullYear(), dd.getMonth(), 1); selected = new Date(dd); renderDashboard(); };
}

function renderCal() {
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
  $('#calTitle').textContent = `${MONTHS[mo]} ${y}`;
  const len = new Date(y, mo + 1, 0).getDate();
  let html = '', first = true;
  for (let d = 1; d <= len; d++) {
    const dt = new Date(y, mo, d); if (!isSchool(dt)) continue;
    if (first) { for (let i = 0; i < (dt.getDay() + 6) % 7; i++) html += `<div class="day empty"></div>`; first = false; }
    const info = evaluate(dt), bl = blocksOn(dt), mode = getDayMode(dt);
    // Kalender-Marker: wöchentliche Sperren treffen auch Tage außerhalb 'from/to'
    blocks.forEach(b => {
      if (b.weekly?.enabled && b.weekly.days?.includes(dt.getDay()) && !bl.includes(b)) bl.push(b);
    });
    const c = ['day']; if (dt < TODAY) c.push('past'); if (same(dt, TODAY)) c.push('today'); if (same(dt, selected)) c.push('selected');
    let tag = `<span class="tag" style="visibility:hidden">–</span>`;
    let who = 'kein Plan';
    if (mode.key === 'free') {
      tag = `<span class="tag off">FREI</span>`;
      who = 'Wandertag / Frei';
    } else if (info) {
      tag = `<span class="tag ${info.status}">${esc(info.tag || mode.tag || 'OK')}</span>`;
      who = info.team.length ? info.team.map(id => m(id)?.first || '?').join(' & ') : (mode.key === 'event' ? 'Großevent' : 'offen');
    }
    const label = `${d}. ${MONTHS[mo]}, ${mode.label}, ${info ? info.note : 'noch kein Plan'}${bl.length ? `, ${bl.length} Sperrtag(e)` : ''}`;
    html += `<button class="${c.join(' ')}" data-d="${d}" aria-label="${esc(label)}" aria-pressed="${same(dt, selected)}">
      <span class="top"><span class="num">${d}${bl.length ? '<i class="bdot"></i>' : ''}</span>${tag}</span><span class="who">${esc(who)}</span></button>`;
  }
  $('#days').innerHTML = html;
  $$('#days .day[data-d]').forEach(b => b.onclick = () => { selected = new Date(y, mo, +b.dataset.d); renderCal(); renderDetail(); icons(); });
  const hasPlan = monthDays(y, mo).some(d => plan[iso(d)]), btn = $('#generate');
  if (!btn.disabled) btn.innerHTML = `<i data-lucide="${hasPlan ? 'refresh-cw' : 'sparkles'}"></i><span>${hasPlan ? 'Plan neu generieren' : `Plan für ${MONTHS[mo]} generieren`}</span>`;
}

function blockRow(b) {
  const n = affected(b.scope).length, t = BTYPES[b.type] || BTYPES.Verhindert;
  return `<div class="blk"><span class="ico"><i data-lucide="${t.icon}"></i></span><div class="t">${esc(b.type)} · ${esc(b.title)}<small>${esc(scopeLabel(b.scope))} · ${n} Sanis · ${rangeLabel(b)}</small></div>
    <button class="icon-btn del" data-del-block="${b.id}" aria-label="Sperrtag ${esc(b.title)} löschen"><i data-lucide="trash-2"></i></button></div>`;
}

function rankDayCandidates(d, info) {
  const assigned = new Set(info?.team || []), blocked = blockedMap(d);
  const teamId = info?.teamId ?? null;
  const hasAusb = [...assigned].some(id => m(id)?.ausb);
  const ranked = members.filter(x => x.available && !blocked.has(x.id) && !assigned.has(x.id)).map(x => {
    const prefMatch = x.quali === 'ausbildung' && x.ausbilderTeamsSpecified && teamId != null && x.ausbilderTeams.includes(teamId);
    const incompatible = x.quali === 'ausbildung' && x.ausbilderTeamsSpecified && teamId != null && !x.ausbilderTeams.includes(teamId);
    const wouldHaveAusb = hasAusb || x.ausb;
    const teamLoad = planCounts(d.getFullYear(), d.getMonth()).get(x.id) || 0;
    const score = (wouldHaveAusb ? 1000 : -1000) + (prefMatch ? 250 : 0) - (incompatible ? 500 : 0) - x.total * 12 - teamLoad * 30 + (x.springer ? 5 : 0);
    const reasons = [x.ausb ? 'AUSB' : x.quali === 'ausbildung' ? (prefMatch ? 'Azubi · Wunschteam' : 'Azubi') : 'Helfer', `${x.total} Dienste`];
    if (incompatible) reasons.push('Wunschteam passt nicht');
    if (!wouldHaveAusb) reasons.push('AUSB im Team fehlt');
    return { x, score, reasons };
  }).sort((a, b) => b.score - a.score || fullName(a.x).localeCompare(fullName(b.x), 'de'));
  return ranked;
}

function renderDetail() {
  const d = selected, el = $('#dayDetail');
  if (d.getMonth() !== viewMonth.getMonth() || d.getFullYear() !== viewMonth.getFullYear() || !isSchool(d)) {
    el.innerHTML = `<div class="note"><i data-lucide="info"></i>Wähle einen Schultag im Kalender, um Besetzung und Sperrtage zu sehen.</div>`; icons(); return;
  }
  const info = evaluate(d), bl = blocksOn(d), curMode = getDayMode(d);
  let html = '';

  const modeOptions = Object.values(DAY_MODES).map(dm => `<option value="${dm.key}" ${dm.key === curMode.key ? 'selected' : ''}>${dm.label}</option>`).join('');

  html += `<div class="hd"><div><h2>${fmt(d)}</h2><p class="muted-s" style="margin-top:2px"><i data-lucide="clock-3" style="width:13px;height:13px;vertical-align:-2px"></i> ${curMode.shiftWindow}</p></div>
    <select class="inp small" id="dayModeSel" style="max-width:170px" aria-label="Tages-Modus">${modeOptions}</select></div>`;

  if (curMode.key === 'free') {
    html += `<div class="alert info"><i data-lucide="sun"></i><span>Wandertag / Schulfrei – Kein regulärer Schulsanitätsdienst eingeteilt. Fairness-Zähler bleiben neutral.</span></div>`;
  } else if (!info) {
    html += `<div class="note"><i data-lucide="info"></i>Für diesen Tag gibt es noch keinen Plan.</div>`;
  } else {
    const icon = { ok: 'circle-check', warn: 'circle-alert', bad: 'octagon-alert' }[info.status];
    const color = { ok: '#1E8E3E', warn: '#B08000', bad: 'var(--red)' }[info.status];
    html += `
      <div class="note"><i data-lucide="${icon}" style="color:${color}"></i><span>${esc(info.note)}</span></div>
      <div class="team">${info.team.length ? info.team.map(id => m(id) ? `<span class="chip-person ${info.hit.includes(id) ? 'hit' : ''}">${av(m(id))}${esc(short(m(id)))}${info.extra?.includes(id) ? ' <span class="badge spr">SPR</span>' : ''}${m(id).ausb ? ' <span class="badge">AUSB</span>' : ''}</span>` : '').join('') : '<span class="muted-s">Noch niemand eingeteilt</span>'}</div>`;
  }
  if (curMode.key !== 'free') {
    const candidates = rankDayCandidates(d, info);
    const assignedCount = info?.team.length || 0;
    const maxShift = Math.max(settings.maxShift || settings.perShift, settings.perShift);
    html += `<details class="day-candidates"><summary><i data-lucide="user-search"></i> Geeignete Personen anzeigen <small>${candidates.length}</small></summary>
      <p class="muted-s">${assignedCount ? 'Zusätzliche oder austauschbare Personen, sortiert nach Eignung: AUSB-Absicherung, Teampräferenz und bisherige Dienste.' : 'Für diesen Tag verfügbare Personen, sortiert nach Eignung und bisheriger Dienstzahl.'}</p>
      <div class="list">${candidates.map(({ x, reasons }, i) => `<div class="prow"><span class="rank">${i + 1}</span>${av(x)}<div class="t"><span>${esc(fullName(x))}</span><small>${esc(reasons.join(' · '))}</small></div></div>`).join('') || '<p class="muted">Keine geeigneten Personen verfügbar.</p>'}</div>
      ${assignedCount ? `<small class="muted-s">${assignedCount >= maxShift ? 'Die Schicht ist bereits voll; die Liste zeigt mögliche Ersatz- bzw. Austauschpersonen.' : `Noch ${maxShift - assignedCount} Platz/Plätze bis zur maximalen Schichtgröße.`}</small>` : ''}
    </details>`;
  }
  if (info && plan[iso(d)]) html += `<div class="form-row" style="margin-top:10px"><button class="btn danger wide" data-del-day="${iso(d)}"><i data-lucide="trash-2"></i>Tag aus dem Kalender entfernen</button></div>`;
  if (bl.length) html += `<div class="sub-h" style="margin-top:14px">Sperrtage &amp; Stundenblöcke <small>${bl.length}</small></div>${bl.map(blockRow).join('')}`;
  if (info && !info.mark) html += `<div class="form-row" style="margin-top:12px"><button class="btn ghost wide" id="lockCurrentDay"><i data-lucide="lock"></i>Tag manuell fixieren</button></div>`;
  html += `<div class="form-row" style="margin-top:12px"><button class="btn ghost wide" data-new-block="${iso(d)}"><i data-lucide="calendar-x"></i>Sperre für diesen Tag</button></div>`;
  el.innerHTML = html;
  $('#dayModeSel').onchange = e => {
    setDayMode(d, e.target.value);
    renderAll();
    toast(`Tages-Modus auf „${DAY_MODES[e.target.value]?.label}“ gesetzt`);
  };
  const lockDay = $('#lockCurrentDay');
  if (lockDay) lockDay.onclick = () => { if (plan[iso(d)]) { plan[iso(d)].mark = true; save(); renderAll(); toast('Tag ist jetzt manuell fixiert'); } };
  icons();
}

function renderBlockList() {
  const list = blocks.filter(b => b.to >= iso(TODAY)).sort((a, b) => a.from < b.from ? -1 : 1).slice(0, 8);
  $('#blockList').innerHTML = list.map(blockRow).join('') || '<p class="muted">Keine anstehenden Sperrtage.</p>';
}
function renderLoad() {
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
  $('#loadTitle').textContent = `Geplante Dienste · ${MON3[mo]}`;
  const rows = [...planCounts(y, mo)].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...rows.map(r => r[1]));
  $('#loadBars').innerHTML = rows.length ? rows.map(([id, c]) => { const x = m(id);
    return `<div class="bar-row"><div class="top-line"><span class="n">${av(x)}${esc(fullName(x))}</span><span class="idx"><b>${c}</b></span></div>
      <div class="track"><div class="fill" style="width:${c / max * 100}%;background:${c === max && max > 2 ? 'var(--orange)' : 'var(--purple)'}"></div></div></div>`; }).join('')
    : '<p class="muted">Noch kein Plan für diesen Monat.</p>';
}
function renderDashboard() { syncGenerateRange(); renderHeader(); renderStats(); renderNext(); renderCal(); renderDetail(); renderBlockList(); renderLoad(); renderAgDayCard(); icons(); }

function syncGenerateRange() {
  const from = $('#generateFrom'), to = $('#generateTo');
  if (!from || !to) return;
  const monthKey = `${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  if (from.dataset.month !== monthKey) {
    from.value = iso(first < TODAY ? TODAY : first);
    to.value = iso(last);
    from.dataset.month = to.dataset.month = monthKey;
  } else if (!from.value || !to.value) {
    from.value = iso(first < TODAY ? TODAY : first);
    to.value = iso(last);
  }
}

$('#prevM').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderDashboard(); };
$('#nextM').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderDashboard(); };
$('#todayBtn').onclick = () => { viewMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); selected = new Date(TODAY); renderDashboard(); };
$('#generateFrom').onchange = () => { const to = $('#generateTo'); if (to.value && $('#generateFrom').value > to.value) to.value = $('#generateFrom').value; };
$('#generateTo').onchange = () => { const from = $('#generateFrom'); if (from.value && $('#generateTo').value < from.value) from.value = $('#generateTo').value; };
$('#generateMode').onchange = () => {
  const replacing = $('#generateMode').value === 'replace';
  $('#generateModeHint').textContent = replacing
    ? 'Vorhandene automatische Einträge im Zeitraum werden neu optimiert. Manuell fixierte Tage bleiben erhalten.'
    : 'Nur noch unbelegte Schultage im Zeitraum werden geplant.';
};
$('#blockBtn').onclick = () => openBlockModal({ date: isSchool(selected) ? iso(selected) : undefined });
$('#exportBtn').onclick = openExport;

/* ---------- Plan generieren (Backtracking-Solver) ---------- */
// Für das Einstellungs-Popup: programmatisch denselben Flow wie Klick auf #generate auslösen
window.regeneratePlan = () => { const b = $('#generate'); if (b && !b.disabled) b.click(); };
$('#generate').onclick = () => {
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
  syncGenerateRange();
  const from = $('#generateFrom').value, to = $('#generateTo').value;
  const mode = $('#generateMode').value;
  const replaceExisting = mode === 'replace';
  if (!from || !to || from > to) { toast('Bitte einen gültigen Zeitraum von/bis wählen', true); return; }
  const rangeDays = [];
  for (let d = parse(from); iso(d) <= to; d = addDays(d, 1)) if (isSchool(d) && d >= TODAY && d.getMonth() === mo && d.getFullYear() === y) rangeDays.push(d);
  const existingInRange = rangeDays.filter(d => plan[iso(d)]);
  if (replaceExisting && existingInRange.some(d => plan[iso(d)]?.mark)) {
    const fixedDates = existingInRange.filter(d => plan[iso(d)]?.mark).map(fmtS).join(', ');
    toast(`Manuell fixierte Tage bleiben erhalten: ${fixedDates}`, true);
  }
  const before = {}; rangeDays.forEach(d => before[iso(d)] = evaluate(d));
  const openBefore = rangeDays.filter(d => evaluate(d)?.status === 'bad').length, btn = $('#generate');
  btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-circle" class="spin"></i><span>Prüfe Regeln &amp; Sperrtage …</span>`; icons();
  setTimeout(() => {
    prevPlan = JSON.parse(JSON.stringify(plan));
    const r = solve(y, mo, { from, to, replaceExisting });
    openMemo = { key: `${y}-${mo}`, n: openBefore };
    const changes = rangeDays.map(d => ({ d, k: iso(d), b: before[iso(d)], a: evaluate(d) }))
      .filter(x => x.a && (!x.b || x.b.status === 'bad' || x.b.team.join() !== x.a.team.join()));
    const warningChanges = changes.filter(x => x.a.status === 'warn' || x.a.status === 'bad');
    const warningSummaryDays = warningChanges;
    const reasonGroups = new Map();
    warningChanges.forEach(x => {
      const reasons = [...new Set(x.a.warningDetails?.length ? x.a.warningDetails : [x.a.note])];
      x.warningReasons = reasons;
      reasons.forEach(reason => {
        if (!reasonGroups.has(reason)) reasonGroups.set(reason, []);
        reasonGroups.get(reason).push(x);
      });
    });
    const sharedReasonGroups = [...reasonGroups.entries()].filter(([, days]) => days.length > 1);
    const commonReasons = warningChanges.length && warningChanges.every(x => JSON.stringify(x.warningReasons) === JSON.stringify(warningChanges[0].warningReasons))
      ? warningChanges[0].warningReasons : [];
    const dayWarningHtml = x => x.warningReasons?.length
      ? `<details class="warning-explanation"><summary>Warum diese Warnung?</summary><ul>${x.warningReasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></details>`
      : '';
    btn.disabled = false; save(); renderAll();
    const open = rangeDays.filter(d => evaluate(d)?.status === 'bad').length;
    openModal(`<h3 id="mTitle">Plan generiert</h3>
      <p class="lead">${from} bis ${to} · ${replaceExisting ? `${existingInRange.length} bestehende Tage werden neu geprüft` : 'nur unbelegte Tage'} · ${teamsList().length} Teams · Sperrtage hart, Fairness ${settings.fair ? 'aktiv' : 'aus'} · ${settings.perShift} Sanis pro Dienst</p>
      ${replaceExisting && existingInRange.length ? `<div class="alert"><i data-lucide="triangle-alert"></i><span>Du hast „Ausgewählte Tage neu optimieren“ gewählt. ${existingInRange.length} bestehende Einträge in diesem Zeitraum werden ersetzt. Manuell fixierte Tage bleiben erhalten. Prüfe die Vorschau, bevor du übernimmst.</span></div>` : ''}
      <div class="result-grid">
        ${statCard('calendar-check', 'var(--green)', 'Dienste', r.days)}
        ${statCard('repeat', 'var(--lav)', 'Geändert', changes.length)}
        ${statCard('sliders-horizontal', 'var(--orange)', 'Gelockert', r.relaxed + r.understaffed)}
        ${statCard('triangle-alert', 'var(--red)', 'Offen', open)}
      </div>
      ${r.relaxed || r.understaffed ? `<div class="alert info"><i data-lucide="sliders-horizontal"></i><span>Smart Relaxation: ${r.relaxed} Tag(e) mit gelockerten Fairness-/Frequenzregeln, ${r.understaffed} unterbesetzt. Sperrtage, Verfügbarkeit und AUSB-Pflicht wurden nie gebrochen.</span></div>` : ''}
      ${commonReasons.length ? `<div class="result-warnings"><b>Erklärung für alle ${warningChanges.length} Warnungstage</b><ul>${commonReasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul><small>Alle Warnungstage im Vorschaufenster haben denselben Grund.</small></div>` : ''}
      ${!commonReasons.length && sharedReasonGroups.length ? `<div class="result-warnings"><b>Gemeinsame Warnungsgründe</b><ul>${sharedReasonGroups.map(([reason, days]) => `<li>${days.length} Tage (${days.map(x => fmtS(x.d)).join(', ')}): ${esc(reason)}</li>`).join('')}</ul></div>` : ''}
      ${warningChanges.some(x => !x.a.warningDetails?.length) ? '<div class="result-warnings"><b>Warnung ohne Solver-Erklärung</b><p>Bei mindestens einem Tag stammt die Warnung aus einem bestehenden oder nachgetragenen Eintrag. Prüfe den Tag im Kalender für Details.</p></div>' : ''}
      ${open ? `<div class="alert"><i data-lucide="octagon-alert"></i><span>${open} Tag(e) im angefragten Zeitraum sind weiterhin offen: es gibt kein verfügbares Team mit anwesender AUSB-Person, oder alle passenden Mitglieder sind gesperrt. Die konkreten offenen Tage stehen in der Liste.</span></div>` : ''}
      <p class="muted-s" style="margin:10px 0">Solver: ${r.nodes} Knoten · ${r.ms} ms · Kosten ${r.cost}${r.aborted ? ' · Suchbudget erreicht (beste gefundene Lösung)' : ''}</p>
      ${warningSummaryDays.slice(0, 8).map(x => `<div class="set-line"><span>${fmtS(x.d)}<small>${esc(x.a.note)}${x.b && x.b.status !== 'bad' ? ` <em class="muted-s">(vorher: ${esc(x.b.note)})</em>` : ''}</small>${dayWarningHtml(x)}</span><span class="status-pill ${x.a.status}">${{ ok: 'OK', warn: 'Warnung', bad: 'Offen' }[x.a.status]}</span></div>`).join('')}
      ${warningSummaryDays.length > 8 ? `<details class="more-changes" style="margin-top:10px"><summary style="cursor:pointer" class="muted">${warningSummaryDays.length - 8} weitere verschiedene Besetzungen / Hinweise anzeigen</summary><div style="margin-top:6px">${warningSummaryDays.slice(8).map(x => `<div class="set-line"><span>${fmtS(x.d)}<small>${esc(x.a.note)}${x.b && x.b.status !== 'bad' ? ` <em class="muted-s">(vorher: ${esc(x.b.note)})</em>` : ''}</small>${dayWarningHtml(x)}</span><span class="status-pill ${x.a.status}">${{ ok: 'OK', warn: 'Warnung', bad: 'Offen' }[x.a.status]}</span></div>`).join('')}</div></details>` : ''}
      ${changes.filter(x => x.a.status === 'ok').length ? `<details class="more-changes" style="margin-top:10px"><summary style="cursor:pointer" class="muted">${changes.filter(x => x.a.status === 'ok').length} weitere Tage ohne Warnung anzeigen</summary><div style="margin-top:6px">${changes.filter(x => x.a.status === 'ok').map(x => `<div class="set-line"><span>${fmtS(x.d)}<small>${esc(x.a.note)}</small></span><span class="status-pill ok">OK</span></div>`).join('')}</div></details>` : ''}
      ${r.days === 0 ? '<div class="alert info"><i data-lucide="info"></i><span>Im gewählten Zeitraum gab es keine freien Schultage. Bereits eingetragene Tage wurden ausgelassen und nicht verändert.</span></div>' : ''}
      <div class="modal-actions"><button class="btn ghost" id="resUndo"><i data-lucide="undo-2"></i>Rückgängig</button><button class="btn ghost" id="resShare"><i data-lucide="share-2"></i>Teilen</button><button class="btn primary" data-close>Übernehmen</button></div>`);
    $('#resShare').onclick = openExport;
    $('#resUndo').onclick = () => { if (prevPlan) { plan = prevPlan; prevPlan = null; save(); renderAll(); closeModal(); toast('Plan wiederhergestellt'); } };
  }, 60);
};

/* ---------- Kartei ---------- */
let filt = { ausb: false, springer: false, noteam: false, off: false, trainee: false }, sortKey = 'name', sortDir = 1;
const teamText = x => { const t = teamMates(x); return t.length ? t.map(y => y.first).join(', ') : '—'; };
function plannedMap() {
  const c = new Map(), k0 = iso(TODAY);
  Object.entries(plan).forEach(([k, e]) => { if (k >= k0) e.team.forEach(id => c.set(id, (c.get(id) || 0) + 1)); });
  return c;
}
function renderMembers() {
  const memberQuali = x => x.quali || x.ausbildungsStatus || (x.inAusbildung === true || x.trainee === true || x.azubi === true ? 'ausbildung' : (x.ausb ? 'ausb' : 'helfer'));
  const q = $('#q').value.trim().toLowerCase(), st = $('#stufe').value, pm = plannedMap();
  let list = members.filter(x => (!q || `${x.first} ${x.last} ${x.cls}`.toLowerCase().includes(q)) && (!st || x.stufe === +st)
    && (!filt.ausb || memberQuali(x) === 'ausb') && (!filt.springer || x.springer) && (!filt.noteam || !teamMates(x).length) && (!filt.off || !x.available) && (!filt.trainee || memberQuali(x) === 'ausbildung'));
  const keyOf = { name: x => `${x.last} ${x.first}`.toLowerCase(), cls: x => x.stufe * 100 + x.cls.charCodeAt(x.cls.length - 1), total: x => x.total, year: x => x.year, planned: x => pm.get(x.id) || 0 }[sortKey];
  list = [...list].sort((a, b) => { const ka = keyOf(a), kb = keyOf(b); return (ka > kb ? 1 : ka < kb ? -1 : 0) * sortDir; });
  $('#memCount').textContent = `(${members.length})`;
  $('#resultInfo').textContent = `${list.length} Treffer · ${list.filter(x => x.available).length} verfügbar`;
  const badges = x => (memberQuali(x) === 'ausb' ? '<span class="badge">AUSB</span>' : '') + (memberQuali(x) === 'ausbildung' ? '<span class="badge warn">AZUBI</span>' : '') + (x.springer ? '<span class="badge spr">SPR</span>' : '')
    + (teamMates(x).length && !teamHasAusb([x.id, ...teamMates(x).map(y => y.id)]) ? '<span class="badge warn">TEAM!</span>' : '');
  const th = (k, label) => `<th><button data-sort="${k}" aria-label="Sortieren nach ${label}">${label}${sortKey === k ? `<i data-lucide="${sortDir > 0 ? 'arrow-up' : 'arrow-down'}" style="width:13px;height:13px"></i>` : ''}</button></th>`;
  $('#memTable').innerHTML = `<thead><tr>${th('name', 'Name')}${th('cls', 'Klasse')}<th>Rolle</th><th>Team</th>${th('total', 'Gesamt')}${th('year', 'Jahr')}${th('planned', 'Geplant')}<th>Verfügbar</th><th></th></tr></thead><tbody>`
    + (list.length ? list.map(x => `<tr class="${x.available ? '' : 'off'}">
      <td><div class="who" data-profile="${x.id}" role="button" tabindex="0" aria-label="Profil ${esc(x.first)} öffnen">${av(x)}<span class="nm">${esc(fullName(x))}</span></div></td><td>${esc(x.cls)}</td><td><div class="badges">${badges(x) || '<span class="muted-s">—</span>'}</div></td>
      <td>${esc(teamText(x))}</td><td class="num">${x.total}</td><td class="num">${x.year}</td><td class="num">${pm.get(x.id) || 0}</td>
      <td><button class="switch" role="switch" aria-checked="${x.available}" data-toggle="${x.id}" aria-label="${esc(fullName(x))} verfügbar"></button></td>
      <td><div class="acts"><button class="icon-btn" data-open="${x.id}" aria-label="${esc(fullName(x))} bearbeiten"><i data-lucide="pencil"></i></button>
        <button class="icon-btn del" data-del-member="${x.id}" aria-label="${esc(fullName(x))} löschen"><i data-lucide="trash-2"></i></button></div></td></tr>`).join('')
      : `<tr><td colspan="9"><div class="empty-state">Keine Mitglieder gefunden.</div></td></tr>`) + '</tbody>';
  $$('#memTable [data-profile]').forEach(el => el.onclick = () => openMemberProfile(+el.dataset.profile));
  renderTeams(); icons();
}
function renderTeams() {
  const ts = teamsList(), single = members.filter(x => !teamMates(x).length).length;
  $('#teamCount').textContent = `${ts.length} Teams · ${single} ohne Team`;
  $('#teamPanel').innerHTML = ts.map(t => `<div class="team-card"><div class="th"><span>Team ${t.id}${teamHasAusb(t.ids) ? '' : ' <span class="badge warn">ohne AUSB</span>'}</span>
      <button class="icon-btn del" data-dissolve="${t.id}" aria-label="Team ${t.id} auflösen" title="Team auflösen"><i data-lucide="unlink"></i></button></div>
      ${t.ids.map(id => { const x = m(id); return `<div class="mr">${av(x)}<span>${esc(fullName(x))}</span>${x.ausb ? '<span class="badge">AUSB</span>' : ''}${x.available ? '' : '<span class="muted-s">abwesend</span>'}</div>`; }).join('')}</div>`).join('')
    || '<p class="muted">Noch keine Teams. Partner im Mitglieds-Dialog hinzufügen.</p>';
}
$('#q').oninput = renderMembers; $('#stufe').onchange = renderMembers;
$$('[data-filter]').forEach(b => b.onclick = () => { const f = b.dataset.filter; filt[f] = !filt[f]; b.setAttribute('aria-pressed', filt[f]); renderMembers(); });
$('#addMember').onclick = () => openMember(null);

/* ---------- Mitglieds-Dialog (Anlegen/Bearbeiten, Partner, Sperrtage) ---------- */
let mdraft = null, partnerQuery = '', partnerOpen = false;
function partnerCandidates(x) {
  const mine = x.team != null ? members.filter(y => y.team === x.team).length : 1, q = partnerQuery.trim().toLowerCase();
  return members.filter(p => p.id !== x.id && (x.team == null || p.team !== x.team))
    .filter(p => mine + (p.team != null ? members.filter(y => y.team === p.team).length : 1) <= 3)
    .filter(p => !q || `${p.first} ${p.last} ${p.cls}`.toLowerCase().includes(q))
    .sort((a, b) => (a.stufe === x.stufe ? 0 : 1) - (b.stufe === x.stufe ? 0 : 1) || (b.ausb - a.ausb)).slice(0, 30);
}
const pickerHTML = x => { const l = partnerCandidates(x); return l.length ? l.map(p => `<button data-partner="${p.id}">${av(p)}${esc(fullName(p))}<span class="cls">${esc(p.cls)}${p.ausb ? ' · AUSB' : ''}${teamMates(p).length ? ` · mit ${esc(teamMates(p).map(y => y.first).join(', '))}` : ''}</span></button>`).join('') : `<div class="muted" style="padding:12px 14px">Niemand passt (max. 3 pro Team).</div>`; };
function openMember(id) {
  partnerQuery = ''; partnerOpen = false;
  mdraft = id == null ? { first: '', last: '', cls: '', ausb: false, springer: false, available: true }
    : (() => { const x = m(id); if (!x) return null;
        // WICHTIG: ALLE gespeicherten Felder übernehmen (Name, Klasse, Ausbildungs-Status,
        // Datum, Kontakt, Springer, Verfügbarkeit) – sonst stehen beim Bearbeiten nur Leeren.
        return { id: x.id, first: x.first || '', last: x.last || '', cls: x.cls || '',
          ausb: !!x.ausb, springer: !!x.springer, available: x.available !== false,
          quali: x.quali || x.ausbildungsStatus || (x.inAusbildung === true ? 'ausbildung' : (x.ausb ? 'ausb' : 'helfer')),
          ausbildungsStatus: x.ausbildungsStatus || x.quali || (x.inAusbildung === true ? 'ausbildung' : (x.ausb ? 'ausb' : 'helfer')),
          ausbilderTeams: x.ausbilderTeams || [], ausbilderTeamLabels: x.ausbilderTeamLabels || [],
          ausbilderTeamPrefs: x.ausbilderTeamPrefs || [], ausbilderTeamsSpecified: !!x.ausbilderTeamsSpecified,
          ausbildungsDatum: x.ausbildungsDatum || null, kontakt: x.kontakt || '' };
      })();
  if (mdraft == null) { toast('Person nicht gefunden', true); return; }
  // Stufe/Klasse aus gespeicherter cls ableiten (z. B. "10-2" → Stufe 10, Klasse 2; "q3" → Q3)
  const splitCls = c => {
    const s = String(c || '').toLowerCase();
    const q = s.match(/^q([1-4])/);
    if (q) return { stufe: 'Q' + q[1], klasse: '' };
    const mm = s.match(/^(1[0-3])(?:-(\d))?$/);
    if (mm) return { stufe: mm[1], klasse: mm[2] || '' };
    const u = s.match(/^(7|8|9)(?:-(\d))?$/);
    if (u) return { stufe: u[1], klasse: u[2] || '' };
    return { stufe: '', klasse: '' };
  };
  mdraft.stufeKlasse = splitCls(mdraft.cls);
  const draw = () => {
    const x = id != null ? m(id) : null;
    const mates = x ? teamMates(x) : [], teamIds = x ? [x.id, ...mates.map(y => y.id)] : [];
    const myBlocks = x ? blocks.filter(b => b.to >= iso(TODAY) && affected(b.scope).includes(x.id)).sort((a, b) => a.from < b.from ? -1 : 1) : [];
    const sw = (k, t, s) => `<div class="set-line"><span>${t}<small>${s}</small></span><button class="switch" role="switch" aria-checked="${mdraft[k]}" data-mset="${k}" aria-label="${t}"></button></div>`;
    openModal(`<div class="p-head">${x ? av(x) : ''}<div><h3 id="mTitle">${x ? esc(fullName(x)) : 'Mitglied hinzufügen (Schnelleingabe)'}</h3>${x ? `<p class="muted-s">${x.total} Dienste gesamt · ${x.year} dieses Jahr</p>` : '<p class="lead" style="margin-bottom:8px">Neuen Schulsanitäter direkt erfassen und zur Kartei hinzufügen.</p>'}</div></div>
      <div class="form-row" style="margin-top:12px"><label>Vorname *<input class="inp" id="mFirst" value="${esc(mdraft.first)}" placeholder="z. B. Max" autocomplete="off" autofocus></label>
        <label>Nachname (optional)<input class="inp" id="mLast" value="${esc(mdraft.last)}" placeholder="z. B. Mustermann" autocomplete="off"></label>
        <label>Stufe<span class="select"><label class="sr-only" for="mStufe">Stufe</label><select class="inp" id="mStufe">
            <option value="" disabled ${mdraft.stufeKlasse.stufe ? '' : 'selected'}>Stufe …</option>
            ${['7','8','9','10','Q1','Q2','Q3','Q4'].map(s => `<option value="${s}" ${mdraft.stufeKlasse.stufe === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select><i data-lucide="chevron-down"></i></span></label>
        <label id="mKlasseLabel" ${mdraft.stufeKlasse.klasse === undefined || /^Q/.test(mdraft.stufeKlasse.stufe) ? 'hidden' : ''}>Klasse<span class="select"><label class="sr-only" for="mKlasse">Klasse</label><select class="inp" id="mKlasse">
            <option value="" disabled ${mdraft.stufeKlasse.klasse ? '' : 'selected'}>Klasse …</option>
            ${['1','2','3','4'].map(k => `<option value="${k}" ${mdraft.stufeKlasse.klasse === k ? 'selected' : ''}>${k}</option>`).join('')}
          </select><i data-lucide="chevron-down"></i></span></label></div>
      ${sw('available', 'Verfügbar', 'Aus = krank/abwesend, wird nicht eingeplant')}
      ${sw('ausb', 'Ausgebildet (AUSB)', 'Sanitätsausbildung abgeschlossen – jedes Team braucht mindestens eine Person')}
      ${sw('springer', 'Springer', 'Springt bei Unterbesetzung ein')}
      <div class="set-row"><span>Qualifikation<small>AUSB / In Ausbildung / Helfer</small></span>
        <div class="select"><select id="mQuali">
          <option value="helfer" ${mdraft.quali === 'helfer' || (!mdraft.quali && !mdraft.ausb) ? 'selected' : ''}>Helfer</option>
          <option value="ausbildung" ${mdraft.quali === 'ausbildung' ? 'selected' : ''}>In Ausbildung</option>
          <option value="ausb" ${mdraft.quali === 'ausb' || (!mdraft.quali && mdraft.ausb) ? 'selected' : ''}>Vollständig (AUSB)</option>
        </select><i data-lucide="chevron-down"></i></div></div>
      <div class="set-row"><span>AUSB-Datum<small>seit wann vollständig ausgebildet</small></span>
        <input class="inp" type="date" id="mAusbDatum" style="max-width:170px" value="${mdraft.ausbildungsDatum || ''}"></div>
      <div class="set-row"><span>Kontakt<small>Schüler-E-Mail / Telefon (optional)</small></span>
        <input class="inp" id="mKontakt" style="max-width:220px" value="${esc(mdraft.kontakt || '')}" autocomplete="off"></div>
      ${x ? `<div class="sub-h" style="margin-top:18px">Team-Partner <small>${mates.length}/2 · Team = ${teamIds.length} Pers.</small></div>
        ${mates.length ? mates.map(p => `<div class="prow">${av(p)}<div class="t"><span>${esc(fullName(p))} ${p.ausb ? '<span class="badge">AUSB</span>' : ''}</span><small>Klasse ${esc(p.cls)}${p.available ? '' : ' · abwesend'}</small></div>
          <button class="icon-btn del" data-unpartner="${p.id}" aria-label="${esc(p.first)} als Partner entfernen"><i data-lucide="user-minus"></i></button></div>`).join('') : '<p class="muted">Noch kein Team – wird nur als Springer/Einzelperson geplant.</p>'}
        ${mates.length && !teamHasAusb(teamIds) ? `<div class="alert"><i data-lucide="octagon-alert"></i><span>Team ohne ausgebildete Person – der Algorithmus plant es nicht ein.</span></div>` : ''}
        ${mates.length < 2 ? `<button class="btn ghost wide" id="addPartner" style="margin-top:8px" aria-expanded="${partnerOpen}"><i data-lucide="user-plus"></i>Partner hinzufügen</button>
          ${partnerOpen ? `<div class="search" style="margin:8px 0 0;max-width:none"><i data-lucide="search"></i><label class="sr-only" for="pq">Partner suchen</label><input id="pq" type="search" placeholder="Name oder Klasse" value="${esc(partnerQuery)}" autocomplete="off"></div><div class="picker" id="pPicker">${pickerHTML(x)}</div>` : ''}` : ''}
        <div class="sub-h" style="margin-top:18px">Sperrtage &amp; Verhinderungen <small>${myBlocks.length} anstehend</small></div>
        <div style="margin-top:8px">${myBlocks.map(blockRow).join('') || '<p class="muted">Keine anstehenden Sperrtage.</p>'}</div>
        <button class="btn ghost wide" data-new-block-person="${x.id}"><i data-lucide="calendar-x"></i>Sperrtag eintragen (Person/Team verhindert)</button>`
      : `<p class="muted-s" style="margin-top:14px">Tipp: Nach dem Anlegen kannst du hier Teampartner und individuelle Sperrtage eintragen (an denen die Person oder ihr Team verhindert ist).</p>`}
      <div class="modal-actions">${x ? `<button class="btn danger" id="mDel" style="margin-right:auto"><i data-lucide="trash-2"></i>Löschen</button>` : ''}
        <button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="mSave"><i data-lucide="check"></i>${x ? 'Speichern' : 'Hinzufügen'}</button></div>`, { refresh: draw });
    $('#mFirst').oninput = e => mdraft.first = e.target.value; $('#mLast').oninput = e => mdraft.last = e.target.value;
    // Stufe/Klasse-Dropdowns: Q1-Q4 haben keine Klassen
    const syncKlasseVisibility = () => {
      const isQ = /^Q/.test(mdraft.stufeKlasse.stufe);
      const lab = $('#mKlasseLabel');
      if (lab) lab.hidden = isQ;
      if (isQ) mdraft.stufeKlasse.klasse = '';
    };
    $('#mStufe').onchange = e => { mdraft.stufeKlasse.stufe = e.target.value; syncKlasseVisibility(); };
    const mq = $('#mQuali'); if (mq) mq.onchange = e => { mdraft.quali = e.target.value; };
    const mad = $('#mAusbDatum'); if (mad) mad.onchange = e => { mdraft.ausbildungsDatum = e.target.value || null; };
    const mk = $('#mKontakt'); if (mk) mk.oninput = e => { mdraft.kontakt = e.target.value; };
    $('#mKlasse').onchange = e => { mdraft.stufeKlasse.klasse = e.target.value; };
    $$('[data-mset]').forEach(b => b.onclick = () => { const k = b.dataset.mset; mdraft[k] = !mdraft[k]; b.setAttribute('aria-checked', mdraft[k]); });
    $$('[data-partner]').forEach(b => b.onclick = () => { const p = m(+b.dataset.partner); if (linkPartner(x, p)) { partnerOpen = false; partnerQuery = ''; save(); renderAll(); draw(); toast(`${x.first} & ${p.first} sind jetzt ein Team`); } });
    $$('[data-unpartner]').forEach(b => b.onclick = () => { const p = m(+b.dataset.unpartner); unlinkPartner(p); save(); renderAll(); draw(); toast(`${p.first} aus dem Team entfernt`); });
    const add = $('#addPartner'); if (add) add.onclick = () => { partnerOpen = !partnerOpen; draw(); $('#pq')?.focus(); };
    const pq = $('#pq'); if (pq) pq.oninput = () => { partnerQuery = pq.value; $('#pPicker').innerHTML = pickerHTML(x); $$('#pPicker [data-partner]').forEach(b => b.onclick = () => { const p = m(+b.dataset.partner); if (linkPartner(x, p)) { partnerOpen = false; partnerQuery = ''; save(); renderAll(); draw(); toast(`${x.first} & ${p.first} sind jetzt ein Team`); } }); icons(); };
    $('#mSave').onclick = () => {
      const first = mdraft.first.trim();
      const last = mdraft.last.trim();
      const stufe = (mdraft.stufeKlasse?.stufe || '').trim();
      const klasse = (mdraft.stufeKlasse?.klasse || '').trim();
      if (!first) { toast('Bitte mindestens einen Vornamen angeben', true); $('#mFirst')?.focus(); return; }
      if (!stufe) { toast('Bitte eine Stufe wählen', true); $('#mStufe')?.focus(); return; }
      const isQ = /^Q/.test(stufe);
      if (!isQ && !klasse) { toast('Bitte eine Klasse (1–4) wählen', true); $('#mKlasse')?.focus(); return; }
      // Klasse im Format "Stufe-Klasse" (z. B. 10-2) bzw. nur Stufe bei Q1-Q4
      const cls = isQ ? stufe.toLowerCase() : `${stufe}-${klasse}`.toLowerCase();
      const qualiVal = $('#mQuali')?.value || mdraft.quali || (mdraft.ausb ? 'ausb' : 'helfer');
      const cleanData = { ...mdraft, first, last: last || '-', cls, quali: qualiVal, ausbildungsStatus: qualiVal, inAusbildung: qualiVal === 'ausbildung', ausb: qualiVal === 'ausb', ausbilderTeams: mdraft.ausbilderTeams || [], ausbilderTeamLabels: mdraft.ausbilderTeamLabels || [], ausbilderTeamPrefs: mdraft.ausbilderTeamPrefs || [], ausbilderTeamsSpecified: !!mdraft.ausbilderTeamsSpecified, ausbildungsDatum: qualiVal === 'ausb' ? ($('#mAusbDatum')?.value || mdraft.ausbildungsDatum || null) : null, kontakt: ($('#mKontakt')?.value ?? mdraft.kontakt ?? '') };
      const saved = upsertMember(cleanData, id);
      renderAll();
      if (id == null) { toast(`${saved.first} angelegt`); openMember(saved.id); } else { closeModal(); toast('Änderungen gespeichert'); }
    };
    const del = $('#mDel'); if (del) del.onclick = () => askDelete(id);
  };
  draw();
}
function askDelete(id) {
  const x = m(id); if (!x) return;
  confirmBox(`${fullName(x)} löschen?`, 'Die Person wird aus Team, Sperrtagen und kommenden Plantagen entfernt (betroffene Tage werden als Konflikt markiert). Das lässt sich nur über ein Backup rückgängig machen.', 'Endgültig löschen',
    () => { deleteMember(id); renderAll(); toast(`${x.first} gelöscht`); });
}

/* ---------- Sperrtag-Dialog (Tages- & Stundenblöcke) ---------- */
let draft = null;
const CLASSES = () => [...new Set(members.map(x => x.cls))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
function openBlockModal({ date, personId } = {}) {
  const d = date || iso(selected >= TODAY ? selected : TODAY), p = personId != null ? m(personId) : null;
  const defaultCls = CLASSES()[0] || '';
  draft = {
    type: 'Verhindert',
    title: '',
    from: d,
    to: d,
    hour: '', // '' = ganztägig, oder 1..7
    kind: p ? 'person' : (defaultCls ? 'class' : 'person'),
    value: p ? [p.id] : (defaultCls ? defaultCls : (members[0] ? [members[0].id] : [])),
    q: '',
    weekly: { days: [new Date().getDay() || 1] }, // für Typ „Generell verhindert"
    returnTo: personId
  };
  openModal(`<h3 id="mTitle">Sperrtag eintragen</h3>
    <p class="lead">Sperrt eine Person oder ihr gesamtes Team an bestimmten Tagen (Verhinderung, Krankheit, Termin). Für regelmäßig wiederkehrende Ausfälle (z. B. „jeden Montag ganztags nicht da") wähle „Generell verhindert". Klausuren &amp; Klassenarbeiten werden separat gepflegt.</p>
    <span class="form-label">Art</span><div class="chips" role="group" aria-label="Art">${Object.keys(BTYPES).map(t => `<button class="fchip" aria-pressed="${t === draft.type}" data-bt="${t}"><i data-lucide="${BTYPES[t].icon}"></i>${t}</button>`).join('')}</div>
    <label><span class="form-label">Bezeichnung</span><input class="inp" id="bTitle" placeholder="z. B. Arzttermin, Krankheit, Klassenfahrt" autocomplete="off"></label>
    <div id="bWeeklyBox" hidden>
      <span class="form-label">Wöchentlich verhindert an diesen Tagen</span>
      <div class="chips" id="bWeeklyDays" role="group" aria-label="Wochentage"></div>
      <p class="muted-s" style="margin-top:6px">Diese Sperre gilt unbefristet – alle ausgewählten Wochentage werden in der Planung automatisch ignoriert, solange die Sperre besteht.</p>
    </div>
    <div class="form-row" id="bDateRow">
      <label><span class="form-label">Von</span><input class="inp" type="date" id="bFrom" value="${draft.from}"></label>
      <label><span class="form-label">Bis</span><input class="inp" type="date" id="bTo" value="${draft.to}"></label>
      <label><span class="form-label">Zeitraum / Schulstunde</span>
        <select class="inp" id="bHour">
          <option value="">Ganztägig gesperrt</option>
          ${SCHOOL_HOURS.map(h => `<option value="${h.h}">${h.label}</option>`).join('')}
        </select>
      </label>
    </div>
    <span class="form-label">Gilt für</span>
    <div class="seg" id="bKind" role="group" aria-label="Gilt für">${[['stufe', 'Stufe'], ['class', 'Klasse'], ['person', 'Personen']].map(([k, l]) => `<button aria-pressed="${k === draft.kind}" data-bk="${k}">${l}</button>`).join('')}</div>
    <div id="bScope" style="margin-top:10px"></div><div class="affect" id="bAffect" aria-live="polite"></div>
    <div class="modal-actions"><button class="btn ghost" id="bCancel">Abbrechen</button><button class="btn primary" id="bSave"><i data-lucide="lock"></i>Sperre speichern</button></div>`);
  $$('[data-bt]').forEach(b => b.onclick = () => {
    draft.type = b.dataset.bt;
    $$('[data-bt]').forEach(x => x.setAttribute('aria-pressed', x === b));
    // „Generell verhindert" zeigt Wochentags-Auswahl statt Datumsbereich
    const weekly = !!BTYPES[draft.type]?.weekly;
    $('#bWeeklyBox').hidden = !weekly;
    $('#bDateRow').hidden = weekly;
    if (weekly) renderWeeklyDays();
    renderAffect();
  });
  $('#bTitle').oninput = e => draft.title = e.target.value;
  $('#bFrom').onchange = e => { draft.from = e.target.value; if (draft.to < draft.from) { draft.to = draft.from; $('#bTo').value = draft.to; } renderAffect(); };
  $('#bTo').onchange = e => { draft.to = e.target.value; renderAffect(); };
  $('#bHour').onchange = e => { draft.hour = e.target.value; renderAffect(); };
  $$('[data-bk]').forEach(b => b.onclick = () => {
    draft.kind = b.dataset.bk; $$('[data-bk]').forEach(x => x.setAttribute('aria-pressed', x === b));
    draft.value = draft.kind === 'stufe' ? 10 : draft.kind === 'class' ? (CLASSES()[0] || '') : (draft.returnTo != null ? [draft.returnTo] : (members[0] ? [members[0].id] : []));
    renderScope();
  });
  $('#bSave').onclick = saveBlock;
  $('#bCancel').onclick = () => { if (draft.returnTo != null) openMember(draft.returnTo); else closeModal(); };
  renderScope();
}
function renderScope() {
  const el = $('#bScope');
  if (draft.kind === 'stufe') el.innerHTML = `<div class="chips">${[[7,'7'],[8,'8'],[9,'9'],[10,'10'],[11,'Q1'],[12,'Q2'],[13,'Q3'],[14,'Q4']].map(([s,l]) => `<button class="fchip" aria-pressed="${+draft.value === s}" data-sv="${s}">Stufe ${l}</button>`).join('')}</div>`;
  else if (draft.kind === 'class') el.innerHTML = `<div class="chips">${CLASSES().map(c => `<button class="fchip" aria-pressed="${draft.value === c}" data-sv="${c}">${esc(c)}</button>`).join('')}</div>`;
  else el.innerHTML = `<div class="search" style="margin-bottom:8px;max-width:none"><i data-lucide="search"></i><label class="sr-only" for="bq">Personen suchen</label><input id="bq" type="search" placeholder="Personen suchen" autocomplete="off" value="${esc(draft.q)}"></div><div class="picker" id="bPeople"></div>`;
  $$('[data-sv]').forEach(b => b.onclick = () => { draft.value = draft.kind === 'stufe' ? +b.dataset.sv : b.dataset.sv; $$('[data-sv]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderAffect(); });
  if (draft.kind === 'person') { $('#bq').oninput = e => { draft.q = e.target.value; renderPeople(); }; renderPeople(); }
  icons(); renderAffect();
}
function renderPeople() {
  const q = draft.q.trim().toLowerCase();
  const list = members.filter(x => !q || `${x.first} ${x.last} ${x.cls}`.toLowerCase().includes(q)).sort((a, b) => (draft.value.includes(b.id) - draft.value.includes(a.id)) || a.stufe - b.stufe);
  $('#bPeople').innerHTML = list.map(x => { const on = draft.value.includes(x.id);
    return `<button data-sp="${x.id}" aria-pressed="${on}">${av(x)}${esc(fullName(x))}<span class="cls">${esc(x.cls)}</span><span class="check ${on ? 'yes' : ''}" style="width:26px;height:26px;margin-left:6px">${on ? '<i data-lucide="check"></i>' : ''}</span></button>`; }).join('');
  $$('[data-sp]').forEach(b => b.onclick = () => { const id = +b.dataset.sp; draft.value = draft.value.includes(id) ? draft.value.filter(v => v !== id) : [...draft.value, id]; renderPeople(); renderAffect(); });
  icons();
}
function renderWeeklyDays() {
  const el = $('#bWeeklyDays');
  if (!el) return;
  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr']; // Schultage (JS: 1..5)
  el.innerHTML = days.map((d, i) => {
    const dow = i + 1, on = draft.weekly.days.includes(dow);
    return `<button class="fchip" aria-pressed="${on}" data-wd="${dow}">${d}</button>`;
  }).join('');
  $$('[data-wd]').forEach(b => b.onclick = () => {
    const dow = +b.dataset.wd;
    draft.weekly.days = draft.weekly.days.includes(dow)
      ? draft.weekly.days.filter(x => x !== dow)
      : [...draft.weekly.days, dow];
    b.setAttribute('aria-pressed', draft.weekly.days.includes(dow));
    renderAffect();
  });
}
function draftConflicts(ids) {
  // Für wöchentliche Sperren: Konflikte in den nächsten 60 Tagen zählen
  if (BTYPES[draft.type]?.weekly) {
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const d = addDays(TODAY, i);
      if (!isSchool(d) || !draft.weekly.days.includes(d.getDay())) continue;
      const e = plan[iso(d)];
      if (e && e.team.some(id => ids.includes(id))) n++;
    }
    return n;
  }
  let n = 0, d = parse(draft.from); const end = parse(draft.to);
  while (d <= end) { const e = plan[iso(d)]; if (isSchool(d) && e && e.team.some(id => ids.includes(id))) n++; d = addDays(d, 1); }
  return n;
}
function renderAffect() {
  const ids = affected({ kind: draft.kind, value: draft.value }), conf = draftConflicts(ids);
  const names = ids.slice(0, 5).map(id => m(id).first).join(', ') + (ids.length > 5 ? ` +${ids.length - 5}` : '');
  $('#bAffect').innerHTML = `<b>${ids.length} ${ids.length === 1 ? 'Sani' : 'Sanis'} gesperrt</b><span class="names">${esc(names) || 'Noch niemand ausgewählt'}</span>
    ${conf ? `<span class="w">${conf} geplante(r) Dienst(e) kollidieren – danach Plan neu generieren</span>` : ids.length ? `<span class="g">Keine Kollision mit dem aktuellen Plan</span>` : ''}`;
}
function saveBlock() {
  const ids = affected({ kind: draft.kind, value: draft.value });
  const isWeekly = !!BTYPES[draft.type]?.weekly;
  if (!isWeekly && !draft.from) { toast('Bitte ein Datum wählen', true); return; }
  if (isWeekly && !draft.weekly.days.length) { toast('Bitte mindestens einen Wochentag wählen', true); return; }
  if (!ids.length) { toast('Bitte mindestens eine Person wählen', true); return; }
  const b = {
    id: Date.now(),
    type: draft.type,
    title: draft.title.trim() || (isWeekly ? 'Generell verhindert' : draft.type),
    from: isWeekly ? iso(TODAY) : draft.from,
    to: isWeekly ? '9999-12-31' : (draft.to < draft.from ? draft.from : draft.to),
    hour: draft.hour ? +draft.hour : null,
    scope: { kind: draft.kind, value: draft.kind === 'person' ? [...draft.value] : draft.value }
  };
  if (isWeekly) b.weekly = { enabled: true, days: [...draft.weekly.days] };
  const conf = draftConflicts(ids);
  blocks.push(b); save();
  if (!isWeekly) {
    viewMonth = new Date(parse(b.from).getFullYear(), parse(b.from).getMonth(), 1); selected = parse(b.from);
  }
  renderAll();
  if (draft.returnTo != null) openMember(draft.returnTo); else closeModal();
  toast(conf ? `Gespeichert · ${conf} Konflikt(e) im Plan` : 'Sperre gespeichert', !!conf);
}

/* ---------- Export ---------- */
function deliver(blob, filename) {
  try {
    // Download über versteckten <a download> – zuverlässig in Chrome/Edge/Brave
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    toast(`${filename} erstellt`);
  } catch (err) {
    // Fallback: Web Share API, falls verfügbar
    try {
      const file = typeof File !== 'undefined' ? new File([blob], filename, { type: blob.type }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: filename }).catch(() => {});
        return;
      }
    } catch (e) { /* ignorieren */ }
    toast('Export fehlgeschlagen: ' + (err?.message || 'unbekannt'), true);
  }
}
function openExport() {
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth(), rows = planRows(y, mo).filter(r => r.e);
  if (!rows.length) { toast(`Noch kein Plan für ${MONTHS[mo]}`, true); return; }
  const text = planText(y, mo), open = rows.filter(r => r.e.status === 'bad').length;
  openModal(`<h3 id="mTitle">Plan teilen</h3><p class="lead">${MONTHS[mo]} ${y} · ${rows.length} Dienste · ${open} offen</p>
    <label class="sr-only" for="exText">Vorschau</label><textarea class="export-pre" id="exText" readonly>${esc(text)}</textarea>
    ${open ? `<div class="alert"><i data-lucide="triangle-alert"></i><span>${open} Tag(e) haben noch Konflikte – vor dem Teilen neu generieren?</span></div>` : ''}
    <div class="export-grid">
      <a class="ex-btn wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer"><span class="ei"><i data-lucide="message-circle"></i></span><span>WhatsApp<small>An die AG-Gruppe</small></span></a>
      <button class="ex-btn" id="exCopy"><span class="ei"><i data-lucide="copy"></i></span><span>Text kopieren<small>Für jede App</small></span></button>
      <button class="ex-btn" id="exPdf"><span class="ei"><i data-lucide="file-text"></i></span><span>PDF<small>A4 zum Aushang</small></span></button>
      <button class="ex-btn" id="exPng"><span class="ei"><i data-lucide="image"></i></span><span>Bild<small>PNG für Gruppe/Status</small></span></button>
    </div><div class="modal-actions"><button class="btn primary" data-close>Fertig</button></div>`, { wide: true });
  $('#exCopy').onclick = () => {
    const ta = $('#exText');
    (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast('Text kopiert'))
      .catch(() => { ta.select(); try { document.execCommand('copy'); toast('Text kopiert'); } catch (e) { toast('Bitte manuell kopieren', true); } });
  };
  $('#exPdf').onclick = () => makePdf(y, mo);
  $('#exPng').onclick = () => makePng(y, mo);
}
function makePdf(y, mo) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) { toast('PDF-Modul lädt noch …', true); return; }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const header = () => {
    doc.setFillColor(39, 39, 39); doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.text(`Dienstplan ${MONTHS[mo]} ${y}`, 16, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(200, 168, 246); doc.text(`Schulsanitätsdienst · ${DEFAULT_LOCATION} · 1. große Pause`, 16, 23);
  };
  header();
  let yy = 42;
  doc.setFontSize(8.5); doc.setTextColor(111, 110, 104); doc.text('DATUM', 16, yy); doc.text('TEAM', 50, yy); doc.text('STATUS', 180, yy, { align: 'center' }); yy += 3;
  planRows(y, mo).forEach(({ d, e }, i) => {
    if (yy > 272) { doc.addPage(); header(); yy = 40; }
    if (i % 2 === 0) { doc.setFillColor(249, 248, 242); doc.rect(12, yy, 186, 9, 'F'); }
    doc.setFontSize(10.5); doc.setTextColor(21, 21, 21); doc.text(fmtS(d), 16, yy + 6);
    doc.text(e ? (e.team.map(id => fullName(m(id))).join(', ') || 'Offen') : '–', 50, yy + 6, { maxWidth: 112 });
    const st = !e ? ['–', [210, 208, 200], 60] : e.status === 'ok' ? ['OK', [52, 199, 89], 255] : e.status === 'warn' ? [e.tag, [255, 193, 7], 40] : ['Konflikt', [220, 53, 69], 255];
    doc.setFillColor(...st[1]); doc.roundedRect(168, yy + 1.8, 24, 5.4, 2.7, 2.7, 'F');
    doc.setFontSize(8); doc.setTextColor(st[2]); doc.text(String(st[0]), 180, yy + 5.6, { align: 'center' });
    yy += 9;
  });
  doc.setFontSize(8); doc.setTextColor(150); doc.text(`Erstellt am ${TODAY.toLocaleDateString('de-DE')} mit SaniAlarm · Sperrtage & Verhinderungen berücksichtigt`, 16, 288);
  deliver(doc.output('blob'), `Dienstplan-${MONTHS[mo]}-${y}.pdf`);
}
async function makePng(y, mo) {
  const rows = planRows(y, mo), W = 1080, rowH = 66, top = 230, H = top + rows.length * rowH + 110;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); if (!g) { toast('Canvas nicht verfügbar', true); return; }
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const rr = (x, y0, w, h, r) => { g.beginPath(); g.roundRect(x, y0, w, h, r); g.fill(); };
  g.fillStyle = '#F9F8F2'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#272727'; rr(40, 40, W - 80, 150, 36);
  g.fillStyle = '#C8A8F6'; g.font = '500 26px Outfit, sans-serif'; g.fillText('SANIALARM · DIENSTPLAN', 84, 100);
  g.fillStyle = '#FFFFFF'; g.font = '300 58px Outfit, sans-serif'; g.fillText(`${MONTHS[mo]} ${y}`, 84, 162);
  rows.forEach(({ d, e }, i) => {
    const y0 = top + i * rowH;
    if (i % 2 === 0) { g.fillStyle = '#FFFFFF'; rr(40, y0, W - 80, rowH - 8, 18); }
    g.fillStyle = '#6F6E68'; g.font = '500 26px Outfit, sans-serif'; g.fillText(fmtS(d), 72, y0 + 39);
    g.fillStyle = '#151515'; g.font = '400 28px Outfit, sans-serif';
    g.fillText(e ? (e.team.map(id => short(m(id))).join('  &  ') || 'Offen') : '–', 260, y0 + 39);
    g.fillStyle = !e ? '#D3D1C6' : { ok: '#34C759', warn: '#FFC107', bad: '#DC3545' }[e.status];
    g.beginPath(); g.arc(W - 84, y0 + 29, 11, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = '#6F6E68'; g.font = '400 22px Outfit, sans-serif'; g.fillText(`${DEFAULT_LOCATION} · 1. große Pause · Tausch nur nach Absprache`, 72, H - 48);
  c.toBlob(b => deliver(b, `Dienstplan-${MONTHS[mo]}-${y}.png`), 'image/png');
}

/* ---------- Einsatz-Log ---------- */
let logDate = new Date(TODAY), logRows = [], logType = 'Sportunfall', pickerOpen = false;

function currentLogTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function updateRoomPreview() {
  const b = $('#logBuilding')?.value || 'B';
  const f = $('#logFloor')?.value || '0';
  const rawNr = parseInt($('#logRoomNr')?.value, 10);
  const n = isNaN(rawNr) ? 0 : Math.max(0, Math.min(99, rawNr));
  const fullNr = `${f}${pad(n)}`;
  const code = `${b}-${fullNr}`;
  const el = $('#roomPreview');
  const exp = $('#roomExplanation');
  if (el) el.textContent = code;
  if (exp) {
    const flTxt = f === '0' ? 'Erdgeschoss (EG)' : `${f}. Obergeschoss`;
    exp.textContent = `Gebäudeteil ${b} · ${flTxt} · Raumnummer ${n}`;
  }
  return code;
}

function currentSelectedPlace() {
  const type = $('#logPlaceType')?.value || 'special';
  if (type === 'room') {
    return updateRoomPreview();
  }
  const sp = $('#logPlaceSpecial')?.value || 'Sporthalle';
  if (sp === 'custom') {
    return $('#logPlaceCustom')?.value.trim() || 'Sonstiges';
  }
  return sp;
}

function syncPlaceControls() {
  const type = $('#logPlaceType')?.value || 'special';
  const isRoom = type === 'room';
  const roomRow = $('#placeRoomRow');
  const specRow = $('#placeSpecialRow');
  const customWrap = $('#placeCustomWrap');
  if (roomRow) roomRow.hidden = !isRoom;
  if (specRow) specRow.hidden = isRoom;
  if (customWrap) {
    const isCustom = !isRoom && $('#logPlaceSpecial')?.value === 'custom';
    customWrap.hidden = !isCustom;
    if (isCustom) $('#logPlaceCustom')?.focus();
  }
  if (isRoom) updateRoomPreview();
}

let logUsedInventory = {};

function renderInvCounters() {
  const el = $('#logInvCounters');
  if (!el) return;
  el.innerHTML = Object.entries(inventory).map(([k, it]) => {
    const used = logUsedInventory[k] || 0;
    return `
      <div class="inv-item">
        <span class="lbl" title="${esc(it.label)}">${esc(it.label)}</span>
        <div class="acts">
          <button type="button" data-inv-dec="${k}">-</button>
          <b>${used}</b>
          <button type="button" data-inv-inc="${k}">+</button>
        </div>
      </div>`;
  }).join('');
  $$('[data-inv-inc]').forEach(b => b.onclick = () => {
    const k = b.dataset.invInc;
    const max = inventory[k]?.count ?? 99;
    logUsedInventory[k] = Math.min(max, (logUsedInventory[k] || 0) + 1);
    renderInvCounters();
  });
  $$('[data-inv-dec]').forEach(b => b.onclick = () => {
    const k = b.dataset.invDec;
    logUsedInventory[k] = Math.max(0, (logUsedInventory[k] || 0) - 1);
    renderInvCounters();
  });
}

function openInventoryModal() {
  const draw = () => {
    openModal(`<h3 id="mTitle">Verbandsmaterial-Lagerbestand</h3>
      <p class="lead">Bestand im Sanitätsraum prüfen und Nachbestellungen organisieren.</p>
      <div class="list" style="margin-top:14px">
        ${Object.entries(inventory).map(([k, it]) => {
          const isLow = it.count <= it.warnAt;
          return `
            <div class="set-line">
              <div>
                <b>${esc(it.label)}</b>
                <small>${isLow ? '<span style="color:var(--red);font-weight:600">Nachbestellen nötig!</span> · ' : ''}Mindestbestand: ${it.warnAt}</small>
              </div>
              <div class="stepper">
                <button type="button" data-adj-inv="${k}" data-val="-1"><i data-lucide="minus"></i></button>
                <b style="font-size:17px;min-width:32px;text-align:center;color:${isLow ? 'var(--red)' : 'inherit'}">${it.count}</b>
                <button type="button" data-adj-inv="${k}" data-val="1"><i data-lucide="plus"></i></button>
              </div>
            </div>`;
        }).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="reorderMailBtn" style="margin-right:auto"><i data-lucide="mail-plus"></i>Material-Nachbestellung anfordern</button>
        <button class="btn primary" data-close>Schließen</button>
      </div>`, { refresh: draw });
    $$('[data-adj-inv]').forEach(b => b.onclick = () => {
      const k = b.dataset.adjInv;
      const diff = +b.dataset.val;
      inventory[k].count = Math.max(0, inventory[k].count + diff);
      save();
      draw();
      renderInvCounters();
    });
    $('#reorderMailBtn').onclick = () => reorderRequest();
    icons();
  };
  draw();
}

/* ---------- Material-Nachbestellung: Text-Template + mailto ---------- */
function reorderRequest() {
  const low = Object.entries(inventory).filter(([, it]) => it.count <= it.warnAt);
  if (!low.length) { toast('Alle Bestände über dem Mindestbestand', false); return; }
  const lines = low.map(([k, it]) => `- ${it.label}: aktuell ${it.count} (Mindestbestand ${it.warnAt}) → bitte ${Math.max(it.warnAt * 2 - it.count, it.warnAt)} Stück nachbestellen`);
  const subject = encodeURIComponent('Nachbestellung Schulsanitätsdienst – Material niedrig');
  const body = encodeURIComponent(`Liebe Verwaltung / liebe betreuende Lehrkraft,\n\nfolgende Materialien des Schulsanitätsdienstes sind unter dem Mindestbestand und sollten nachbestellt werden:\n\n${lines.join('\n')}\n\nVielen Dank!\n(automatisch erstellt mit SaniAlarm am ${TODAY.toLocaleDateString('de-DE')})`);
  const mailto = `mailto:?subject=${subject}&body=${body}`;
  openModal(`<h3 id="mTitle">Material-Nachbestellung anfordern</h3>
    <p class="lead">Folgende Artikel liegen unter dem Mindestbestand:</p>
    <div class="list">${low.map(([k, it]) => `<div class="set-line"><div><b>${esc(it.label)}</b><small>aktuell ${it.count} · Mindestbestand ${it.warnAt}</small></div><span class="badge warn">nachbestellen</span></div>`).join('')}</div>
    <label style="display:block;margin-top:12px"><span class="form-label">Nachricht zum Kopieren</span><textarea class="inp" id="reorderText" rows="7" style="width:100%;font-family:inherit">${esc(decodeURIComponent(body))}</textarea></label>
    <div class="modal-actions">
      <button class="btn ghost" id="reorderCopy"><i data-lucide="copy"></i>Text kopieren</button>
      <a class="btn primary" id="reorderMail" href="${mailto}"><i data-lucide="send"></i>E-Mail öffnen</a>
    </div>`);
  $('#reorderCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#reorderText').value); toast('Text kopiert'); }
    catch { $('#reorderText').select(); }
  };
}

function loadLog() {
  const info = isSchool(logDate) ? evaluate(logDate) : null;
  logRows = (info ? info.team.filter(id => m(id)) : []).map(id => ({ id, present: !info.hit.includes(id), spont: false }));
  pickerOpen = false;
  logUsedInventory = {};
  if ($('#logTime') && !$('#logTime').value) $('#logTime').value = currentLogTime();
  if ($('#logCall112')) $('#logCall112').checked = false;
  if ($('#logSekretariat')) $('#logSekretariat').checked = false;
  if ($('#logRtwGate')) $('#logRtwGate').checked = false;
  if ($('#logGuv')) $('#logGuv').checked = false;
  syncPlaceControls();
  renderInvCounters();
  renderLog();
}
function renderLog() {
  logRows = logRows.filter(r => m(r.id));      // gelöschte Personen aus laufendem Log entfernen
  $('#logDate').textContent = fmt(logDate);
  $('#logTypes').innerHTML = ['Sportunfall', 'Kreislauf', 'Schnittwunde', 'Sonstiges'].map(t => `<button class="fchip" aria-pressed="${t === logType}" data-type="${t}">${t}</button>`).join('');
  $$('[data-type]').forEach(b => b.onclick = () => { logType = b.dataset.type; renderLog(); });
  $('#soll').textContent = logRows.filter(r => !r.spont).length;
  $('#ist').textContent = logRows.filter(r => r.present).length;
  $('#spont').textContent = logRows.filter(r => r.spont).length;
  $('#logList').innerHTML = logRows.length ? logRows.map((r, i) => { const x = m(r.id); return `
    <div class="mem ${r.present ? '' : 'absent'}">${av(x)}<div class="info"><div class="name">${esc(fullName(x))} ${r.spont ? '<span class="badge spont">SPONTAN</span>' : ''}${x.ausb ? '<span class="badge">AUSB</span>' : ''}</div>
    <div class="sub">Klasse ${esc(x.cls)} · ${r.present ? 'Anwesend' : 'Abwesend'}</div></div>
    ${r.spont ? `<button class="check no" data-rm="${i}" aria-label="${esc(x.first)} entfernen"><i data-lucide="trash-2"></i></button>` : ''}
    <button class="check ${r.present ? 'yes' : 'no'}" data-pres="${i}" aria-pressed="${r.present}" aria-label="${esc(x.first)} ${r.present ? 'als abwesend markieren' : 'als anwesend markieren'}"><i data-lucide="${r.present ? 'check' : 'x'}"></i></button></div>`; }).join('')
    : `<div class="empty-state" style="padding:20px 0">Kein Dienst geplant. Füge Helfer spontan hinzu.</div>`;
  $$('[data-pres]').forEach(b => b.onclick = () => { const r = logRows[+b.dataset.pres]; r.present = !r.present; renderLog(); });
  $$('[data-rm]').forEach(b => b.onclick = () => { logRows.splice(+b.dataset.rm, 1); renderLog(); });
  const picker = $('#picker'); picker.hidden = !pickerOpen; $('#addHelper').setAttribute('aria-expanded', pickerOpen);
  if (pickerOpen) {
    const ids = logRows.map(r => r.id);
    picker.innerHTML = members.filter(x => x.available && !ids.includes(x.id)).map(x => `<button data-add="${x.id}">${av(x)}${esc(fullName(x))}<span class="cls">${esc(x.cls)}${x.ausb ? ' · AUSB' : ''}</span></button>`).join('') || '<div class="muted" style="padding:12px 14px">Niemand mehr verfügbar.</div>';
    $$('[data-add]').forEach(b => b.onclick = () => { logRows.push({ id: +b.dataset.add, present: true, spont: true }); pickerOpen = false; renderLog(); });
  }
  $('#history').innerHTML = einsaetze.slice(0, 10).map(h => {
    const flags = [];
    if (h.call112) flags.push('<span class="status-pill bad" style="font-size:11px;padding:2px 6px">112</span>');
    if (h.sekretariat) flags.push('<span class="status-pill warn" style="font-size:11px;padding:2px 6px">Sekretariat</span>');
    if (h.rtwGate) flags.push('<span class="status-pill ok" style="font-size:11px;padding:2px 6px">Tor-Einweisung</span>');
    if (h.guv) flags.push('<span class="status-pill spr" style="font-size:11px;padding:2px 6px">GUV</span>');
    const usedMat = h.usedInventory ? Object.entries(h.usedInventory).filter(([, v]) => v > 0).map(([k, v]) => `${v}× ${inventory[k]?.label || k}`).join(', ') : '';
    return `<div class="hist"><span class="ico"><i data-lucide="siren"></i></span><div style="flex:1"><div><b>${esc(h.type)}</b>${h.time ? ` · ${esc(h.time)}` : ''} ${flags.join(' ')}</div>
      <div class="muted-s">${fmt(parse(h.d))} · ${esc(h.place)}${h.note ? ` · ${esc(h.note)}` : ''}</div>
      ${usedMat ? `<div style="font-size:12px;color:var(--muted);margin-top:2px"><i data-lucide="package-check" style="width:12px;height:12px;vertical-align:-1px"></i> Material: ${esc(usedMat)}</div>` : ''}
    </div>
    <div class="r">Ist ${h.ist} / Soll ${h.soll}<br><span style="color:${h.ist >= h.soll ? '#1E8E3E' : 'var(--red)'}">${h.ist >= h.soll ? 'vollständig' : 'unterbesetzt'}</span></div></div>`;
  }).join('') || '<p class="muted">Noch keine Einsätze erfasst.</p>';
  icons();
}
$('#openInvBtn').onclick = openInventoryModal;
$('#addHelper').onclick = () => { pickerOpen = !pickerOpen; renderLog(); };
$('#logPrev').onclick = () => { logDate = addDays(logDate, -1); loadLog(); };
$('#logNext').onclick = () => { logDate = addDays(logDate, 1); loadLog(); };
$('#logPlaceType').onchange = syncPlaceControls;
$('#logPlaceSpecial').onchange = syncPlaceControls;
$('#logBuilding').onchange = updateRoomPreview;
$('#logFloor').onchange = updateRoomPreview;
$('#logRoomNr').oninput = updateRoomPreview;

$('#saveLog').onclick = () => {
  const present = logRows.filter(r => r.present);
  if (!present.length) { toast('Mindestens eine Person muss anwesend sein', true); return; }
  const place = currentSelectedPlace();
  const timeVal = $('#logTime').value || currentLogTime();
  present.forEach(r => { const x = m(r.id); x.total++; if (logDate.getFullYear() === TODAY.getFullYear()) x.year++; if (logDate.getMonth() === TODAY.getMonth() && logDate.getFullYear() === TODAY.getFullYear()) x.month++; });

  // Materialbestand dekrementieren
  const deducted = {};
  Object.entries(logUsedInventory).forEach(([k, n]) => {
    if (n > 0 && inventory[k]) {
      inventory[k].count = Math.max(0, inventory[k].count - n);
      deducted[k] = n;
    }
  });

  const entry = {
    d: iso(logDate),
    time: timeVal,
    type: logType,
    place,
    note: $('#logNote').value.trim(),
    call112: !!$('#logCall112')?.checked,
    sekretariat: !!$('#logSekretariat')?.checked,
    rtwGate: !!$('#logRtwGate')?.checked,
    guv: !!$('#logGuv')?.checked,
    usedInventory: deducted,
    ist: present.length,
    soll: logRows.filter(r => !r.spont).length,
    // Teilnehmer für Statistik: {id, spont} — wer war wirklich dabei?
    crew: present.map(r => ({ id: r.id, spont: !!r.spont })),
    // Geplante (eingeteilte) Personen am Tag – für Soll/Ist-Abgleich & Abwesenheits-Statistik
    planned: logRows.filter(r => !r.spont).map(r => r.id),
  };
  einsaetze.unshift(entry);
  $('#logNote').value = '';
  logUsedInventory = {};
  save(); renderAll(); toast(`Einsatz gespeichert · Ort: ${place}`);
};

/* ---------- Statistik (Fairness-Engine & Kennzahlen) ---------- */
let tf = 'total', metricView = 'ready';
const SM = window.SaniMetrics;
function tfRange() {
  if (tf === 'month') return { from: iso(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)), to: iso(TODAY) };
  if (tf === 'term') { // Schuljahr: August–Juli
    const sy = TODAY.getMonth() >= 7 ? TODAY.getFullYear() : TODAY.getFullYear() - 1;
    return { from: iso(new Date(sy, 7, 1)), to: iso(TODAY) };
  }
  if (tf === '90') return { from: iso(addDays(TODAY, -90)), to: iso(TODAY) };
  return { from: '0000-01-01', to: '9999-12-31' };
}
function metricsSnapshot() {
  const r = tfRange();
  const per = SM.memberMetrics({ members, plan, einsaetze, blocks, today: TODAY, perShift: settings.perShift, from: r.from, to: r.to });
  const group = SM.groupFairness(per);
  const kpi = SM.dashboardKPIs(per, group);
  const scores = SM.solverScores(per, { weights: { f: settings.wF, r: settings.wR, s: settings.wS, k: settings.wK, t: settings.wT } });
  const scoreById = new Map(scores.map(s => [s.id, s]));
  return { per, group, kpi, scoreById };
}
function renderBars() {
  const { per, group, kpi, scoreById } = metricsSnapshot();
  // --- KPI-Karten ---
  const vkColor = kpi.vkOk ? 'var(--green)' : kpi.vk < 30 ? 'var(--orange)' : 'var(--red)';
  $('#summary').innerHTML =
    statCard('calendar-check', 'var(--green)', 'Bereitschafts-Fairness', kpi.readinessFairness, null, '%')
    + statCard('siren', 'var(--pink)', 'Einsatz-Fairness', kpi.alarmFairness, null, '%')
    + statCard('scale', 'var(--lav)', 'Gesamtbelastung', kpi.combined, null, '%')
    + statCard('sigma', vkColor, `VK ${kpi.vkOk ? 'im Ziel' : 'zu hoch'}`, kpi.vk, null, '%');
  // --- Balken je nach Metrik-Ansicht ---
  const valOf = p => metricView === 'alarm' ? p.alarms : p.duties;
  // ALLE Mitglieder – auch ohne Dienste (0-Werte); sie werden ganz unten sortiert und sind zuerst einzuteilen
  const alleMembers = members.map(x => per.find(pp => pp.id === x.id)).filter(Boolean);
  const active = alleMembers;
  const vals = active.map(valOf);
  const avgL = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  $('#bars').innerHTML = active.length ? [...active].sort((a, b) => valOf(a) - valOf(b)).map(p => {
    const x = m(p.id);
    const idx = avgL ? Math.round(valOf(p) / avgL * 100) : 0;
    const color = idx >= 130 ? 'var(--red)' : idx >= 105 ? 'var(--orange)' : 'var(--green)';
    const sc = scoreById.get(p.id);
    const devTxt = group.perMember[p.id] ? `D=${group.perMember[p.id].D > 0 ? '+' : ''}${group.perMember[p.id].D}` : '';
    const sub = metricView === 'fair' && sc ? ` · P=${sc.P}` : '';
    return `<div class="bar-row" data-profile="${p.id}" role="button" tabindex="0" aria-label="Profil ${esc(x.first)} öffnen"><div class="top-line"><span class="n">${av(x)}${esc(fullName(x))}<small>${esc(x.cls || '')}${x.ausb ? ' · AUSB' : ''}${x.quali === 'ausbildung' ? ' · AZUBI' : ''}${x.springer ? ' · SPR' : ''}${valOf(p) === 0 ? ' · NOCH OHNE DIENST' : ''}</small></span><span class="idx"><b>${idx}%</b> · ${valOf(p)}${sub}<small>${devTxt}</small></span></div>
      <div class="track" role="progressbar" aria-label="Belastungsindex ${esc(x.first)}" aria-valuenow="${idx}" aria-valuemin="0" aria-valuemax="200"><div class="fill" style="width:${Math.min(idx / 2, 100)}%;background:${color}"></div><span class="avgmark"></span></div></div>`;
  }).join('') + `<div class="bars-legend"><span>0%</span><span>Ø 100%</span><span>200%</span></div>`
    : '<p class="muted">Noch keine Dienste erfasst.</p>';
  $$('#bars [data-profile]').forEach(el => el.onclick = () => openMemberProfile(+el.dataset.profile));
  // --- Schicht-nachtragen-Dropdowns (bestehende Logik) ---
  const sel = $('#shiftPerson'), cur = sel.value;
  sel.innerHTML = members.map(x => `<option value="${x.id}">${esc(fullName(x))} (${esc(x.cls)})</option>`).join('');
  if (cur && m(+cur)) sel.value = cur;
  const tSel = $('#shiftTeam'), tCur = tSel.value;
  const tl = teamsList();
  tSel.innerHTML = tl.length ? tl.map(t => `<option value="${t.id}">Team ${t.id} · ${t.ids.slice(0, 3).map(id => m(id)?.first || '?').join(', ')}${t.ids.length > 3 ? ` +${t.ids.length - 3}` : ''}</option>`).join('') : '<option value="">Noch keine Teams</option>';
  if (tCur && tl.some(t => t.id === +tCur)) tSel.value = tCur;
  if (!$('#shiftDate').value) $('#shiftDate').value = iso(addDays(TODAY, -1));
  icons();
}
$$('[data-tf]').forEach(b => b.onclick = () => { tf = b.dataset.tf; $$('[data-tf]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderBars(); });
$$('[data-mv]').forEach(b => b.onclick = () => { metricView = b.dataset.mv; $$('[data-mv]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderBars(); });

/* ---------- Mitglieder-Profil: GitHub-Heatmap + Verlauf + Zeugnis ---------- */
function openMemberProfile(id) {
  const x = m(id); if (!x) return;
  const { per } = metricsSnapshot();
  const p = per.find(q => q.id === id) || {};
  const from = iso(addDays(TODAY, -365)), to = iso(TODAY);
  const heat = SM.heatmap(id, plan, einsaetze, blocks, members, from, to, TODAY);
  // GitHub-Raster: 52 Wochen × 7 Tage (Spalten = Wochen)
  const weeks = [];
  let d = addDays(TODAY, -364);
  // auf Montag ausrichten
  while (d.getDay() !== 1) d = addDays(d, -1);
  for (let wI = 0; wI < 53; wI++) {
    const col = [];
    for (let dI = 0; dI < 7; dI++) {
      const cd = addDays(d, wI * 7 + dI);
      const k = iso(cd);
      col.push(k <= iso(TODAY) ? { k, ...(heat.get(k) || { cls: 'empty', label: 'Kein Dienst' }) } : null);
    }
    weeks.push(col);
  }
  const CELL = { empty: 'hm-empty', quiet: 'hm-quiet', alarm: 'hm-alarm', extra: 'hm-extra', exam: 'hm-exam', absent: 'hm-absent' };
  const grid = weeks.map(col => `<div class="hm-col">${col.map(c => c
    ? `<span class="hm-cell ${CELL[c.cls]}" title="${c.k} – ${esc(c.label)}" data-hmd="${c.k}"></span>` : '<span class="hm-cell hm-future"></span>').join('')}</div>`).join('');
  const legend = `<div class="hm-legend"><span><i class="hm-cell hm-empty"></i>frei</span><span><i class="hm-cell hm-quiet"></i>Bereitschaft (kein Alarm)</span><span><i class="hm-cell hm-alarm"></i>Alarm/Springer-Einsatz</span><span><i class="hm-cell hm-extra"></i>Springer-Dienst</span><span><i class="hm-cell hm-exam"></i>Klausur/verhindert</span><span><i class="hm-cell hm-absent"></i>verpasst/offen</span></div>`;
  // Verlaufsliste
  const hist = [];
  Object.entries(plan).sort((a, b) => b[0] < a[0] ? -1 : 1).forEach(([k, e]) => {
    if (!(e.team || []).includes(id) && !(e.extra || []).includes(id)) return;
    const ev = einsaetze.find(v => v.d === k);
    hist.push({ k, e, ev });
  });
  const histHtml = hist.length ? hist.map(({ k, e, ev }) => {
    const d = parse(k);
    const extra = (e.extra || []).includes(id) && !(e.team || []).includes(id);
    const kind = ev ? 'Alarm: ' + esc(ev.type || '') : extra ? 'Springer-Dienst' : 'Bereitschaft';
    return `<div class="hist-row"><span class="dd"><b>${d.getDate()}</b><small>${MON3[d.getMonth()]}</small></span><div class="t"><span>${kind} · ${esc(e.note || '')}</span><small>${WDL[d.getDay()]}, ${d.getFullYear()}</small></div>${ev ? '<span class="badge">IST ' + (ev.ist ?? '?') + '</span>' : ''}</div>`;
  }).join('') : '<p class="muted">Noch keine Schichten im Plan.</p>';
  // AG-Strichliste
  const agCount = Object.values(agAttendance).filter(ids => ids.includes(id)).length;
  const agList = Object.keys(agAttendance).sort().reverse().slice(0, 8).map(k => {
    const on = agAttendance[k].includes(id);
    const d = parse(k);
    return `<label class="c-box"><input type="checkbox" data-ag="${k}" ${on ? 'checked' : ''}><span>${fmtS(d)}</span></label>`;
  }).join('') || '<p class="muted-s">Noch keine AG-Treffen erfasst.</p>';
  const qualiBadge = { ausb: '<span class="badge">AUSB</span>', ausbildung: '<span class="badge warn">In Ausbildung</span>', helfer: '<span class="badge spr">Helfer</span>' }[x.quali || (x.ausb ? 'ausb' : 'helfer')] || '';
  openModal(`<div class="p-head">${av(x)}<div><h3 id="mTitle">${esc(fullName(x))} ${qualiBadge}${x.springer ? '<span class="badge spr">Springer</span>' : ''}</h3>
      <p class="muted-s">Klasse ${esc(x.cls)} · ${x.team != null ? 'Team ' + x.team : 'ohne Team'}${x.ausbildungsDatum ? ' · AUSB seit ' + fmtS(parse(x.ausbildungsDatum)) : ''}${x.kontakt ? ' · ' + esc(x.kontakt) : ''}</p></div></div>
    <div class="kpi-grid">
      <div><b>${p.duties ?? 0}</b><span>Dienste</span></div>
      <div><b>${p.alarms ?? 0}</b><span>Alarms</span></div>
      <div><b>${p.Q == null ? '–' : p.Q + '%'}</b><span>Q<sub>i</sub> Alarmquote</span></div>
      <div><b>${p.S == null ? '–' : p.S}</b><span>S<sub>i</sub> Dienstquote</span></div>
      <div><b>${p.daysSinceLast == null ? '–' : p.daysSinceLast}</b><span>Tage seit Dienst</span></div>
      <div><b>${agCount}</b><span>AG-Treffen</span></div>
    </div>
    <div class="sub-h">Aktivität (12 Monate)</div>
    <div class="heatmap" role="img" aria-label="Aktivitäts-Heatmap">${grid}</div>${legend}
    <div class="sub-h">Verlauf</div>
    <div class="hist">${histHtml}</div>
    <div class="sub-h">AG-Anwesenheit (Strichliste)</div>
    <div class="ag-box"><div class="ag-days">${agList}</div>
      <div class="form-row" style="margin-top:8px">
        <button class="btn ghost" id="agTodayBtn"><i data-lucide="calendar-plus"></i>Heute als AG-Treff erfassen</button>
        <button class="btn primary" id="certBtn"><i data-lucide="file-badge"></i>Zeugnis-Bescheinigung (PDF)</button>
      </div>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-close>Schließen</button></div>`, { wide: true });
  $$('[data-ag]').forEach(cb => cb.onchange = () => {
    const k = cb.dataset.ag; agAttendance[k] = agAttendance[k] || [];
    if (cb.checked) { if (!agAttendance[k].includes(id)) agAttendance[k].push(id); }
    else agAttendance[k] = agAttendance[k].filter(v => v !== id);
    save();
  });
  $('#agTodayBtn').onclick = () => {
    const k = iso(TODAY);
    agAttendance[k] = agAttendance[k] || [];
    if (!agAttendance[k].includes(id)) agAttendance[k].push(id);
    save(); toast('AG-Treffen erfasst'); openMemberProfile(id);
  };
  $('#certBtn').onclick = () => generateCertificate(x, p, agCount);
  icons();
}
function generateCertificate(x, p, agCount) {
  if (!window.jspdf) { toast('PDF-Bibliothek nicht geladen', true); return; }
  const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const schoolYear = TODAY.getMonth() >= 7 ? `${TODAY.getFullYear()}/${TODAY.getFullYear() + 1}` : `${TODAY.getFullYear() - 1}/${TODAY.getFullYear()}`;
  doc.setFillColor(39, 39, 39); doc.rect(0, 0, 297, 34, 'F');
  doc.setTextColor(200, 168, 246); doc.setFontSize(11); doc.text('SaniAlarm · Schulsanitätsdienst', 20, 15);
  doc.setTextColor(255); doc.setFontSize(20); doc.text('Tätigkeitsbescheinigung', 20, 26);
  doc.setTextColor(21); doc.setFontSize(13); doc.text(`${x.first} ${x.last}` + (x.cls ? ` (Klasse ${x.cls})` : ''), 20, 52);
  doc.setFontSize(11);
  const line1 = `Hat im Schuljahr ${schoolYear} aktiv im Schulsanitätsdienst mitgewirkt`;
  const line2 = `(${p.duties || 0} Schichten, ${p.alarms || 0} Notfalleinsätze, ${agCount} AG-Treffen).`;
  doc.text(line1, 20, 66); doc.text(line2, 20, 74);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Ausgestellt am ${TODAY.toLocaleDateString('de-DE')} · SaniAlarm Schichtplaner`, 20, 180);
  doc.save(`Bescheinigung-${x.first}-${x.last}.pdf`);
  toast('Bescheinigung erstellt');
}

/* ---------- Schicht nachtragen: Person / Team (+ Abweichung) ---------- */
let shiftMode = 'person', shiftDeviation = false, shiftExtras = [];
$$('[data-smode]').forEach(b => b.onclick = () => {
  shiftMode = b.dataset.smode;
  $$('[data-smode]').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#shiftPersonRow').hidden = shiftMode !== 'person';
  $('#shiftTeamRow').hidden = shiftMode !== 'team';
  $('#shiftExtraBox').hidden = shiftMode !== 'team';
  if (shiftMode !== 'team') { shiftDeviation = false; shiftExtras = []; $('#shiftDeviation').checked = false; $('#shiftExtraPicker').hidden = true; }
  renderShiftExtraPicker();
});
$('#shiftDeviation').onchange = e => {
  shiftDeviation = e.target.checked;
  $('#shiftExtraPicker').hidden = !shiftDeviation;
  renderShiftExtraPicker();
};
function shiftExtraCandidates(teamEntry) {
  const teamIds = new Set(teamEntry ? teamEntry.ids : []);
  return members
    .filter(x => !teamIds.has(x.id) && x.available)
    .sort((a, b) => (b.springer - a.springer) || (b.ausb - a.ausb) || (a.total - b.total))
    .slice(0, 40);
}
function renderShiftExtraPicker() {
  const box = $('#shiftExtraPicker');
  if (!box || shiftMode !== 'team' || !shiftDeviation) { if (box) box.hidden = true; return; }
  const teamId = +$('#shiftTeam').value;
  const t = teamsList().find(x => x.id === teamId);
  const cands = shiftExtraCandidates(t);
  box.hidden = false;
  box.innerHTML = cands.length ? cands.map(x => {
    const on = shiftExtras.includes(x.id);
    return `<button type="button" data-shiftx="${x.id}" aria-pressed="${on}">${av(x)}${esc(fullName(x))}<span class="cls">${esc(x.cls)}${x.ausb ? ' · AUSB' : ''}${x.springer ? ' · SPR' : ''}</span><span class="check ${on ? 'yes' : ''}" style="width:24px;height:24px;margin-left:6px">${on ? '<i data-lucide="check"></i>' : ''}</span></button>`;
  }).join('') : '<div class="muted" style="padding:10px">Keine verfügbaren Personen.</div>';
  $$('#shiftExtraPicker [data-shiftx]').forEach(b => b.onclick = () => {
    const id = +b.dataset.shiftx;
    shiftExtras = shiftExtras.includes(id) ? shiftExtras.filter(v => v !== id) : [...shiftExtras, id];
    b.setAttribute('aria-pressed', shiftExtras.includes(id));
    b.querySelector('.check')?.classList.toggle('yes', shiftExtras.includes(id));
    icons();
  });
  icons();
}
function creditShift(ids, d, isTeam = false, teamId = null) {
  const k = iso(d);
  
  // 1. Planeintrag für diesen Tag erstellen/aktualisieren, damit die Statistik ihn erkennt
  if (!plan[k]) {
    plan[k] = {
      team: [...ids],
      mark: k >= iso(TODAY), // zukünftige manuelle Einträge vor Plan-Neugenerierung schützen
      teamId: isTeam ? teamId : null,
      extra: [],
      status: 'ok',
      tag: 'OK',
      rules: [],
      note: 'Nachträglich eingetragene Schicht'
    };
  } else {
    // Vorhandenen Plan anreichern, falls Personen fehlen
    ids.forEach(id => {
      if (!plan[k].team.includes(id) && !(plan[k].extra || []).includes(id)) {
        plan[k].team.push(id);
      }
    });
    // Händischer Nachtrag schützt den Tag immer vor Überschreibung – auch wenn der
    // Tag vorher vom Algorithmus gesetzt wurde (händisch > Algorithmus).
    if (k >= iso(TODAY)) plan[k].mark = true;
  }

  // 2. Zähler der Personen erhöhen
  ids.forEach(id => {
    const x = m(id); if (!x) return;
    x.total++; 
    if (d.getFullYear() === TODAY.getFullYear()) x.year++;
    if (d.getMonth() === TODAY.getMonth() && d.getFullYear() === TODAY.getFullYear()) x.month++;
  });
}

$('#addShift').onsubmit = e => {
  e.preventDefault();
  const d = parse($('#shiftDate').value); if (isNaN(d)) { toast('Bitte ein Datum wählen', true); return; }
  
  if (shiftMode === 'person') {
    const x = m(+$('#shiftPerson').value); if (!x) { toast('Keine Person gewählt', true); return; }
    creditShift([x.id], d, false, null);
    save(); renderAll(); toast(`Schicht für ${x.first} nachgetragen`);
    return;
  }
  
  // Team-Modus
  const teamId = +$('#shiftTeam').value;
  const t = teamsList().find(x => x.id === teamId);
  if (!t) { toast('Kein Team gewählt', true); return; }
  
  let allIds = [...t.ids];
  let note = `Schicht für Team ${t.id} nachgetragen`;
  
  if (shiftDeviation && shiftExtras.length) {
    const valid = shiftExtras.filter(id => m(id) && !t.ids.includes(id));
    if (valid.length) {
      allIds.push(...valid);
      note += ` (+${valid.length} zusätzliche Person/en)`;
    }
  }
  
  creditShift(allIds, d, true, teamId);
  save(); 
  renderAll(); 
  shiftExtras = []; 
  $('#shiftDeviation').checked = false; 
  $('#shiftExtraPicker').hidden = true; 
  shiftDeviation = false;
  toast(note);
};
$('#addShift').onsubmit = e => {
  e.preventDefault();
  const d = parse($('#shiftDate').value); if (isNaN(d)) { toast('Bitte ein Datum wählen', true); return; }
  if (shiftMode === 'person') {
    const x = m(+$('#shiftPerson').value); if (!x) { toast('Keine Person gewählt', true); return; }
    creditShift([x.id], d);
    save(); renderAll(); toast(`Schicht für ${x.first} nachgetragen`);
    return;
  }
  // Team-Modus
  const teamId = +$('#shiftTeam').value;
  const t = teamsList().find(x => x.id === teamId);
  if (!t) { toast('Kein Team gewählt', true); return; }
  creditShift(t.ids, d);
  let note = `Schicht für Team ${t.id} nachgetragen`;
  if (shiftDeviation && shiftExtras.length) {
    const valid = shiftExtras.filter(id => m(id) && !t.ids.includes(id));
    if (valid.length) { creditShift(valid, d); note += ` (+${valid.length} zusätzliche Person/en)`; }
  }
  save(); renderAll(); shiftExtras = []; $('#shiftDeviation').checked = false; $('#shiftExtraPicker').hidden = true; shiftDeviation = false;
  toast(note);
};
function renderExams() {
  const lim = iso(addDays(TODAY, 62)), list = blocks.filter(b => b.to >= iso(TODAY) && b.from <= lim).sort((a, b) => a.from < b.from ? -1 : 1);
  $('#exams').innerHTML = (list.map(b => { const d = parse(b.from), ids = affected(b.scope);
    return `<div class="exam"><div class="dd"><b>${d.getDate()}</b><span>${MON3[d.getMonth()]}</span></div>
      <div class="inf"><div>${esc(b.type)} · ${esc(b.title)} · ${esc(scopeLabel(b.scope))}</div><div>Betroffen: ${esc(ids.slice(0, 3).map(id => m(id).first).join(', '))}${ids.length > 3 ? ` +${ids.length - 3}` : ''}</div></div>
      <span class="status-pill ${ids.length > 2 ? 'bad' : 'warn'}">${ids.length}</span></div>`; }).join('') || '<p class="muted">Keine Sperrtage in den nächsten 2 Monaten.</p>')
    + `<button class="btn ghost wide" style="margin-top:10px" data-new-block=""><i data-lucide="plus"></i>Sperrtag eintragen</button>`;
}

/* ---------- Einstellungen & Daten ---------- */
const settingsRow = (k, t, s) => `<div class="set-row"><span>${t}<small>${s}</small></span><button class="switch" role="switch" aria-checked="${settings[k]}" data-set="${k}" aria-label="${t}"></button></div>`;
const dbInfo = () => `${members.length} Personen · ${teamsList().length} Teams · ${blocks.length} Sperrtage · ${Object.keys(plan).length} Plantage${lastSaved ? ` · gespeichert ${pad(lastSaved.getHours())}:${pad(lastSaved.getMinutes())}` : ''}`;
function renderSettings() {
  $('#rulesCard').innerHTML = `<div class="card-head"><h2>Regeln für den Plan-Generator</h2></div>
    <div class="set-row"><span>Sanis pro Dienst<small>Fehlende Plätze füllen Springer</small></span><div class="stepper"><button data-step="-1" aria-label="Weniger"><i data-lucide="minus"></i></button><b id="perShift">${settings.perShift}</b><button data-step="1" aria-label="Mehr"><i data-lucide="plus"></i></button></div></div>
    <div class="set-row"><span>Max. Personen pro Schicht<small>Hartes Limit inkl. Springer &amp; Auszubildende (empfohlen 3–4)</small></span><div class="stepper"><button data-maxstep="-1" aria-label="Weniger"><i data-lucide="minus"></i></button><b id="maxShift">${settings.maxShift || 4}</b><button data-maxstep="1" aria-label="Mehr"><i data-lucide="plus"></i></button></div></div>
    <div class="set-row"><span>Trainees pro erfahrenem Team<small>Azubis, die zur Ausbildung zugeteilt werden (0–2)</small></span><div class="stepper"><button data-trainstep="-1" aria-label="Weniger"><i data-lucide="minus"></i></button><b id="traineesPerShift">${settings.traineesPerShift ?? 2}</b><button data-trainstep="1" aria-label="Mehr"><i data-lucide="plus"></i></button></div></div>
    <div class="set-row lockrow"><span>Sperrtage, Verfügbarkeit &amp; AUSB-Pflicht<small>Immer hart – werden nie gelockert</small></span><i data-lucide="lock"></i></div>
    ${settingsRow('fair', 'Fairness-Ausgleich', 'Wenig belastete Teams zuerst')}
    ${settingsRow('weekday', 'Kein Wochentag doppelt', 'Pro Team und Monat (lockerbar)')}
    ${settingsRow('friMon', 'Kein Fr–Mo-Doppeldienst', 'Keine Back-to-Back-Dienste übers Wochenende (lockerbar)')}
    ${settingsRow('notify', 'Push bei Alarm', 'Benachrichtigung an eingeteilte Sanis')}
    <div class="set-row"><span>Ich bin<small>Für „Mein nächster Dienst“</small></span><div class="select"><label class="sr-only" for="meSel">Ich bin</label><select id="meSel"><option value="">–</option>${members.map(x => `<option value="${x.id}" ${x.id === settings.me ? 'selected' : ''}>${esc(fullName(x))}</option>`).join('')}</select><i data-lucide="chevron-down"></i></div></div>
    <div class="set-row"><span>AG-Treffen ist am<small>Für die Anwesenheits-Checkliste auf dem Dashboard</small></span><div class="select"><label class="sr-only" for="agDaySel">AG-Tag</label><select id="agDaySel">${[['','kein fester Tag'],['1','Montag'],['2','Dienstag'],['3','Mittwoch'],['4','Donnerstag'],['5','Freitag']].map(([v, l]) => `<option value="${v}" ${String(settings.agWeekday ?? 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select><i data-lucide="chevron-down"></i></div></div>
    <div class="algo"><b>So plant der Algorithmus:</b> Backtracking mit Branch-and-Bound. Pro Tag werden alle gültigen Teams (+Springer) geprüft; Sperrtage, Verfügbarkeit und AUSB-Pflicht schließen Optionen hart aus. Max. 1 Dienst pro Woche, kein doppelter Wochentag und kein Fr→Mo-Dienst sind weiche Regeln: Ist der Plan zu eng, werden sie mit Strafkosten gelockert und der Tag erhält ein <b>REG</b>-, <b>SPR</b>- oder <b>x/y</b>-Badge. Kann ein Tag gar nicht besetzt werden, erscheint er als Konflikt.</div>
    <div class="algo" style="margin-top:10px"><b>Ausbildungs-Rollen:</b> Ausgebildete ohne Team springen als <b>AUSB-Springer</b> zwischen Teams. Auszubildende (<b>Trainees</b>) werden mit niedrigen Kosten bevorzugt an erfahrene Teams mitgesetzt (Mentoring) – bis zu max. ${settings.maxShift || 4} Personen pro Schicht. Manuell nachgetragene zukünftige Schichten (Schicht nachtragen) bleiben beim Neu-Generieren erhalten.</div>
    <div class="algo" style="margin-top:10px"><b>Schulstruktur:</b> Zeiten der Schulstunden anpassen (gilt für Zeitraster & Stundenplan).</div>
    <div class="algo" id="schoolTimesEditor" style="margin-top:6px">
      <div><b>Normaler Schultag</b></div>
      ${settings.schoolDay.map((h, i) => `<div class="set-row"><span>${h.h}. Stunde</span><span style="display:flex;gap:6px;align-items:center"><input class="inp" type="time" data-sd="schoolDay" data-idx="${i}" data-field="von" value="${h.von}" style="max-width:110px"> – <input class="inp" type="time" data-sd="schoolDay" data-idx="${i}" data-field="bis" value="${h.bis}" style="max-width:110px"></span></div>`).join('')}
      <div style="margin-top:10px"><b>Kurzstunden-Tag</b></div>
      ${settings.schoolDayShort.map((h, i) => `<div class="set-row"><span>${h.h}. Stunde</span><span style="display:flex;gap:6px;align-items:center"><input class="inp" type="time" data-sd="schoolDayShort" data-idx="${i}" data-field="von" value="${h.von}" style="max-width:110px"> – <input class="inp" type="time" data-sd="schoolDayShort" data-idx="${i}" data-field="bis" value="${h.bis}" style="max-width:110px"></span></div>`).join('')}
      <div class="form-row" style="margin-top:10px">
        <button class="btn ghost small" id="sdReset"><i data-lucide="rotate-ccw"></i>Standardzeiten wiederherstellen</button>
      </div>
    </div>`;
  $('#dataCard').innerHTML = `<div class="card-head"><h2>Daten &amp; Backup (.sani)</h2></div>
    <div class="set-row"><span>Lokale Datenbank<small id="dbInfo">${dbInfo()}</small></span><span class="status-pill ok">Offline</span></div>
    <div class="export-grid">
      <button class="ex-btn" id="bkExport"><span class="ei"><i data-lucide="download"></i></span><span>Komplett-Backup<small>.saniteam exportieren</small></span></button>
      <button class="ex-btn" id="bkImport"><span class="ei"><i data-lucide="upload"></i></span><span>Importieren<small>.sani / .saniteam laden</small></span></button>
      <button class="ex-btn" id="bkExportPlan"><span class="ei"><i data-lucide="calendar"></i></span><span>Nur Dienstplan<small>.saniplan exportieren</small></span></button>
      <button class="ex-btn" id="bkExportLog"><span class="ei"><i data-lucide="clipboard-list"></i></span><span>Nur Einsätze<small>.sanilog exportieren</small></span></button>
      <button class="ex-btn" id="bkExportBlocks"><span class="ei"><i data-lucide="calendar-x"></i></span><span>Nur Sperrtage<small>.saniblocks exportieren</small></span></button>
      <button class="ex-btn" id="bkExportMembers"><span class="ei"><i data-lucide="users"></i></span><span>Nur Teams &amp; Sanis<small>.saniteam (Team-only)</small></span></button>
    </div>
    <input type="file" id="bkFile" accept=".saniteam,.saniplan,.sanilog,.saniblocks,.sani,application/json" hidden>
    <div class="form-row" style="margin-top:12px"><button class="btn ghost wide" id="bkReset"><i data-lucide="rotate-ccw"></i>Demo-Daten laden</button><button class="btn danger wide" id="bkEmpty"><i data-lucide="eraser"></i>Leere Datenbank</button></div>
    <p class="muted-s" style="margin-top:14px">Alle dynamischen Daten (Sanis, Teams, Dienstpläne, Sperrtage, Einsätze) können modular als <b>.saniteam</b>, <b>.saniplan</b>, <b>.sanilog</b> oder <b>.saniblocks</b> exportiert und jederzeit geräteübergreifend geladen werden. Der Import erkennt den Dateityp automatisch.</p>`;
  $('#bkExport').onclick = () => deliver(new Blob([JSON.stringify(snapshot('all'), null, 2)], { type: 'application/json' }), `SaniAlarm-Komplett-${iso(TODAY)}.saniteam`);
  $('#bkExportPlan').onclick = () => deliver(new Blob([JSON.stringify(snapshot('plan'), null, 2)], { type: 'application/json' }), `SaniPlan-${iso(TODAY)}.saniplan`);
  $('#bkExportLog').onclick = () => deliver(new Blob([JSON.stringify(snapshot('log'), null, 2)], { type: 'application/json' }), `SaniLog-${iso(TODAY)}.sanilog`);
  $('#bkExportBlocks').onclick = () => deliver(new Blob([JSON.stringify(snapshot('blocks'), null, 2)], { type: 'application/json' }), `SaniSperrtage-${iso(TODAY)}.saniblocks`);
  $('#bkExportMembers').onclick = () => deliver(new Blob([JSON.stringify(snapshot('team'), null, 2)], { type: 'application/json' }), `SaniTeam-${iso(TODAY)}.saniteam`);
  $('#bkImport').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      const res = restore(parsed);
      save(); loadLog(); renderAll();
      toast(`Import erfolgreich (${res.summary})`);
    }
    catch (err) { toast(err.message || 'Import fehlgeschlagen', true); }
    e.target.value = '';
  };
  $('#bkReset').onclick = () => confirmBox('Demo-Daten laden?', 'Alle aktuellen Daten werden durch Beispieldaten ersetzt. Exportiere vorher ein Backup, falls nötig.', 'Ersetzen', () => { seed(); openMemo = null; save(); loadLog(); renderAll(); toast('Demo-Daten wiederhergestellt'); });
  $('#bkEmpty').onclick = () => confirmBox('Leere Datenbank starten?', 'Alle Personen, Teams, Sperrtage, Pläne und Einsätze werden gelöscht.', 'Alles löschen', () => { emptyDb(); openMemo = null; save(); loadLog(); renderAll(); toast('Leere Datenbank angelegt'); });
  $$('[data-set]').forEach(b => b.onclick = () => { settings[b.dataset.set] = !settings[b.dataset.set]; b.setAttribute('aria-checked', settings[b.dataset.set]); save(); });
  $$('[data-step]').forEach(b => b.onclick = () => { settings.perShift = Math.min(3, Math.max(1, settings.perShift + +b.dataset.step)); $('#perShift').textContent = settings.perShift; save(); });
  $$('[data-maxstep]').forEach(b => b.onclick = () => {
    const old = settings.maxShift || 4;
    settings.maxShift = Math.min(6, Math.max(2, old + +b.dataset.maxstep));
    $('#maxShift').textContent = settings.maxShift; save();
    if (settings.maxShift !== old) {
      // Konkrete Folgen berechnen: Welche Teams/Azubi-Gruppen passen nicht mehr?
      const traineeGroups = {};
      members.filter(x => x.quali === 'ausbildung' && x.team != null).forEach(x => { (traineeGroups[x.team] ||= []).push(x); });
      const tooBig = Object.entries(traineeGroups).filter(([, g]) => g.length + 2 > settings.maxShift);
      const why = [
        `Max. Schichtgröße: ${old} → ${settings.maxShift} Personen (inkl. Springer & Azubis).`,
        tooBig.length
          ? `Betroffene Azubi-Gruppen, die jetzt nicht mehr komplett neben einem 2er-Team passen: ${tooBig.map(([tid, g]) => `Team ${tid} (${g.map(x => x.first).join(', ')})`).join('; ')}. Diese Gruppe(n) werden künftig getrennt oder einzeln zugeteilt.`
          : 'Aktuell sind keine Azubi-Gruppen betroffen – die Änderung wirkt nur auf künftige Zuteilungen.',
        'Händisch nachgetragene Tage bleiben immer erhalten.',
        '',
        '• "Jetzt neu generieren": der laufende Plan wird sofort neu berechnet (händische Tage bleiben unangetastet).',
        '• "Erst bei nächster Generierung": die Einstellung wird gespeichert und die bereits eingetragenen Tage bleiben unverändert.'
      ].join('\n');
      openModal(`<h3 id="mTitle">Dienstplan durch Größenänderung betroffen</h3>
        <p class="lead">Die maximale Schichtgröße wurde von ${old} auf ${settings.maxShift} Personen geändert. Der bestehende Plan kann dadurch anders strukturiert werden müssen.</p>
        <details class="confirm-details" open style="margin:10px 0;border:1px solid var(--border,#444);border-radius:8px;padding:8px 12px"><summary style="cursor:pointer;font-weight:600">Warum kommt diese Meldung?</summary><div style="margin-top:8px;font-size:.9em;color:var(--muted,#aaa);white-space:pre-line">${esc(why)}</div></details>
        <div class="modal-actions"><button class="btn ghost" id="maxShiftLater">Erst bei nächster Generierung</button><button class="btn primary" id="maxShiftNow">Jetzt neu generieren</button></div>`);
      $('#maxShiftLater').onclick = () => { closeModal(); toast('Neue maximale Schichtgröße wird bei der nächsten Generierung berücksichtigt'); };
      $('#maxShiftNow').onclick = () => { closeModal(); if (typeof window.regeneratePlan === 'function') window.regeneratePlan(); else toast('Bitte generiere den Plan manuell neu', true); };
    }
  });
  $$('[data-trainstep]').forEach(b => b.onclick = () => { settings.traineesPerShift = Math.min(2, Math.max(0, (settings.traineesPerShift ?? 2) + +b.dataset.trainstep)); $('#traineesPerShift').textContent = settings.traineesPerShift; save(); });
  const agSel = $('#agDaySel'); if (agSel) agSel.onchange = e => { settings.agWeekday = e.target.value === '' ? null : +e.target.value; save(); renderAgDayCard(); };
  // Schulzeiten-Editor: Zeiten ändern & speichern
  $$('[data-sd]').forEach(inp => inp.onchange = () => {
    const key = inp.dataset.sd, i = +inp.dataset.idx, f = inp.dataset.field;
    if (settings[key] && settings[key][i]) { settings[key][i][f] = inp.value; save(); }
  });
  const sdReset = $('#sdReset'); if (sdReset) sdReset.onclick = () => {
    settings.schoolDay = [{ h: 1, von: '07:55', bis: '08:40' }, { h: 2, von: '08:45', bis: '09:30' }, { h: 3, von: '09:50', bis: '10:35' }, { h: 4, von: '10:40', bis: '11:25' }, { h: 5, von: '11:40', bis: '12:25' }, { h: 6, von: '12:30', bis: '13:15' }, { h: 7, von: '13:30', bis: '14:15' }];
    settings.schoolDayShort = [{ h: 1, von: '07:55', bis: '08:35' }, { h: 2, von: '08:40', bis: '09:20' }, { h: 3, von: '09:25', bis: '10:05' }, { h: 4, von: '10:15', bis: '10:55' }, { h: 5, von: '11:00', bis: '11:40' }, { h: 6, von: '11:45', bis: '12:25' }];
    save(); renderSettings(); toast('Standardzeiten wiederhergestellt');
  };
  $('#meSel').onchange = e => { settings.me = e.target.value === '' ? null : +e.target.value; save(); renderHeader(); renderNext(); icons(); };
  icons();
}

function openPanicModal() {
  const em = morningEmergencyCheck(TODAY);
  if (!em) { toast('Heute kein regulärer Schultag', true); return; }

  const currentNames = em.entry.team.map(id => {
    const p = m(id);
    if (!p) return 'Unbekannt';
    const isSick = !p.available || blockedMap(TODAY).has(p.id);
    return `<span class="chip-person ${isSick ? 'hit' : ''}">${av(p)}${esc(p.first)} ${isSick ? '(abwesend)' : (p.ausb ? '<span class="badge">AUSB</span>' : '')}</span>`;
  }).join(' ');

  const standbysHTML = em.standbys.length ? em.standbys.slice(0, 10).map(s => {
    return `
      <div class="prow" style="border-bottom:1px solid var(--line);padding:8px 0">
        ${av(s)}
        <div class="t">
          <span><b>${esc(fullName(s))}</b> ${s.ausb ? '<span class="badge">AUSB</span>' : ''} ${s.springer ? '<span class="badge spr">SPR</span>' : ''}</span>
          <small>Klasse ${esc(s.cls)} · bisher ${s.total} Dienste</small>
        </div>
        <button class="btn small primary" data-sub-in="${s.id}"><i data-lucide="user-plus"></i>Einwechseln</button>
      </div>`;
  }).join('') : '<p class="muted" style="padding:10px 0">Keine weiteren verfügbaren Sanis gefunden!</p>';

  openModal(`<h3 id="mTitle" style="color:var(--red)"><i data-lucide="siren" style="vertical-align:-3px"></i> Morgen-Notfall &amp; Panik-Modus</h3>
    <p class="lead">Spontaner Ausfall am heutigen Schultag (${fmt(TODAY)}). Sanitäter können mit einem Klick durch anwesende Springer ersetzt werden.</p>
    
    <div style="background:#FFF0F2;border:1px solid #FFCCD3;border-radius:14px;padding:12px 14px;margin-bottom:14px">
      <div style="font-size:12px;color:var(--red);font-weight:600;text-transform:uppercase">Aktuell eingeteiltes Team</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">${currentNames}</div>
      <div style="margin-top:8px;font-size:13px;color:var(--ink)">
        Status: ${!em.hasAusb ? '<b style="color:var(--red)">AUSB-Mangel! Kein anwesender Sani ist ausgebildet.</b>' : '<b style="color:var(--green)">Mindestens eine ausgebildete Person vor Ort.</b>'}
        ${em.absentOrSick.length ? ` · ${em.absentOrSick.length} Person(en) ausgefallen.` : ''}
      </div>
    </div>

    <div class="sub-h">Verfügbare Standby-Springer an der Schule</div>
    <div class="list" id="panicStandbyList">${standbysHTML}</div>

    <div class="modal-actions" style="margin-top:16px">
      <button class="btn ghost" data-close>Schließen</button>
    </div>`);

  $$('[data-sub-in]').forEach(b => b.onclick = () => {
    const saniId = +b.dataset.subIn;
    const newTeam = [...em.entry.team];
    // Ersetze zuerst den ersten Abwesenden oder füge hinzu
    const sickIdx = newTeam.findIndex(id => !m(id).available || blockedMap(TODAY).has(id));
    if (sickIdx >= 0) {
      newTeam[sickIdx] = saniId;
    } else {
      newTeam.push(saniId);
    }
    const extraList = [...(em.entry.extra || [])];
    if (!extraList.includes(saniId)) extraList.push(saniId);
    em.entry.team = newTeam;
    em.entry.extra = extraList;
    em.entry.status = 'warn';
    em.entry.tag = 'SPR';
    em.entry.note = `Notfall-Wechsel: ${m(saniId)?.first} eingewechselt`;
    save();
    renderAll();
    closeModal();
    toast(`${m(saniId)?.first} erfolgreich eingewechselt!`);
  });
  icons();
}

function openQrInviteModal() {
  const secretKey = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
  const invitePayload = {
    app: 'SaniAlarm',
    typ: 'einladung',
    version: 1,
    school: 'Schulsanitätsdienst',
    key: secretKey,
    createdAt: new Date().toISOString()
  };
  const jsonStr = JSON.stringify(invitePayload);
  const base64Str = btoa(unescape(encodeURIComponent(jsonStr)));
  const inviteCode = `sani-alarm-beitritt:${base64Str}`;
  // Ausbilder-Teams (erfahrene Teams) als Komma-Liste an die Beitritts-Website übergeben –
  // dort können Azubis dort abwählen, welche Teams sie NICHT möchten.
  const ausbTeams = teamsList().filter(t => teamHasAusb(t.ids));
  const ausbTeamIds = ausbTeams.map(t => t.id);
  // Der QR-Link transportiert ausschließlich die kompakten Team-IDs. Teamnamen
  // werden bewusst nicht in den QR-Payload geschrieben, damit er klein und scannbar bleibt.
  const teamsParam = ausbTeamIds.length ? `&teams=${ausbTeamIds.join(',')}` : '';
  const webJoinUrl = `https://sani-alarm-planer.netlify.app/?beitritt=1#key=${secretKey}${teamsParam}`;

  openModal(`<h3 id="mTitle"><i data-lucide="qr-code" style="vertical-align:-3px"></i> Neuer Sani: Beitritt &amp; Einladung</h3>
    <p class="lead">Schüler können den echten QR-Code scannen, den Link öffnen oder ihren Anmeldecode direkt an dich übermitteln.</p>
    
    <div class="qr-box">
      <div class="qr-frame" id="qrContainer" style="min-width:200px;min-height:200px;display:flex;align-items:center;justify-content:center">
        <div id="qrElement"></div>
      </div>
      <small class="muted-s" style="max-width:400px">Echter scannbarer QR-Code für Smartphones &amp; Kameras (öffnet das Beitrittsformular).</small>
    </div>

    <div class="set-line">
      <span>Beitritts-Link für Schüler<small>Per Messenger / Schul-Chat / E-Mail verschicken</small></span>
      <button class="btn small ghost" id="copyLinkBtn"><i data-lucide="link"></i>Link kopieren</button>
    </div>

    <div class="set-line" style="margin-top:6px">
      <span>Oder Einladungs-Token kopieren<small>Für SaniAlarm-Apps</small></span>
      <button class="btn small ghost" id="copyTokenBtn"><i data-lucide="copy"></i>Token kopieren</button>
    </div>

    <div class="sub-h" style="margin-top:16px">Schüler-Rückmeldung einlösen (Text oder Token)</div>
    <p class="muted-s" style="margin-bottom:8px">Da Laptops meist keine Rück-Kamera haben: Schüler kopieren den generierten Antwortcode auf ihrer Beitrittsseite (oder schicken ihn dir) und du fügst ihn hier ein:</p>
    <div style="display:flex;gap:8px">
      <input class="inp" id="pasteStudentToken" placeholder="sani-alarm-beitritt:... oder JSON mit Kontaktdaten" autocomplete="off">
      <button class="btn primary" id="importStudentBtn" style="flex-shrink:0"><i data-lucide="user-check"></i>In Kartei übernehmen</button>
    </div>

    <div class="modal-actions" style="margin-top:18px">
      <button class="btn primary" data-close>Schließen</button>
    </div>`, { wide: true });

  // Echten QR-Code erzeugen (qrcodejs)
  drawQrCode($('#qrElement'), webJoinUrl);

  $('#copyLinkBtn').onclick = () => {
    navigator.clipboard?.writeText(webJoinUrl).then(() => toast('Beitritts-Link kopiert'))
      .catch(() => toast('Link konnte nicht kopiert werden', true));
  };

  $('#copyTokenBtn').onclick = () => {
    navigator.clipboard?.writeText(inviteCode).then(() => toast('Einladungs-Token kopiert'))
      .catch(() => toast('Token im Feld markieren & kopieren'));
  };

  $('#importStudentBtn').onclick = async () => {
    const raw = $('#pasteStudentToken')?.value.trim();
    if (!raw) { toast('Bitte Beitrittscode oder Daten einfügen', true); return; }
    try {
      let decoded = null;
      if (raw.startsWith('sani-alarm-beitritt-v2:')) {
        decoded = await decryptBeitrittV2(raw, secretKey);
      }
      if (!decoded) {
        decoded = decodeBeitritt(raw, secretKey);
      }
      const first = decoded?.vorname || decoded?.first;
      if (!first) throw new Error('Kein Vorname enthalten');
      // Klasse zusammensetzen: Bei Stufe 11-13/Q1-Q4 ohne Buchstabe nur die Stufe übernehmen
      const stufeRaw = String(decoded.stufe || '').trim();
      const klasseRaw = String(decoded.klasse || '').trim();
      const isOberstufe = /^(q[1-4]|1[123])$/i.test(stufeRaw);
      const cls = isOberstufe ? stufeRaw.toLowerCase()
        : `${stufeRaw}-${klasseRaw}`.toLowerCase() || '10-1';
      const qualiRaw = decoded.ausbildungsStatus || (decoded.ausb ? 'ausb' : 'helfer');
      const added = upsertMember({
        first,
        last: decoded.nachname || decoded.last || '-',
        cls,
        ausb: qualiRaw === 'ausb' || !!(decoded.ausb ?? false),
        springer: true,
        available: true,
        quali: qualiRaw,
        kontakt: decoded.kontakt || '',
        ausbilderTeams: Array.isArray(decoded.ausbilderTeams) ? decoded.ausbilderTeams : [],
        ausbilderTeamLabels: Array.isArray(decoded.ausbilderTeamLabels) ? decoded.ausbilderTeamLabels : [],
        ausbilderTeamPrefs: Array.isArray(decoded.ausbilderTeamPrefs) ? decoded.ausbilderTeamPrefs : [],
        ausbilderTeamsSpecified: decoded.ausbilderTeamsSpecified ?? (Array.isArray(decoded.ausbilderTeams) && decoded.ausbilderTeams.length > 0)
      });
      save();
      renderAll();
      closeModal();
      toast(`Sani ${added.first} ${added.last !== '-' ? added.last : ''} hinzugefügt!`);
    } catch (err) {
      toast('Ungültiger oder fehlerhafter Beitritts-Code', true);
    }
  };
  icons();
}

async function decryptBeitrittV2(encoded, secret) {
  if (!encoded || !encoded.startsWith('sani-alarm-beitritt-v2:')) return null;
  const parts = encoded.slice('sani-alarm-beitritt-v2:'.length).split('.');
  if (parts.length !== 2) return null;
  // Schlüssel wird unabhängig vom Format (Hex/Base64/Text) per SHA-256 auf 32 Byte normiert
  const material = new TextEncoder().encode(String(secret ?? '').trim());
  if (!material.length) return null;
  const digest = await crypto.subtle.digest('SHA-256', material);
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
  const nonce = base64UrlToBytes(parts[0]);
  const cipherText = base64UrlToBytes(parts[1]);
  if (nonce.length !== 12 || cipherText.length < 16) return null;
  const plainText = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipherText);
  return JSON.parse(new TextDecoder().decode(plainText));
}

function decodeBeitritt(raw) {
  const clean = raw.trim();
  // V1 Antwort: Klartext Base64
  if (clean.startsWith('sani-alarm-beitritt:')) {
    const b64 = clean.replace('sani-alarm-beitritt:', '');
    const json = decodeURIComponent(escape(atob(b64.replaceAll('-', '+').replaceAll('_', '/'))));
    return JSON.parse(json);
  }
  return JSON.parse(clean);
}

function base64UrlToBytes(str) {
  const b64 = str.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function drawQrCode(container, text) {
  if (!container) return;
  container.innerHTML = '';
  if (typeof window.QRCode === 'function') {
    try {
      new window.QRCode(container, {
        text: text,
        width: 190,
        height: 190,
        colorDark: '#151515',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      return;
    } catch (e) { /* Fallback unten */ }
  }
  // Robuster Fallback über HTML-Canvas
  const cv = document.createElement('canvas');
  cv.width = 190;
  cv.height = 190;
  container.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 190, 190);
  ctx.fillStyle = '#000';
  ctx.font = '12px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('QR-Code Modul lädt...', 95, 95);
}

/* ---------- Globale Delegation ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-del-day],[data-del-block],[data-new-block],[data-new-block-person],[data-open],[data-toggle],[data-del-member],[data-dissolve],[data-sort],#addMember,#memQrInvite,#panicBtn');
  if (!t) return;
  if (t.id === 'addMember') { openMember(null); return; }
  if (t.id === 'memQrInvite') { openQrInviteModal(); return; }
  if (t.id === 'panicBtn') { openPanicModal(); return; }
  if (t.dataset.delDay) {
    const dayKey = t.dataset.delDay;
    if (!plan[dayKey]) return;
    confirmBox('Tag aus dem Kalender entfernen?', `Der Planeintrag für ${dayKey} wird vollständig entfernt. Die beteiligten Personen werden dadurch wieder als verfügbar für die Planung gewertet.`, 'Tag entfernen', () => {
      delete plan[dayKey]; save(); renderAll(); toast(`Planeintrag für ${dayKey} entfernt`);
    });
  } else if (t.dataset.delBlock) {
    const b = blocks.find(x => x.id === +t.dataset.delBlock); if (!b) return;
    blocks = blocks.filter(x => x !== b); save(); renderAll(); modalRefresh?.(); toast(`Sperrtag „${b.title}“ gelöscht`);
  } else if (t.hasAttribute('data-new-block')) openBlockModal({ date: t.dataset.newBlock || undefined });
  else if (t.dataset.newBlockPerson) openBlockModal({ personId: +t.dataset.newBlockPerson });
  else if (t.dataset.open) openMember(+t.dataset.open);
  else if (t.dataset.toggle) { const x = m(+t.dataset.toggle); x.available = !x.available; save(); renderAll(); toast(`${x.first} ist jetzt ${x.available ? 'verfügbar' : 'als abwesend markiert'}`); }
  else if (t.dataset.delMember) askDelete(+t.dataset.delMember);
  else if (t.dataset.dissolve) { const id = +t.dataset.dissolve; dissolveTeam(id); save(); renderAll(); toast(`Team ${id} aufgelöst`); }
  else if (t.dataset.sort) { const k = t.dataset.sort; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; } renderMembers(); }
});

$('#panicBtn').onclick = openPanicModal;
$('#memQrInvite').onclick = openQrInviteModal;
$('#addMember').onclick = () => openMember(null);

/* ---------- Start ---------- */
function renderAll() { renderDashboard(); renderMembers(); renderBars(); renderExams(); renderLog(); renderSettings(); icons(); }
boot(); loadLog(); renderAll(); save(); renderHeader(); go((location.hash || '').slice(1) || 'home');

/* ---------- AG-Tages-Checkliste (nur am eingestellten AG-Tag sichtbar) ---------- */
function renderAgDayCard() {
  let host = $('#agDayCard');
  if (!host) {
    host = document.createElement('div');
    host.id = 'agDayCard';
    host.className = 'card';
    const anchor = $('#panicBanner'); // nach der Panic-Banner einfügen
    if (anchor && anchor.parentNode) anchor.after(host);
    else return;
  }
  const wd = settings.agWeekday;
  if (wd == null || TODAY.getDay() !== wd) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  const k = iso(TODAY);
  const att = agAttendance[k] || [];
  const WDlbl = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][wd];
  host.innerHTML = `<div class="card-head"><h2><i data-lucide="clipboard-check" style="vertical-align:-3px"></i> AG-Treffen heute (${WDlbl})</h2>
    <span class="muted-s">${att.length}/${members.length} anwesend</span></div>
    <p class="muted-s" style="margin:4px 0 10px">Wer ist beim AG-Treff? Ein Tipp pro Person reicht – alles wird in der Strichliste gespeichert.</p>
    <div class="ag-checkgrid">${members.map(x => {
      const on = att.includes(x.id);
      return `<label class="c-box"><input type="checkbox" data-agday="${x.id}" ${on ? 'checked' : ''}><span>${av(x)}${esc(fullName(x))}${x.ausb ? '<span class="badge">AUSB</span>' : ''}${x.quali === 'ausbildung' ? '<span class="badge warn">AZUBI</span>' : ''}</span></label>`;
    }).join('') || '<p class="muted">Noch keine Mitglieder angelegt.</p>'}</div>
    <div class="modal-actions" style="margin-top:10px">
      <button class="btn ghost small" id="agAllBtn"><i data-lucide="check-check"></i>Alle anwesend</button>
      <button class="btn ghost small" id="agClearBtn"><i data-lucide="eraser"></i>Zurücksetzen</button>
    </div>`;
  $$('[data-agday]').forEach(cb => cb.onchange = () => {
    agAttendance[k] = agAttendance[k] || [];
    const id = +cb.dataset.agday;
    if (cb.checked) { if (!agAttendance[k].includes(id)) agAttendance[k].push(id); }
    else agAttendance[k] = agAttendance[k].filter(v => v !== id);
    save(); icons();
  });
  $('#agAllBtn').onclick = () => { agAttendance[k] = members.map(x => x.id); save(); renderAgDayCard(); };
  $('#agClearBtn').onclick = () => { delete agAttendance[k]; save(); renderAgDayCard(); };
  icons();
}

/* ---------- Notfall-Rangliste: Wer kann kurzfristig einspringen? ---------- */
function replacementRanking(absentIds, day = TODAY) {
  const bm = blockedMap(day);
  const candidates = members.filter(x =>
    x.available && !bm.has(x.id) && !absentIds.includes(x.id) &&
    (x.springer || x.team == null || !(day && false)));
  // Scoring nach den bekannten Richtlinien: wenig Last, lange her letzter Dienst, AUSB bevorzugt
  const scored = candidates.map(x => {
    const sc = window.SaniMetrics
      ? window.SaniMetrics.solverScores([{ id: x.id, L: x.total, daysSinceLast: 0, examPressure: 0, springerShifts: 0, T: 1 }])[0]
      : null;
    const priority = (x.springer ? 0 : 1) + (x.team == null ? 0 : 0.5) + (x.total / 100);
    return { x, priority: sc ? sc.P : priority, ausb: x.ausb };
  });
  return scored.sort((a, b) => (b.x.ausb - a.x.ausb) || (a.priority - b.priority));
}

function openSubstituteModal(absentIds, day = TODAY) {
  const em = morningEmergencyCheck(day);
  const ranked = replacementRanking(absentIds, day);
  const names = absentIds.map(id => m(id)?.first || '?').join(', ');
  openModal(`<h3 id="mTitle"><i data-lucide="user-cog" style="vertical-align:-3px"></i> Ausfall melden &amp; Ersatz wählen</h3>
    <p class="lead">Ausgefallen: <b>${esc(names)}</b> am ${fmt(day)}. Die Rangliste folgt den bekannten Regeln (AUSB zuerst, wenig Last, lange her letzter Dienst, Springer-Priorität).</p>
    <div class="list" id="rankList">${ranked.map(({ x, priority }, i) => {
      const badge = x.ausb ? '<span class="badge">AUSB</span>' : x.quali === 'ausbildung' ? '<span class="badge warn">AZUBI</span>' : '';
      const reasons = [`Priorität ${(1 - priority).toFixed(2)}`, x.springer ? 'Springer' : x.team != null ? `Team ${x.team}` : 'ohne Team', `${x.total} Dienste`];
      return `<button class="prow" data-subin="${x.id}" style="width:100%;text-align:left;cursor:pointer"><span class="rank">${i + 1}</span>${av(x)}<div class="t"><span>${esc(fullName(x))} ${badge}</span><small>${esc(reasons.join(' · '))}</small></div><i data-lucide="corner-down-right"></i></button>`;
    }).join('') || '<p class="muted">Niemand verfügbar.</p>'}</div>
    <div class="modal-actions"><button class="btn ghost" data-close>Schließen</button></div>`, { wide: true });
  $$('[data-subin]').forEach(b => b.onclick = () => {
    const saniId = +b.dataset.subin;
    const e = plan[iso(day)] || plan[iso(TODAY)];
    if (!e) { toast('Kein Dienst heute', true); return; }
    e.team = e.team.map(id => absentIds.includes(id) ? saniId : id);
    if (!e.extra.includes(saniId)) e.extra.push(saniId);
    e.status = 'warn'; e.tag = 'SPR';
    e.note = `Notfall-Wechsel: ${m(saniId)?.first} für ${absentIds.map(id => m(id)?.first || '?').join(', ')} eingewechselt`;
    e.mark = true; // händische Änderung schützt den Tag vor Neu-Generierung
    save(); renderAll(); closeModal();
    toast(`${m(saniId)?.first} eingewechselt!`);
  });
  icons();
}

/* ---------- Info-Tooltips (i) für Statistik-Werte ---------- */
const METRIC_INFO = {
  'Bereitschafts-Fairness': 'Wie gleichmäßig sind die Bereitschaftsdienste verteilt? 100 % = jede Person hatte gleich viele Dienste. Berechnet aus dem Variationskoeffizienten (VK): Score = 100 − VK.',
  'Einsatz-Fairness': 'Wie gleichmäßig verteilen sich die echten Alarm-Teilnahmen? Wer oft Dienst hatte, aber selten Alarm erlebte, unterscheidet sich hier von der Bereitschafts-Fairness.',
  'Gesamtbelastung': 'Kombinierter Score: 60 % Bereitschafts-Fairness + 40 % Einsatz-Fairness. Je höher, desto fairer verteilt.',
  'VK': 'Variationskoeffizient: Standardabweichung ÷ Durchschnitt × 100. Ziel: unter 15 %. Grün = ausgeglichen, Rot = einzelne deutlich überlastet.',
  'Q': 'Einsatzquote während Bereitschaft: (Einsätze während eigenem Dienst ÷ Dienste) × 100. Hoher Wert = bei dir passierte viel. Kein Qualitätsmaß – nur Last-Verteilung!',
  'S': 'Dienstquote: Zugeteilte Dienste ÷ verfügbare mögliche Dienste. 1 = bei jeder Schicht warst du dran. 0.5 = du hattest nur die Hälfte deiner möglichen Dienste.',
  'V': 'Verfügbarkeitsquote: Verfügbare mögliche Dienste ÷ alle möglichen Dienste (Schultage ohne Sperrtag). Niedrig = viel verhindert (Klausuren, Krank …).',
  'T': '30-Tage-Trend: Dienste in den letzten 30 Tagen ÷ Dienste in den 30 Tagen davor. >1 = Belastung steigt, <1 = sinkt.',
  'P': 'Algorithmus-Score P_i = 0.35·Gesamtlast + 0.25·Zeit seit letztem Dienst + 0.20·Klausurdruck + 0.10·Springer-Last + 0.10·Trend. Niedrig = wird beim Generieren bevorzugt.'
};
function attachInfoTips(root = document) {
  $$('.stat .lbl, .kpi-grid span', root).forEach(el => {
    const txt = el.textContent.trim();
    const key = Object.keys(METRIC_INFO).find(k => txt.startsWith(k) || (k.length === 1 && txt === k));
    if (!key || el.dataset.tip) return;
    el.dataset.tip = '1';
    el.insertAdjacentHTML('beforeend', `<button type="button" class="info-tip" data-infokey="${key}" aria-label="Erklärung: ${METRIC_INFO[key].replace(/"/g, '&quot;')}" title="${METRIC_INFO[key].replace(/"/g, '&quot;')}"><i data-lucide="info" aria-hidden="true"></i></button>`);
  });
  // Button-Wrapper bleibt nach dem Ersetzen des Lucide-Icons klickbar und tastaturbedienbar.
  icons();
  $$('.info-tip', root).forEach(button => {
    if (button.dataset.tipClick) return; button.dataset.tipClick = '1';
    button.onclick = () => openModal(`<h3 id="mTitle">Erklärung</h3><p class="lead">${esc(METRIC_INFO[button.dataset.infokey] || '')}</p><div class="modal-actions"><button class="btn primary" data-close>Verstanden</button></div>`);
  });
}
// Info-Tipps nach jedem Statistik-Render anwenden
const _origRenderBars = renderBars;
renderBars = function () { _origRenderBars(); attachInfoTips($('#summary')); attachInfoTips($('#bars')); };

// Notfall-Modal um Rangliste erweitern: ersetze Standby-Liste durch Ranking
const _origOpenPanicModal = openPanicModal;
openPanicModal = function () {
  const em = morningEmergencyCheck(TODAY);
  if (!em) { toast('Heute kein regulärer Schultag', true); return; }
  const absentIds = em.entry.team.filter(id => !m(id).available || blockedMap(TODAY).has(id));
  if (absentIds.length) { openSubstituteModal(absentIds, TODAY); return; }
  _origOpenPanicModal();
};
