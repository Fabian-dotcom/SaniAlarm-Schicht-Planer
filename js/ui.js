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
function confirmBox(title, text, okLabel, onOk) {
  openModal(`<h3 id="mTitle">${esc(title)}</h3><p class="lead">${esc(text)}</p>
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
  const n = affected(b.scope).length, t = BTYPES[b.type] || BTYPES.Abwesend;
  return `<div class="blk"><span class="ico"><i data-lucide="${t.icon}"></i></span><div class="t">${esc(b.type)} · ${esc(b.title)}<small>${esc(scopeLabel(b.scope))} · ${n} Sanis · ${rangeLabel(b)}</small></div>
    <button class="icon-btn del" data-del-block="${b.id}" aria-label="Sperrtag ${esc(b.title)} löschen"><i data-lucide="trash-2"></i></button></div>`;
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
  if (bl.length) html += `<div class="sub-h" style="margin-top:14px">Sperrtage &amp; Stundenblöcke <small>${bl.length}</small></div>${bl.map(blockRow).join('')}`;
  html += `<div class="form-row" style="margin-top:12px"><button class="btn ghost wide" data-new-block="${iso(d)}"><i data-lucide="calendar-x"></i>Sperre für diesen Tag</button></div>`;
  el.innerHTML = html;
  $('#dayModeSel').onchange = e => {
    setDayMode(d, e.target.value);
    renderAll();
    toast(`Tages-Modus auf „${DAY_MODES[e.target.value]?.label}“ gesetzt`);
  };
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
function renderDashboard() { renderHeader(); renderStats(); renderNext(); renderCal(); renderDetail(); renderBlockList(); renderLoad(); icons(); }

$('#prevM').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderDashboard(); };
$('#nextM').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderDashboard(); };
$('#todayBtn').onclick = () => { viewMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); selected = new Date(TODAY); renderDashboard(); };
$('#blockBtn').onclick = () => openBlockModal({ date: isSchool(selected) ? iso(selected) : undefined });
$('#exportBtn').onclick = openExport;

/* ---------- Plan generieren (Backtracking-Solver) ---------- */
$('#generate').onclick = () => {
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
  const before = {}; monthDays(y, mo).forEach(d => before[iso(d)] = evaluate(d));
  const openBefore = openIn(y, mo), btn = $('#generate');
  btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-circle" class="spin"></i><span>Prüfe Regeln &amp; Sperrtage …</span>`; icons();
  setTimeout(() => {
    prevPlan = JSON.parse(JSON.stringify(plan));
    const r = solve(y, mo);
    openMemo = { key: `${y}-${mo}`, n: openBefore };
    const changes = monthDays(y, mo).filter(d => d >= TODAY).map(d => ({ d, b: before[iso(d)], a: evaluate(d) }))
      .filter(x => x.a && (!x.b || x.b.status === 'bad' || x.b.team.join() !== x.a.team.join()));
    btn.disabled = false; save(); renderAll();
    const open = openIn(y, mo);
    openModal(`<h3 id="mTitle">Plan generiert</h3>
      <p class="lead">${MONTHS[mo]} ${y} · ${teamsList().length} Teams · Sperrtage hart, Fairness ${settings.fair ? 'aktiv' : 'aus'} · ${settings.perShift} Sanis pro Dienst</p>
      <div class="result-grid">
        ${statCard('calendar-check', 'var(--green)', 'Dienste', r.days)}
        ${statCard('repeat', 'var(--lav)', 'Geändert', changes.length)}
        ${statCard('sliders-horizontal', 'var(--orange)', 'Gelockert', r.relaxed + r.understaffed)}
        ${statCard('triangle-alert', 'var(--red)', 'Offen', open)}
      </div>
      ${r.relaxed || r.understaffed ? `<div class="alert info"><i data-lucide="sliders-horizontal"></i><span>Smart Relaxation: ${r.relaxed} Tag(e) mit gelockerten Fairness-/Frequenzregeln, ${r.understaffed} unterbesetzt. Sperrtage, Verfügbarkeit und AUSB-Pflicht wurden nie gebrochen.</span></div>` : ''}
      ${open ? `<div class="alert"><i data-lucide="octagon-alert"></i><span>${open} Tag(e) konnten nicht besetzt werden (alle Teams gesperrt oder ohne AUSB). Prüfe Sperrtage, Teams oder Springer.</span></div>` : ''}
      <p class="muted-s" style="margin:10px 0">Solver: ${r.nodes} Knoten · ${r.ms} ms · Kosten ${r.cost}${r.aborted ? ' · Suchbudget erreicht (beste gefundene Lösung)' : ''}</p>
      ${changes.slice(0, 8).map(x => `<div class="set-line"><span>${fmtS(x.d)}<small>${esc(x.a.note)}</small></span><span class="status-pill ${x.a.status}">${{ ok: 'OK', warn: 'Warnung', bad: 'Offen' }[x.a.status]}</span></div>`).join('')}
      ${changes.length > 8 ? `<p class="muted" style="padding-top:10px">+ ${changes.length - 8} weitere Änderungen</p>` : ''}
      <div class="modal-actions"><button class="btn ghost" id="resUndo"><i data-lucide="undo-2"></i>Rückgängig</button><button class="btn ghost" id="resShare"><i data-lucide="share-2"></i>Teilen</button><button class="btn primary" data-close>Übernehmen</button></div>`);
    $('#resShare').onclick = openExport;
    $('#resUndo').onclick = () => { if (prevPlan) { plan = prevPlan; prevPlan = null; save(); renderAll(); closeModal(); toast('Plan wiederhergestellt'); } };
  }, 60);
};

/* ---------- Kartei ---------- */
let filt = { ausb: false, springer: false, noteam: false, off: false }, sortKey = 'name', sortDir = 1;
const teamText = x => { const t = teamMates(x); return t.length ? t.map(y => y.first).join(', ') : '—'; };
function plannedMap() {
  const c = new Map(), k0 = iso(TODAY);
  Object.entries(plan).forEach(([k, e]) => { if (k >= k0) e.team.forEach(id => c.set(id, (c.get(id) || 0) + 1)); });
  return c;
}
function renderMembers() {
  const q = $('#q').value.trim().toLowerCase(), st = $('#stufe').value, pm = plannedMap();
  let list = members.filter(x => (!q || `${x.first} ${x.last} ${x.cls}`.toLowerCase().includes(q)) && (!st || x.stufe === +st)
    && (!filt.ausb || x.ausb) && (!filt.springer || x.springer) && (!filt.noteam || !teamMates(x).length) && (!filt.off || !x.available));
  const keyOf = { name: x => `${x.last} ${x.first}`.toLowerCase(), cls: x => x.stufe * 100 + x.cls.charCodeAt(x.cls.length - 1), total: x => x.total, year: x => x.year, planned: x => pm.get(x.id) || 0 }[sortKey];
  list = [...list].sort((a, b) => { const ka = keyOf(a), kb = keyOf(b); return (ka > kb ? 1 : ka < kb ? -1 : 0) * sortDir; });
  $('#memCount').textContent = `(${members.length})`;
  $('#resultInfo').textContent = `${list.length} Treffer · ${list.filter(x => x.available).length} verfügbar`;
  const badges = x => (x.ausb ? '<span class="badge">AUSB</span>' : '') + (x.springer ? '<span class="badge spr">SPR</span>' : '')
    + (teamMates(x).length && !teamHasAusb([x.id, ...teamMates(x).map(y => y.id)]) ? '<span class="badge warn">TEAM!</span>' : '');
  const th = (k, label) => `<th><button data-sort="${k}" aria-label="Sortieren nach ${label}">${label}${sortKey === k ? `<i data-lucide="${sortDir > 0 ? 'arrow-up' : 'arrow-down'}" style="width:13px;height:13px"></i>` : ''}</button></th>`;
  $('#memTable').innerHTML = `<thead><tr>${th('name', 'Name')}${th('cls', 'Klasse')}<th>Rolle</th><th>Team</th>${th('total', 'Gesamt')}${th('year', 'Jahr')}${th('planned', 'Geplant')}<th>Verfügbar</th><th></th></tr></thead><tbody>`
    + (list.length ? list.map(x => `<tr class="${x.available ? '' : 'off'}">
      <td><div class="who">${av(x)}<span class="nm">${esc(fullName(x))}</span></div></td><td>${esc(x.cls)}</td><td><div class="badges">${badges(x) || '<span class="muted-s">—</span>'}</div></td>
      <td>${esc(teamText(x))}</td><td class="num">${x.total}</td><td class="num">${x.year}</td><td class="num">${pm.get(x.id) || 0}</td>
      <td><button class="switch" role="switch" aria-checked="${x.available}" data-toggle="${x.id}" aria-label="${esc(fullName(x))} verfügbar"></button></td>
      <td><div class="acts"><button class="icon-btn" data-open="${x.id}" aria-label="${esc(fullName(x))} bearbeiten"><i data-lucide="pencil"></i></button>
        <button class="icon-btn del" data-del-member="${x.id}" aria-label="${esc(fullName(x))} löschen"><i data-lucide="trash-2"></i></button></div></td></tr>`).join('')
      : `<tr><td colspan="9"><div class="empty-state">Keine Mitglieder gefunden.</div></td></tr>`) + '</tbody>';
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
    : (({ first, last, cls, ausb, springer, available }) => ({ first, last, cls, ausb, springer, available }))(m(id));
  const draw = () => {
    const x = id != null ? m(id) : null;
    const mates = x ? teamMates(x) : [], teamIds = x ? [x.id, ...mates.map(y => y.id)] : [];
    const myBlocks = x ? blocks.filter(b => b.to >= iso(TODAY) && affected(b.scope).includes(x.id)).sort((a, b) => a.from < b.from ? -1 : 1) : [];
    const sw = (k, t, s) => `<div class="set-line"><span>${t}<small>${s}</small></span><button class="switch" role="switch" aria-checked="${mdraft[k]}" data-mset="${k}" aria-label="${t}"></button></div>`;
    openModal(`<div class="p-head">${x ? av(x) : ''}<div><h3 id="mTitle">${x ? esc(fullName(x)) : 'Mitglied hinzufügen (Schnelleingabe)'}</h3>${x ? `<p class="muted-s">${x.total} Dienste gesamt · ${x.year} dieses Jahr</p>` : '<p class="lead" style="margin-bottom:8px">Neuen Schulsanitäter direkt erfassen und zur Kartei hinzufügen.</p>'}</div></div>
      <div class="form-row" style="margin-top:12px"><label>Vorname *<input class="inp" id="mFirst" value="${esc(mdraft.first)}" placeholder="z. B. Max" autocomplete="off" autofocus></label>
        <label>Nachname (optional)<input class="inp" id="mLast" value="${esc(mdraft.last)}" placeholder="z. B. Mustermann" autocomplete="off"></label>
        <label style="max-width:130px">Klasse / Stufe<input class="inp" id="mCls" value="${esc(mdraft.cls)}" placeholder="10a" maxlength="3" autocomplete="off"></label></div>
      ${sw('available', 'Verfügbar', 'Aus = krank/abwesend, wird nicht eingeplant')}
      ${sw('ausb', 'Ausgebildet (AUSB)', 'Sanitätsausbildung abgeschlossen – jedes Team braucht mindestens eine Person')}
      ${sw('springer', 'Springer', 'Springt bei Unterbesetzung ein')}
      ${x ? `<div class="sub-h" style="margin-top:18px">Team-Partner <small>${mates.length}/2 · Team = ${teamIds.length} Pers.</small></div>
        ${mates.length ? mates.map(p => `<div class="prow">${av(p)}<div class="t"><span>${esc(fullName(p))} ${p.ausb ? '<span class="badge">AUSB</span>' : ''}</span><small>Klasse ${esc(p.cls)}${p.available ? '' : ' · abwesend'}</small></div>
          <button class="icon-btn del" data-unpartner="${p.id}" aria-label="${esc(p.first)} als Partner entfernen"><i data-lucide="user-minus"></i></button></div>`).join('') : '<p class="muted">Noch kein Team – wird nur als Springer/Einzelperson geplant.</p>'}
        ${mates.length && !teamHasAusb(teamIds) ? `<div class="alert"><i data-lucide="octagon-alert"></i><span>Team ohne ausgebildete Person – der Algorithmus plant es nicht ein.</span></div>` : ''}
        ${mates.length < 2 ? `<button class="btn ghost wide" id="addPartner" style="margin-top:8px" aria-expanded="${partnerOpen}"><i data-lucide="user-plus"></i>Partner hinzufügen</button>
          ${partnerOpen ? `<div class="search" style="margin:8px 0 0;max-width:none"><i data-lucide="search"></i><label class="sr-only" for="pq">Partner suchen</label><input id="pq" type="search" placeholder="Name oder Klasse" value="${esc(partnerQuery)}" autocomplete="off"></div><div class="picker" id="pPicker">${pickerHTML(x)}</div>` : ''}` : ''}
        <div class="sub-h" style="margin-top:18px">Sperrtage &amp; Klausuren <small>${myBlocks.length} anstehend</small></div>
        <div style="margin-top:8px">${myBlocks.map(blockRow).join('') || '<p class="muted">Keine anstehenden Sperrtage.</p>'}</div>
        <button class="btn ghost wide" data-new-block-person="${x.id}"><i data-lucide="calendar-x"></i>Sperrtag / Klausur eintragen</button>`
      : `<p class="muted-s" style="margin-top:14px">Tipp: Teampartner und individuelle Sperrtage können direkt nach dem Anlegen hier vergeben werden.</p>`}
      <div class="modal-actions">${x ? `<button class="btn danger" id="mDel" style="margin-right:auto"><i data-lucide="trash-2"></i>Löschen</button>` : ''}
        <button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" id="mSave"><i data-lucide="check"></i>${x ? 'Speichern' : 'Hinzufügen'}</button></div>`, { refresh: draw });
    $('#mFirst').oninput = e => mdraft.first = e.target.value; $('#mLast').oninput = e => mdraft.last = e.target.value; $('#mCls').oninput = e => mdraft.cls = e.target.value;
    $$('[data-mset]').forEach(b => b.onclick = () => { const k = b.dataset.mset; mdraft[k] = !mdraft[k]; b.setAttribute('aria-checked', mdraft[k]); });
    $$('[data-partner]').forEach(b => b.onclick = () => { const p = m(+b.dataset.partner); if (linkPartner(x, p)) { partnerOpen = false; partnerQuery = ''; save(); renderAll(); draw(); toast(`${x.first} & ${p.first} sind jetzt ein Team`); } });
    $$('[data-unpartner]').forEach(b => b.onclick = () => { const p = m(+b.dataset.unpartner); unlinkPartner(p); save(); renderAll(); draw(); toast(`${p.first} aus dem Team entfernt`); });
    const add = $('#addPartner'); if (add) add.onclick = () => { partnerOpen = !partnerOpen; draw(); $('#pq')?.focus(); };
    const pq = $('#pq'); if (pq) pq.oninput = () => { partnerQuery = pq.value; $('#pPicker').innerHTML = pickerHTML(x); $$('#pPicker [data-partner]').forEach(b => b.onclick = () => { const p = m(+b.dataset.partner); if (linkPartner(x, p)) { partnerOpen = false; partnerQuery = ''; save(); renderAll(); draw(); toast(`${x.first} & ${p.first} sind jetzt ein Team`); } }); icons(); };
    $('#mSave').onclick = () => {
      const first = mdraft.first.trim();
      const last = mdraft.last.trim();
      const cls = mdraft.cls.trim();
      if (!first) { toast('Bitte mindestens einen Vornamen angeben', true); $('#mFirst')?.focus(); return; }
      if (cls && !/^\d{1,2}[a-zA-Z]?$/.test(cls)) { toast('Klasse z. B. als 10a, 9b oder 8 angeben (oder leer lassen)', true); $('#mCls')?.focus(); return; }
      const cleanData = { ...mdraft, first, last: last || '-', cls: cls || '10a' };
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
    type: 'Klausur',
    title: '',
    from: d,
    to: d,
    hour: '', // '' = ganztägig, oder 1..7
    kind: p ? 'person' : (defaultCls ? 'class' : 'person'),
    value: p ? [p.id] : (defaultCls ? defaultCls : (members[0] ? [members[0].id] : [])),
    q: '',
    returnTo: personId
  };
  openModal(`<h3 id="mTitle">Sperre / Stundenblock eintragen</h3>
    <p class="lead">Sperrt Personen ganztägig oder stundenweise (z. B. Klausur in 3. Stunde) rechtssicher vor Alarmen und Diensten.</p>
    <span class="form-label">Art</span><div class="chips" role="group" aria-label="Art">${Object.keys(BTYPES).map(t => `<button class="fchip" aria-pressed="${t === draft.type}" data-bt="${t}"><i data-lucide="${BTYPES[t].icon}"></i>${t}</button>`).join('')}</div>
    <label><span class="form-label">Bezeichnung</span><input class="inp" id="bTitle" placeholder="z. B. Mathe-Klausur, Arzttermin" autocomplete="off"></label>
    <div class="form-row">
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
  $$('[data-bt]').forEach(b => b.onclick = () => { draft.type = b.dataset.bt; $$('[data-bt]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
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
  if (draft.kind === 'stufe') el.innerHTML = `<div class="chips">${[8, 9, 10, 11, 12].map(s => `<button class="fchip" aria-pressed="${+draft.value === s}" data-sv="${s}">Stufe ${s}</button>`).join('')}</div>`;
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
function draftConflicts(ids) {
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
  if (!draft.from) { toast('Bitte ein Datum wählen', true); return; }
  if (!ids.length) { toast('Bitte mindestens eine Person wählen', true); return; }
  const b = {
    id: Date.now(),
    type: draft.type,
    title: draft.title.trim() || draft.type,
    from: draft.from,
    to: draft.to < draft.from ? draft.from : draft.to,
    hour: draft.hour ? +draft.hour : null,
    scope: { kind: draft.kind, value: draft.kind === 'person' ? [...draft.value] : draft.value }
  };
  const conf = draftConflicts(ids);
  blocks.push(b); save();
  viewMonth = new Date(parse(b.from).getFullYear(), parse(b.from).getMonth(), 1); selected = parse(b.from);
  renderAll();
  if (draft.returnTo != null) openMember(draft.returnTo); else closeModal();
  toast(conf ? `Gespeichert · ${conf} Konflikt(e) im Plan` : 'Sperre gespeichert', !!conf);
}

/* ---------- Export ---------- */
function deliver(blob, filename) {
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: blob.type }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: filename }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`${filename} erstellt`);
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
  doc.setFontSize(8); doc.setTextColor(150); doc.text(`Erstellt am ${TODAY.toLocaleDateString('de-DE')} mit SaniAlarm · Klausuren & Sperrtage berücksichtigt`, 16, 288);
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
    icons();
  };
  draw();
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
    soll: logRows.filter(r => !r.spont).length
  };
  einsaetze.unshift(entry);
  $('#logNote').value = '';
  logUsedInventory = {};
  save(); renderAll(); toast(`Einsatz gespeichert · Ort: ${place}`);
};

/* ---------- Statistik ---------- */
let tf = 'total';
function renderBars() {
  const active = members.filter(x => x[tf] > 0), vals = active.map(x => x[tf]);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length || 1, max = vals.length ? Math.max(...vals) : 0;
  $('#summary').innerHTML = statCard('sigma', 'var(--lav)', 'Ø Dienste', avg.toFixed(1).replace('.', ','))
    + statCard('flame', 'var(--pink)', 'Maximum', max) + statCard('scale', 'var(--green)', 'Fairness', fairnessOf(vals), null, '%')
    + statCard('users', 'var(--lav)', 'Mit Diensten', active.length, null, `/ ${members.length}`);
  $('#bars').innerHTML = active.length ? [...active].sort((a, b) => b[tf] - a[tf]).map(x => {
    const idx = Math.round(x[tf] / avg * 100), color = idx >= 130 ? 'var(--red)' : idx >= 105 ? 'var(--orange)' : 'var(--green)';
    return `<div class="bar-row"><div class="top-line"><span class="n">${av(x)}${esc(fullName(x))}</span><span class="idx"><b>${idx}%</b> · ${x[tf]}</span></div>
      <div class="track" role="progressbar" aria-label="Belastungsindex ${esc(x.first)}" aria-valuenow="${idx}" aria-valuemin="0" aria-valuemax="200"><div class="fill" style="width:${Math.min(idx / 2, 100)}%;background:${color}"></div><span class="avgmark"></span></div></div>`;
  }).join('') + `<div class="bars-legend"><span>0%</span><span>Ø 100%</span><span>200%</span></div>` : '<p class="muted">Noch keine Dienste erfasst.</p>';
  const sel = $('#shiftPerson'), cur = sel.value;
  sel.innerHTML = members.map(x => `<option value="${x.id}">${esc(fullName(x))} (${esc(x.cls)})</option>`).join('');
  if (cur && m(+cur)) sel.value = cur;
  if (!$('#shiftDate').value) $('#shiftDate').value = iso(addDays(TODAY, -1));
  icons();
}
$$('[data-tf]').forEach(b => b.onclick = () => { tf = b.dataset.tf; $$('[data-tf]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderBars(); });
$('#addShift').onsubmit = e => {
  e.preventDefault(); const x = m(+$('#shiftPerson').value); if (!x) { toast('Keine Person gewählt', true); return; }
  const d = parse($('#shiftDate').value); if (isNaN(d)) { toast('Bitte ein Datum wählen', true); return; }
  x.total++; if (d.getFullYear() === TODAY.getFullYear()) x.year++; if (d.getMonth() === TODAY.getMonth() && d.getFullYear() === TODAY.getFullYear()) x.month++;
  save(); renderAll(); toast(`Schicht für ${x.first} nachgetragen`);
};
function renderExams() {
  const lim = iso(addDays(TODAY, 62)), list = blocks.filter(b => b.to >= iso(TODAY) && b.from <= lim).sort((a, b) => a.from < b.from ? -1 : 1);
  $('#exams').innerHTML = (list.map(b => { const d = parse(b.from), ids = affected(b.scope);
    return `<div class="exam"><div class="dd"><b>${d.getDate()}</b><span>${MON3[d.getMonth()]}</span></div>
      <div class="inf"><div>${esc(b.type)} · ${esc(b.title)} · ${esc(scopeLabel(b.scope))}</div><div>Betroffen: ${esc(ids.slice(0, 3).map(id => m(id).first).join(', '))}${ids.length > 3 ? ` +${ids.length - 3}` : ''}</div></div>
      <span class="status-pill ${ids.length > 2 ? 'bad' : 'warn'}">${ids.length}</span></div>`; }).join('') || '<p class="muted">Keine Sperrtage in den nächsten 2 Monaten.</p>')
    + `<button class="btn ghost wide" style="margin-top:10px" data-new-block=""><i data-lucide="plus"></i>Sperrtag / Klausur eintragen</button>`;
}

/* ---------- Einstellungen & Daten ---------- */
const settingsRow = (k, t, s) => `<div class="set-row"><span>${t}<small>${s}</small></span><button class="switch" role="switch" aria-checked="${settings[k]}" data-set="${k}" aria-label="${t}"></button></div>`;
const dbInfo = () => `${members.length} Personen · ${teamsList().length} Teams · ${blocks.length} Sperrtage · ${Object.keys(plan).length} Plantage${lastSaved ? ` · gespeichert ${pad(lastSaved.getHours())}:${pad(lastSaved.getMinutes())}` : ''}`;
function renderSettings() {
  $('#rulesCard').innerHTML = `<div class="card-head"><h2>Regeln für den Plan-Generator</h2></div>
    <div class="set-row"><span>Sanis pro Dienst<small>Fehlende Plätze füllen Springer</small></span><div class="stepper"><button data-step="-1" aria-label="Weniger"><i data-lucide="minus"></i></button><b id="perShift">${settings.perShift}</b><button data-step="1" aria-label="Mehr"><i data-lucide="plus"></i></button></div></div>
    <div class="set-row lockrow"><span>Sperrtage, Verfügbarkeit &amp; AUSB-Pflicht<small>Immer hart – werden nie gelockert</small></span><i data-lucide="lock"></i></div>
    ${settingsRow('fair', 'Fairness-Ausgleich', 'Wenig belastete Teams zuerst')}
    ${settingsRow('weekday', 'Kein Wochentag doppelt', 'Pro Team und Monat (lockerbar)')}
    ${settingsRow('friMon', 'Kein Fr–Mo-Doppeldienst', 'Keine Back-to-Back-Dienste übers Wochenende (lockerbar)')}
    ${settingsRow('notify', 'Push bei Alarm', 'Benachrichtigung an eingeteilte Sanis')}
    <div class="set-row"><span>Ich bin<small>Für „Mein nächster Dienst“</small></span><div class="select"><label class="sr-only" for="meSel">Ich bin</label><select id="meSel"><option value="">–</option>${members.map(x => `<option value="${x.id}" ${x.id === settings.me ? 'selected' : ''}>${esc(fullName(x))}</option>`).join('')}</select><i data-lucide="chevron-down"></i></div></div>
    <div class="algo"><b>So plant der Algorithmus:</b> Backtracking mit Branch-and-Bound. Pro Tag werden alle gültigen Teams (+Springer) geprüft; Sperrtage, Verfügbarkeit und AUSB-Pflicht schließen Optionen hart aus. Max. 1 Dienst pro Woche, kein doppelter Wochentag und kein Fr→Mo-Dienst sind weiche Regeln: Ist der Plan zu eng, werden sie mit Strafkosten gelockert und der Tag erhält ein <b>REG</b>-, <b>SPR</b>- oder <b>x/y</b>-Badge. Kann ein Tag gar nicht besetzt werden, erscheint er als Konflikt.</div>`;
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
  const webJoinUrl = `https://sani-alarm-planer.netlify.app/?beitritt=1#key=${secretKey}`;

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
      const added = upsertMember({
        first,
        last: decoded.nachname || decoded.last || '-',
        cls: decoded.klasse || decoded.cls || '10a',
        ausb: !!(decoded.ausb ?? false),
        springer: true,
        available: true
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
  const rawKey = base64UrlToBytes(secret);
  if (rawKey.length !== 32) return null;
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
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
  const t = e.target.closest('[data-del-block],[data-new-block],[data-new-block-person],[data-open],[data-toggle],[data-del-member],[data-dissolve],[data-sort],#addMember,#memQrInvite,#panicBtn');
  if (!t) return;
  if (t.id === 'addMember') { openMember(null); return; }
  if (t.id === 'memQrInvite') { openQrInviteModal(); return; }
  if (t.id === 'panicBtn') { openPanicModal(); return; }
  if (t.dataset.delBlock) {
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
