const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const icons = () => window.lucide && lucide.createIcons();
const TODAY = new Date(2026,10,11);
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MON3 = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const WD = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const WDL = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const COLORS = ['#6B4FBB','#D2588F','#2F8F6B','#C8741F','#3B6FD8','#8A5A44','#1F8FA0','#A146C0'];

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const t = new Date(d); t.setDate(t.getDate()+n); return t; };
const same = (a,b) => iso(a)===iso(b);
const isSchool = d => d.getDay()>0 && d.getDay()<6;
const fmt = d => `${WD[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
const fmtS = d => `${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth()+1)}.`;
const weekKey = d => iso(addDays(d, -((d.getDay()+6)%7)));
const kw = d => { const t = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); const n = t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-n); const y0 = new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil(((t-y0)/864e5+1)/7); };

/* ---------- Seed data ---------- */
const RAW = [
 ['Fabian','Keller','10a',1,0,1,14],['Lena','Hoffmann','10b',1,1,1,11],['Jonas','Becker','9a',0,0,1,6],['Mia','Schulz','10a',1,0,1,12],
 ['Noah','Wagner','11c',1,0,1,9],['Emma','Fischer','8b',0,0,1,3],['Paul','Weber','9c',1,0,1,8],['Hannah','Meyer','10c',1,1,1,10],
 ['Leon','Schmidt','12a',1,0,1,15],['Sophie','Wolf','8a',0,0,1,2],['Elias','Neumann','11a',1,0,1,7],['Clara','Braun','9b',0,0,1,5],
 ['Ben','Zimmermann','10b',0,0,1,6],['Lea','Krüger','12b',1,0,1,13],['Finn','Hartmann','8c',0,0,0,4],['Marie','Lange','11b',1,1,1,9],
 ['Luis','Schäfer','9a',0,0,0,5],['Ida','Koch','10c',1,0,1,8],['Felix','Richter','12a',0,0,1,7],['Lina','Klein','8b',0,0,1,3],
 ['Anton','Schröder','11c',1,0,1,10],['Greta','Vogel','9c',0,0,1,4],['Moritz','Frank','10a',0,1,1,6],['Nele','Peters','12b',1,0,1,11]
];
const TEAMS_INIT = [[0,3],[1,12],[4,20],[6,2],[7,17],[8,18],[10,15],[13,23],[5,19,9],[11,21]];
const SEED_BLOCKS = [
  {id:1,type:'Klausur',title:'Biologie',from:'2026-11-13',to:'2026-11-13',scope:{kind:'class',value:'8b'}},
  {id:2,type:'Abwesend',title:'Arzttermin',from:'2026-11-13',to:'2026-11-13',scope:{kind:'person',value:[1]}},
  {id:3,type:'Klausur',title:'Mathematik',from:'2026-11-17',to:'2026-11-17',scope:{kind:'class',value:'10a'}},
  {id:4,type:'Exkursion',title:'Exkursion Stufe 10',from:'2026-11-24',to:'2026-11-24',scope:{kind:'stufe',value:10}},
  {id:5,type:'Klausur',title:'Englisch',from:'2026-11-26',to:'2026-11-26',scope:{kind:'class',value:'9b'}},
  {id:6,type:'Klausur',title:'Englisch',from:'2026-11-26',to:'2026-11-26',scope:{kind:'class',value:'12a'}},
  {id:7,type:'Klausur',title:'Deutsch',from:'2026-12-03',to:'2026-12-03',scope:{kind:'class',value:'11c'}},
  {id:8,type:'Klassenfahrt',title:'Klassenfahrt Berlin',from:'2026-12-07',to:'2026-12-09',scope:{kind:'class',value:'9a'}},
  {id:9,type:'Klausur',title:'Physik',from:'2026-12-10',to:'2026-12-10',scope:{kind:'class',value:'10b'}},
  {id:10,type:'Klausur',title:'Chemie',from:'2026-12-15',to:'2026-12-15',scope:{kind:'class',value:'12b'}},
  {id:11,type:'Klausur',title:'Geschichte',from:'2027-01-14',to:'2027-01-14',scope:{kind:'class',value:'10c'}},
];
const SEED_HISTORY = [
  {d:'2026-11-09',type:'Kreislauf',place:'Mensa',ist:2,soll:2},
  {d:'2026-11-05',type:'Sportunfall',place:'Sporthalle',ist:3,soll:2},
  {d:'2026-11-03',type:'Schnittwunde',place:'Raum B014',ist:1,soll:2},
];
const DEFAULT_SETTINGS = {perShift:2,fair:true,weekday:true,friMon:true,notify:true};
const BTYPES = {
  Klausur:{tag:'KA',icon:'graduation-cap'},
  Klassenfahrt:{tag:'KF',icon:'bus'},
  Exkursion:{tag:'EX',icon:'map'},
  Abwesend:{tag:'AB',icon:'user-x'},
};

let members, blocks, plan, history, settings, lastSaved = null, prevOpen = null;

/* ---------- Local database (Room-Ersatz im Prototyp) ---------- */
const DB_KEY = 'saniteam.v1';
function snapshot(){
  return {app:'SaniAlarm',format:'saniteam',version:1,exportedAt:new Date().toISOString(),
    members:members.map(({id,first,last,cls,ausb,springer,available,total,year,month,team})=>({id,first,last,cls,ausb,springer,available,total,year,month,team})),
    blocks,plan,history,settings};
}
function restore(data){
  if(!data || data.format!=='saniteam' || !Array.isArray(data.members)) throw new Error('Keine gültige .saniteam-Datei');
  members = data.members.map(m=>({...m,stufe:parseInt(m.cls)}));
  blocks = data.blocks||[]; plan = data.plan||{}; history = data.history||[];
  settings = {...DEFAULT_SETTINGS,...(data.settings||{})};
}
function save(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(snapshot())); }catch(e){} lastSaved = new Date(); }
function seed(){
  members = RAW.map((r,i)=>({id:i,first:r[0],last:r[1],cls:r[2],stufe:parseInt(r[2]),ausb:!!r[3],springer:!!r[4],available:!!r[5],
    total:r[6],year:Math.round(r[6]*.62)+(i%2),month:Math.max(0,Math.round(r[6]*.14)+(i%3)-1),team:null}));
  TEAMS_INIT.forEach((t,i)=>t.forEach(id=>members[id].team=i+1));
  blocks = structuredClone(SEED_BLOCKS); history = structuredClone(SEED_HISTORY);
  settings = {...DEFAULT_SETTINGS}; plan = {};
  // Alter Plan ohne Sperrtage → zeigt Konflikte, bis neu generiert wird
  solve(2026,10,{ignoreBlocks:true}); solve(2026,11,{ignoreBlocks:true});
  const stale = (k,ids,teamId) => plan[k] = {team:ids,teamId,extra:[],status:'ok',tag:'OK',note:`Team ${ids.map(id=>members[id].first).join(' & ')}`};
  stale('2026-11-13',[1,12],2); stale('2026-11-17',[0,3],1); stale('2026-11-24',[7,17],5); stale('2026-11-26',[8,18],6); stale('2026-12-08',[6,2],4);
}
function boot(){
  try{ const raw = localStorage.getItem(DB_KEY); if(raw){ restore(JSON.parse(raw)); return; } }catch(e){}
  seed();
}

const ini = m => m.first[0]+m.last[0];
const col = m => COLORS[m.id%COLORS.length];
const av = (m,cls='') => `<span class="av ${cls}" style="background:${col(m)}" aria-hidden="true">${ini(m)}</span>`;
const fullName = m => `${m.first} ${m.last}`;
const short = m => `${m.first} ${m.last[0]}.`;

/* ---------- Sperrtage ---------- */
function affected(scope){
  if(scope.kind==='stufe') return members.filter(m=>m.stufe===+scope.value).map(m=>m.id);
  if(scope.kind==='class') return members.filter(m=>m.cls===scope.value).map(m=>m.id);
  return [...(scope.value||[])];
}
function scopeLabel(s){
  if(s.kind==='stufe') return `Stufe ${s.value}`;
  if(s.kind==='class') return `Klasse ${s.value}`;
  const ids = s.value||[];
  return ids.length<=2 ? ids.map(id=>short(members[id])).join(', ') : `${ids.length} Personen`;
}
const covers = (b,d) => { const k = iso(d); return b.from<=k && k<=b.to; };
const blocksOn = d => blocks.filter(b=>covers(b,d));
function blockedMap(d){
  const map = new Map();
  blocksOn(d).forEach(b=>affected(b.scope).forEach(id=>{ if(!map.has(id)) map.set(id,b); }));
  return map;
}
const rangeLabel = b => b.from===b.to ? fmtS(parse(b.from)) : `${fmtS(parse(b.from))} – ${fmtS(parse(b.to))}`;

/* ---------- Teams ---------- */
function teamsList(){
  const g = {};
  members.forEach(m=>{ if(m.team!=null) (g[m.team] ||= []).push(m.id); });
  return Object.entries(g).filter(([,ids])=>ids.length>1).map(([id,ids])=>({id:+id,ids}));
}
const teamMates = m => m.team==null ? [] : members.filter(x=>x.team===m.team && x.id!==m.id);
const teamHasAusb = ids => ids.some(id=>members[id].ausb);
function linkPartner(a,b){
  const ga = a.team!=null ? members.filter(x=>x.team===a.team) : [a];
  const gb = b.team!=null ? members.filter(x=>x.team===b.team) : [b];
  const merged = new Set([...ga,...gb]);
  if(merged.size>3){ toast('Ein Team hat maximal 3 Personen', true); return false; }
  const tid = a.team ?? b.team ?? (Math.max(0,...members.map(x=>x.team??0))+1);
  merged.forEach(x=>x.team=tid);
  return true;
}
function unlinkPartner(p){
  const t = p.team; p.team = null;
  const rest = members.filter(x=>x.team===t);
  if(rest.length===1) rest[0].team = null;
}

/* ---------- Constraint-Solver ---------- */
function solve(y,mo,{ignoreBlocks=false}={}){
  const teams = teamsList(), per = settings.perShift, usage = {}, sprWeeks = {};
  const U = id => usage[id] ||= {weeks:new Set(),wds:new Set(),days:new Set(),count:0};
  const load = ids => ids.reduce((a,id)=>a+members[id].total,0)/ids.length;
  const rec = (e,d) => {
    if(e.teamId!=null){ const u = U(e.teamId); u.weeks.add(weekKey(d)); u.wds.add(d.getDay()); u.days.add(iso(d)); u.count++; }
    (e.extra||[]).forEach(id=>(sprWeeks[id] ||= new Set()).add(weekKey(d)));
  };
  let relaxed = 0, days = 0;
  const len = new Date(y,mo+1,0).getDate();
  for(let i=1;i<=len;i++){
    const d = new Date(y,mo,i); if(!isSchool(d)) continue;
    const k = iso(d);
    if(d<TODAY && plan[k]){ rec(plan[k],d); continue; }
    days++;
    const blocked = ignoreBlocks ? new Map() : blockedMap(d);
    const wk = weekKey(d), wd = d.getDay(), fri = iso(addDays(d,-3));
    const cand = teams.map(t=>({t,usable:t.ids.filter(id=>members[id].available && !blocked.has(id))}))
      .filter(c=>c.usable.length && teamHasAusb(c.usable));
    const levels = [
      {w:true,wd:settings.weekday,fm:settings.friMon,label:null},
      {w:true,wd:false,fm:settings.friMon,label:'Wochentag-Regel gelockert'},
      {w:false,wd:false,fm:settings.friMon,label:'Wochen-Limit gelockert'},
    ];
    let pick = null, label = null;
    for(const L of levels){
      const ok = cand.filter(c=>{ const u = U(c.t.id);
        return !(L.w && u.weeks.has(wk)) && !(L.wd && u.wds.has(wd)) && !(L.fm && wd===1 && u.days.has(fri)); });
      if(ok.length){
        ok.sort((a,b)=>((a.usable.length>=per?0:1)-(b.usable.length>=per?0:1))
          || (U(a.t.id).count-U(b.t.id).count)
          || (settings.fair ? load(a.t.ids)-load(b.t.ids) : 0)
          || ((a.t.id*7+i)%11-(b.t.id*7+i)%11));
        pick = ok[0]; label = L.label; break;
      }
    }
    let e;
    if(!pick){
      e = {team:[],teamId:null,extra:[],status:'bad',tag:`0/${per}`,note:'Kein gültiges Team – alle gesperrt oder ohne AUSB'};
    }else{
      const team = [...pick.usable], extra = [];
      while(team.length<per){
        const spr = members.filter(m=>m.springer && m.available && !blocked.has(m.id) && !team.includes(m.id) && !(sprWeeks[m.id]?.has(wk)))
          .sort((a,b)=>a.total-b.total)[0];
        if(!spr) break; team.push(spr.id); extra.push(spr.id);
      }
      const names = team.map(id=>members[id].first).join(' & ');
      const base = {team,teamId:pick.t.id,extra};
      if(team.length<per) e = {...base,status:'warn',tag:`${team.length}/${per}`,note:`Unterbesetzt · ${names}`};
      else if(extra.length) e = {...base,status:'warn',tag:'SPR',note:`${names} · Springer ${extra.map(id=>members[id].first).join(', ')} ergänzt`};
      else if(label){ relaxed++; e = {...base,status:'warn',tag:'REG',note:`${names} · ${label}`}; }
      else e = {...base,status:'ok',tag:'OK',note:`Team ${names}`};
    }
    plan[k] = e; rec(e,d);
  }
  return {days,relaxed};
}

function evaluate(d){
  const e = plan[iso(d)]; if(!e) return null;
  const bm = blockedMap(d);
  const hit = e.team.filter(id=>bm.has(id) || !members[id].available);
  if(!hit.length) return {...e,hit:[]};
  const b = hit.map(id=>bm.get(id)).find(Boolean);
  return {...e,hit,status:'bad',tag:b?BTYPES[b.type].tag:'KR',
    note:`Konflikt: ${hit.map(id=>members[id].first).join(', ')} – ${b?esc(b.title):'krank gemeldet'}. Plan neu generieren.`};
}
function monthDays(y,mo){ const out = []; const len = new Date(y,mo+1,0).getDate(); for(let i=1;i<=len;i++){ const d = new Date(y,mo,i); if(isSchool(d)) out.push(d); } return out; }
function openIn(y,mo){ return monthDays(y,mo).filter(d=>d>=TODAY || same(d,TODAY)).filter(d=>evaluate(d)?.status==='bad').length; }

let viewMonth = new Date(2026,10,1);
let selected = new Date(TODAY);

/* ---------- Dashboard ---------- */
function renderStats(){
  const active = members.filter(m=>m.available).length;
  const teams = teamsList(), noAusb = teams.filter(t=>!teamHasAusb(t.ids)).length;
  const od = openIn(2026,10);
  const card = (icon,color,lbl,val,trend) => `<div class="stat"><i data-lucide="${icon}" style="color:${color}"></i><span class="lbl">${lbl}</span>
    <span class="val">${val}${trend?`<span class="trend ${trend.good?'up':'down'}"><i data-lucide="${trend.dir==='up'?'arrow-up':'arrow-down'}"></i>${trend.n}</span>`:''}</span></div>`;
  $('#stats').innerHTML =
    card('users','var(--pink)','Aktive Sanis',active, members.length-active ? {n:members.length-active,dir:'down',good:false} : null)
    + card('users-round','var(--lav)','Teams',teams.length, noAusb ? {n:noAusb,dir:'down',good:false} : null)
    + card('triangle-alert','var(--lav)','Offene Tage',od, prevOpen!=null && prevOpen!==od ? {n:Math.abs(prevOpen-od),dir:od<prevOpen?'down':'up',good:od<prevOpen} : null);
}

function renderNext(){
  let d = addDays(TODAY,1), info = null;
  for(let i=0;i<70;i++){ const e = isSchool(d) && evaluate(d); if(e && e.team.includes(0)){ info = e; break; } d = addDays(d,1); }
  const el = $('#nextShift');
  if(!info){ el.innerHTML = `<div class="eyebrow">Kein Dienst geplant</div><div class="date" style="font-size:18px">Generiere einen Plan für die nächsten Wochen.</div>`; el.onclick = null; return; }
  const diff = Math.round((d-TODAY)/864e5);
  const partners = info.team.map(id=>members[id]);
  el.innerHTML = `
    <div class="row"><div><div class="eyebrow">${diff===1?'Morgen':`In ${diff} Tagen`}</div><div class="date">${WDL[d.getDay()]}, ${d.getDate()}. ${MON3[d.getMonth()]}</div></div>
      <span class="pill blue"><i data-lucide="clock" style="width:13px;height:13px"></i>${diff===1?'in 23 Std.':`in ${diff} Tagen`}</span></div>
    <div class="meta"><span><i data-lucide="clock-3"></i>09:30 – 09:50</span><span><i data-lucide="map-pin"></i>Sanitätsraum B014</span></div>
    <div class="partners"><span class="stack">${partners.map(m=>av(m)).join('')}</span>mit ${partners.filter(m=>m.id!==0).map(m=>m.first).join(', ') || 'niemandem'}</div>`;
  el.setAttribute('aria-label','Nächsten Dienst im Kalender anzeigen');
  el.onclick = () => { viewMonth = new Date(d.getFullYear(),d.getMonth(),1); selected = new Date(d); renderCal(); };
}

function renderCal(){
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  $('#calTitle').textContent = `${MONTHS[m]} ${y}`;
  const first = (new Date(y,m,1).getDay()+6)%7, len = new Date(y,m+1,0).getDate();
  let html = '';
  for(let i=0;i<first;i++) html += `<div class="day empty"></div>`;
  for(let d=1; d<=len; d++){
    const dt = new Date(y,m,d), school = isSchool(dt), info = school ? evaluate(dt) : null, bl = blocksOn(dt);
    const c = ['day']; if(!school) c.push('weekend'); if(dt<TODAY && !same(dt,TODAY)) c.push('past');
    if(same(dt,TODAY)) c.push('today'); if(same(dt,selected)) c.push('selected');
    const tag = info ? `<span class="tag ${info.status}">${info.tag}</span>` : `<span class="tag" style="visibility:hidden">–</span>`;
    const label = `${d}. ${MONTHS[m]}${!school?', Wochenende':info?', '+info.note.replace(/<[^>]+>/g,''):', noch kein Plan'}${bl.length?`, ${bl.length} Sperrtag(e)`:''}`;
    html += `<button class="${c.join(' ')}" data-d="${d}" ${school?'':'disabled'} aria-label="${esc(label)}" aria-pressed="${same(dt,selected)}"><span class="num">${d}${bl.length?'<i class="bdot"></i>':''}</span>${tag}</button>`;
  }
  $('#days').innerHTML = html;
  $$('#days .day[data-d]').forEach(b=>b.onclick=()=>{ selected = new Date(y,m,+b.dataset.d); renderCal(); });
  const hasPlan = monthDays(y,m).some(d=>plan[iso(d)]);
  const btn = $('#generate');
  if(!btn.disabled) btn.innerHTML = `<i data-lucide="${hasPlan?'refresh-cw':'sparkles'}"></i><span>${hasPlan?'Plan neu generieren':`Plan für ${MONTHS[m]} generieren`}</span>`;
  renderDetail();
}

function blockRow(b){
  const n = affected(b.scope).length, t = BTYPES[b.type]||BTYPES.Abwesend;
  return `<div class="blk"><span class="ico"><i data-lucide="${t.icon}"></i></span><div class="t">${esc(b.type)} · ${esc(b.title)}<small>${esc(scopeLabel(b.scope))} · ${n} Sanis · ${rangeLabel(b)}</small></div>
    <button class="x" data-del-block="${b.id}" aria-label="Sperrtag ${esc(b.title)} löschen"><i data-lucide="trash-2"></i></button></div>`;
}

function renderDetail(){
  const d = selected, el = $('#dayDetail');
  if(d.getMonth()!==viewMonth.getMonth() || d.getFullYear()!==viewMonth.getFullYear() || !isSchool(d)){
    el.innerHTML = `<div class="note"><i data-lucide="info"></i>Wähle einen Schultag im Kalender, um Besetzung und Sperrtage zu sehen.</div>`; icons(); return;
  }
  const info = evaluate(d), bl = blocksOn(d);
  let html = '';
  if(!info){
    html = `<div class="hd"><h2>${fmt(d)}</h2></div><div class="note"><i data-lucide="info"></i>Für diesen Monat gibt es noch keinen Plan.</div>`;
  }else{
    const label = {ok:'Besetzt',warn:'Warnung',bad:'Konflikt'}[info.status];
    const icon = {ok:'circle-check',warn:'circle-alert',bad:'octagon-alert'}[info.status];
    const color = {ok:'#1E8E3E',warn:'#B08000',bad:'var(--red)'}[info.status];
    html = `<div class="hd"><h2>${fmt(d)}</h2><span class="status-pill ${info.status}">${label}</span></div>
      <div class="note"><i data-lucide="${icon}" style="color:${color}"></i><span>${info.note}</span></div>
      <div class="team">${info.team.length ? info.team.map(id=>`<span class="chip-person ${info.hit.includes(id)?'hit':''}">${av(members[id])}${short(members[id])}</span>`).join('') : '<span style="font-size:13.5px;color:var(--muted)">Noch niemand eingeteilt</span>'}</div>`;
  }
  if(bl.length) html += `<div class="sub-h" style="margin:4px 0 0">Sperrtage <small>${bl.length}</small></div>${bl.map(blockRow).join('')}`;
  html += `<button class="btn-line" data-new-block="${iso(d)}"><i data-lucide="calendar-x"></i>Sperrtag für diesen Tag</button>`;
  el.innerHTML = html; icons();
}

/* ---------- Plan generieren ---------- */
$('#generate').onclick = () => {
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
  const before = {}; monthDays(y,mo).forEach(d=>before[iso(d)] = evaluate(d));
  const openBefore = openIn(y,mo);
  const btn = $('#generate'); btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-circle" class="spin"></i><span>Prüfe Regeln & Sperrtage…</span>`; icons();
  setTimeout(()=>{
    const r = solve(y,mo);
    if(y===2026 && mo===10) prevOpen = openBefore;
    const changes = monthDays(y,mo).filter(d=>d>=TODAY).map(d=>({d,b:before[iso(d)],a:evaluate(d)}))
      .filter(x=>!x.b || x.b.status==='bad' || x.b.team.join()!==x.a.team.join());
    btn.disabled = false; save(); renderAll();
    const open = openIn(y,mo);
    openSheet(`<h3 id="sheetTitle">Plan generiert</h3><p class="lead">${MONTHS[mo]} ${y} · ${teamsList().length} Teams · Sperrtage hart, Fairness ${settings.fair?'aktiv':'aus'}.</p>
      <div class="result-grid">
        <div class="stat"><i data-lucide="calendar-check" style="color:var(--green)"></i><span class="lbl">Dienste</span><span class="val">${r.days}</span></div>
        <div class="stat"><i data-lucide="repeat" style="color:var(--lav)"></i><span class="lbl">Geändert</span><span class="val">${changes.length}</span></div>
        <div class="stat"><i data-lucide="triangle-alert" style="color:var(--red)"></i><span class="lbl">Offen</span><span class="val">${open}</span></div>
      </div>
      ${r.relaxed?`<div class="alert info"><i data-lucide="sliders-horizontal"></i><span>Smart Relaxation: an ${r.relaxed} Tag(en) wurden Fairness-/Wochentagsregeln gelockert. Sperrtage wurden nie gebrochen.</span></div>`:''}
      ${changes.slice(0,6).map(x=>`<div class="set-row"><span>${fmtS(x.d)}<small>${x.a.note}</small></span><span class="status-pill ${x.a.status}">${{ok:'Gelöst',warn:'Warnung',bad:'Offen'}[x.a.status]}</span></div>`).join('')}
      ${changes.length>6?`<p class="muted" style="padding-top:10px">+ ${changes.length-6} weitere Änderungen</p>`:''}
      <div class="row2" style="margin-top:16px"><button class="btn-line" id="resShare"><i data-lucide="share-2"></i>Teilen</button><button class="btn-primary" style="margin:0;height:44px" data-close>Übernehmen</button></div>`);
    $('#resShare').onclick = openExport;
  },1100);
};

/* ---------- Kartei ---------- */
let view = 'list', filt = {ausb:false,springer:false,noteam:false};
function teamText(m){
  const mates = teamMates(m);
  return mates.length ? `Team: ${mates.map(x=>x.first).join(', ')}` : 'Kein Team';
}
function renderMembers(){
  const q = $('#q').value.trim().toLowerCase(), st = $('#stufe').value;
  const list = members.filter(m =>
    (!q || `${m.first} ${m.last} ${m.cls}`.toLowerCase().includes(q)) &&
    (!st || m.stufe===+st) && (!filt.ausb || m.ausb) && (!filt.springer || m.springer) && (!filt.noteam || !teamMates(m).length));
  $('#memCount').textContent = `(${members.length})`;
  $('#resultInfo').textContent = `${list.length} Treffer · ${list.filter(m=>m.available).length} verfügbar · Tippe für Details & Partner`;
  const badges = m => {
    const mates = teamMates(m);
    return (m.ausb?'<span class="badge">AUSB</span>':'') + (m.springer?'<span class="badge spr">SPR</span>':'')
      + (mates.length && !teamHasAusb([m.id,...mates.map(x=>x.id)]) ? '<span class="badge warn">TEAM!</span>' : '');
  };
  const sw = m => `<button class="switch" role="switch" aria-checked="${m.available}" data-toggle="${m.id}" aria-label="${esc(fullName(m))} verfügbar"></button>`;
  if(!list.length){ $('#memList').className = ''; $('#memList').innerHTML = `<div class="empty-state">Keine Mitglieder gefunden.</div>`; return; }
  $('#memList').className = view==='list' ? 'list' : 'grid';
  $('#memList').innerHTML = list.map(m => view==='list'
    ? `<div class="mem ${m.available?'':'off'}"><button class="mem-main" data-open="${m.id}" aria-label="${esc(fullName(m))} öffnen">${av(m)}<div class="info"><div class="name">${esc(fullName(m))} ${badges(m)}</div><div class="sub">${m.cls} · ${m.available?esc(teamText(m)):'Krank / abwesend'}</div></div></button>${sw(m)}</div>`
    : `<div class="tile ${m.available?'':'off'}"><div class="tt">${av(m)}${sw(m)}</div><button class="tile-main" data-open="${m.id}"><div><div class="name">${esc(fullName(m))}</div><div class="sub">${m.cls} · ${esc(teamText(m))}</div></div><div style="display:flex;gap:4px;flex-wrap:wrap">${badges(m)||'<span class="badge" style="visibility:hidden">–</span>'}</div></button></div>`
  ).join('');
  $$('[data-toggle]').forEach(b=>b.onclick=()=>{
    const m = members[+b.dataset.toggle]; m.available = !m.available;
    save(); renderAll();
    toast(`${m.first} ist jetzt ${m.available?'verfügbar':'als krank markiert'}`);
  });
  icons();
}
$('#q').oninput = renderMembers; $('#stufe').onchange = renderMembers;
$$('[data-filter]').forEach(b=>b.onclick=()=>{
  const f = b.dataset.filter; filt[f] = !filt[f]; b.setAttribute('aria-pressed',filt[f]);
  b.innerHTML = b.textContent.trim() + (filt[f]?' <i data-lucide="x"></i>':''); renderMembers(); icons();
});
$$('[data-view]').forEach(b=>b.onclick=()=>{ view = b.dataset.view; $$('[data-view]').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderMembers(); });

/* ---------- Personen-Einstellungen ---------- */
let partnerQuery = '', partnerOpen = false, sheetRefresh = null;
function partnerCandidates(m){
  const mine = m.team!=null ? members.filter(x=>x.team===m.team).length : 1;
  const q = partnerQuery.trim().toLowerCase();
  return members.filter(p=>p.id!==m.id && (m.team==null || p.team!==m.team))
    .filter(p=>mine + (p.team!=null ? members.filter(x=>x.team===p.team).length : 1) <= 3)
    .filter(p=>!q || `${p.first} ${p.last} ${p.cls}`.toLowerCase().includes(q))
    .sort((a,b)=>(a.stufe===m.stufe?0:1)-(b.stufe===m.stufe?0:1) || (b.ausb-a.ausb))
    .slice(0,30);
}
function pickerHTML(m){
  const list = partnerCandidates(m);
  return list.length ? list.map(p=>{ const pm = teamMates(p);
    return `<button data-partner="${p.id}">${av(p)}${esc(fullName(p))}<span class="cls">${p.cls}${p.ausb?' · AUSB':''}${pm.length?` · mit ${pm.map(x=>x.first).join(', ')}`:''}</span></button>`; }).join('')
    : `<div class="muted" style="padding:12px 14px">Niemand passt (max. 3 pro Team).</div>`;
}
function personHTML(m){
  const mates = teamMates(m), teamIds = [m.id,...mates.map(x=>x.id)];
  const myBlocks = blocks.filter(b=>b.to>=iso(TODAY) && affected(b.scope).includes(m.id)).sort((a,b)=>a.from<b.from?-1:1);
  const planned = Object.entries(plan).filter(([k,e])=>k>=iso(TODAY) && e.team.includes(m.id)).length;
  const row = (k,t,s) => `<div class="set-row"><span>${t}<small>${s}</small></span><button class="switch" role="switch" aria-checked="${m[k]}" data-pset="${k}" aria-label="${t}"></button></div>`;
  return `<div class="p-head">${av(m)}<div><h3 id="sheetTitle">${esc(fullName(m))}</h3><div class="sub">Klasse ${m.cls} · ${m.total} Dienste gesamt · ${planned} geplant</div></div></div>
    ${row('available','Verfügbar','Aus = krank/abwesend, wird nicht eingeplant')}
    ${row('ausb','Ausgebildet (AUSB)','Sanitätsausbildung abgeschlossen')}
    ${row('springer','Springer','Springt bei Unterbesetzung ein')}
    <div class="sub-h">Team-Partner <small>${mates.length}/2 · Team = ${teamIds.length} Pers.</small></div>
    ${mates.length ? mates.map(p=>`<div class="prow">${av(p)}<div class="t"><span>${esc(fullName(p))} ${p.ausb?'<span class="badge">AUSB</span>':''}</span><small>Klasse ${p.cls}${p.available?'':' · abwesend'}</small></div>
      <button class="x" data-unpartner="${p.id}" aria-label="${esc(p.first)} als Partner entfernen"><i data-lucide="user-minus"></i></button></div>`).join('')
      : '<p class="muted">Noch kein Team – wird nur als Springer/Einzelperson geplant.</p>'}
    ${mates.length && !teamHasAusb(teamIds) ? `<div class="alert"><i data-lucide="octagon-alert"></i><span>Team ohne ausgebildete Person – der Algorithmus plant es nicht ein.</span></div>` : ''}
    ${mates.length<2 ? `<button class="add-btn" id="addPartner" aria-expanded="${partnerOpen}"><i data-lucide="user-plus"></i>Partner hinzufügen</button>
      ${partnerOpen ? `<div class="search" style="margin:8px 0 0"><i data-lucide="search"></i><label class="sr-only" for="pq">Partner suchen</label><input id="pq" type="search" placeholder="Name oder Klasse" value="${esc(partnerQuery)}" autocomplete="off"></div><div class="picker" id="pPicker">${pickerHTML(m)}</div>` : ''}` : ''}
    <div class="sub-h">Sperrtage & Klausuren <small>${myBlocks.length} anstehend</small></div>
    <div class="list">${myBlocks.map(blockRow).join('') || '<p class="muted">Keine anstehenden Sperrtage.</p>'}</div>
    <button class="btn-line" style="margin-top:8px" data-new-block-person="${m.id}"><i data-lucide="calendar-x"></i>Sperrtag / Klausur eintragen</button>
    <button class="btn-primary" data-close>Fertig</button>`;
}
function openPerson(id){
  partnerQuery = ''; partnerOpen = false;
  const draw = () => {
    const m = members[id];
    openSheet(personHTML(m), draw);
    $$('[data-pset]').forEach(b=>b.onclick=()=>{ const k = b.dataset.pset; m[k] = !m[k]; save(); renderAll(); draw(); });
    const add = $('#addPartner');
    if(add) add.onclick = () => { partnerOpen = !partnerOpen; draw(); $('#pq')?.focus(); };
    const pq = $('#pq');
    if(pq) pq.oninput = () => { partnerQuery = pq.value; $('#pPicker').innerHTML = pickerHTML(m); icons(); };
  };
  draw();
}

/* ---------- Sperrtag-Dialog ---------- */
let draft = null;
const CLASSES = () => [...new Set(members.map(m=>m.cls))].sort((a,b)=>parseInt(a)-parseInt(b) || a.localeCompare(b));
function openBlockSheet({date,personId}={}){
  const d = date || iso(selected>=TODAY ? selected : TODAY);
  const p = personId!=null ? members[personId] : null;
  draft = {type:'Klausur',title:'',from:d,to:d,kind:p?'person':'class',value:p?[p.id]:'10a',q:'',returnTo:personId};
  openSheet(`<h3 id="sheetTitle">Sperrtag eintragen</h3>
    <p class="lead">Klausuren, Fahrten oder Abwesenheiten sperren Personen hart – der Algorithmus teilt sie dort nie ein.</p>
    <span class="form-label">Art</span><div class="chips" id="bType" role="group" aria-label="Art">${Object.keys(BTYPES).map(t=>`<button class="fchip" aria-pressed="${t===draft.type}" data-bt="${t}"><i data-lucide="${BTYPES[t].icon}"></i>${t}</button>`).join('')}</div>
    <label><span class="form-label">Bezeichnung</span><input class="inp" id="bTitle" placeholder="z. B. Mathe-Klausur" autocomplete="off"></label>
    <div class="row2"><label><span class="form-label">Von</span><input class="inp" type="date" id="bFrom" value="${draft.from}"></label><label><span class="form-label">Bis</span><input class="inp" type="date" id="bTo" value="${draft.to}"></label></div>
    <span class="form-label">Gilt für</span>
    <div class="seg" id="bKind" role="group" aria-label="Gilt für">${[['stufe','Stufe'],['class','Klasse'],['person','Personen']].map(([k,l])=>`<button aria-pressed="${k===draft.kind}" data-bk="${k}">${l}</button>`).join('')}</div>
    <div id="bScope" style="margin-top:10px"></div>
    <div class="affect" id="bAffect" aria-live="polite"></div>
    <button class="btn-primary" id="bSave"><i data-lucide="lock"></i>Sperrtag speichern</button>`);
  $$('[data-bt]').forEach(b=>b.onclick=()=>{ draft.type = b.dataset.bt; $$('[data-bt]').forEach(x=>x.setAttribute('aria-pressed',x===b)); });
  $('#bTitle').oninput = e => draft.title = e.target.value;
  $('#bFrom').onchange = e => { draft.from = e.target.value; if(draft.to<draft.from){ draft.to = draft.from; $('#bTo').value = draft.to; } renderAffect(); };
  $('#bTo').onchange = e => { draft.to = e.target.value; renderAffect(); };
  $$('[data-bk]').forEach(b=>b.onclick=()=>{
    draft.kind = b.dataset.bk; $$('[data-bk]').forEach(x=>x.setAttribute('aria-pressed',x===b));
    draft.value = draft.kind==='stufe' ? 10 : draft.kind==='class' ? '10a' : (draft.returnTo!=null ? [draft.returnTo] : []);
    renderScope();
  });
  $('#bSave').onclick = saveBlock;
  renderScope();
}
function renderScope(){
  const el = $('#bScope');
  if(draft.kind==='stufe') el.innerHTML = `<div class="chips">${[8,9,10,11,12].map(s=>`<button class="fchip" aria-pressed="${+draft.value===s}" data-sv="${s}">Stufe ${s}</button>`).join('')}</div>`;
  else if(draft.kind==='class') el.innerHTML = `<div class="chips">${CLASSES().map(c=>`<button class="fchip" aria-pressed="${draft.value===c}" data-sv="${c}">${c}</button>`).join('')}</div>`;
  else el.innerHTML = `<div class="search" style="margin-bottom:8px"><i data-lucide="search"></i><label class="sr-only" for="bq">Personen suchen</label><input id="bq" type="search" placeholder="Personen suchen" autocomplete="off" value="${esc(draft.q)}"></div><div class="picker" id="bPeople" style="margin-top:0"></div>`;
  $$('[data-sv]').forEach(b=>b.onclick=()=>{ draft.value = draft.kind==='stufe' ? +b.dataset.sv : b.dataset.sv; $$('[data-sv]').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderAffect(); });
  if(draft.kind==='person'){ $('#bq').oninput = e => { draft.q = e.target.value; renderPeople(); }; renderPeople(); }
  icons(); renderAffect();
}
function renderPeople(){
  const q = draft.q.trim().toLowerCase();
  const list = members.filter(m=>!q || `${m.first} ${m.last} ${m.cls}`.toLowerCase().includes(q))
    .sort((a,b)=>(draft.value.includes(b.id)-draft.value.includes(a.id)) || a.stufe-b.stufe);
  $('#bPeople').innerHTML = list.map(m=>{ const on = draft.value.includes(m.id);
    return `<button data-sp="${m.id}" aria-pressed="${on}">${av(m)}${esc(fullName(m))}<span class="cls">${m.cls}</span><span class="check ${on?'yes':''}" style="width:26px;height:26px;margin-left:6px">${on?'<i data-lucide="check"></i>':''}</span></button>`; }).join('');
  $$('[data-sp]').forEach(b=>b.onclick=()=>{ const id = +b.dataset.sp;
    draft.value = draft.value.includes(id) ? draft.value.filter(x=>x!==id) : [...draft.value,id]; renderPeople(); renderAffect(); });
  icons();
}
function draftConflicts(ids){
  let n = 0, d = parse(draft.from); const end = parse(draft.to);
  while(d<=end){ const e = plan[iso(d)]; if(isSchool(d) && e && e.team.some(id=>ids.includes(id))) n++; d = addDays(d,1); }
  return n;
}
function renderAffect(){
  const ids = affected({kind:draft.kind,value:draft.value}), conf = draftConflicts(ids);
  const names = ids.slice(0,5).map(id=>members[id].first).join(', ') + (ids.length>5?` +${ids.length-5}`:'');
  $('#bAffect').innerHTML = `<b>${ids.length} ${ids.length===1?'Sani':'Sanis'} gesperrt</b><span class="names">${names||'Noch niemand ausgewählt'}</span>
    ${conf ? `<span class="w">${conf} geplante(r) Dienst(e) kollidieren – danach Plan neu generieren</span>` : ids.length ? `<span class="g">Keine Kollision mit dem aktuellen Plan</span>` : ''}`;
}
function saveBlock(){
  const ids = affected({kind:draft.kind,value:draft.value});
  if(!draft.from){ toast('Bitte ein Datum wählen', true); return; }
  if(!ids.length){ toast('Bitte mindestens eine Person wählen', true); return; }
  const b = {id:Date.now(),type:draft.type,title:draft.title.trim()||draft.type,from:draft.from,to:draft.to<draft.from?draft.from:draft.to,
    scope:{kind:draft.kind,value:draft.kind==='person'?[...draft.value]:draft.value}};
  const conf = draftConflicts(ids);
  blocks.push(b); save();
  viewMonth = new Date(parse(b.from).getFullYear(),parse(b.from).getMonth(),1); selected = parse(b.from);
  renderAll();
  if(draft.returnTo!=null) openPerson(draft.returnTo); else closeSheet();
  toast(conf ? `Gespeichert · ${conf} Konflikt(e) im Plan` : 'Sperrtag gespeichert', !!conf);
}

/* ---------- Export ---------- */
function planRows(y,mo){ return monthDays(y,mo).map(d=>({d,e:evaluate(d)})); }
function planText(y,mo){
  const lines = [`*SaniAlarm · Dienstplan ${MONTHS[mo]} ${y}*`,'Sanitätsraum B014 · 1. große Pause',''];
  let wk = null;
  planRows(y,mo).forEach(({d,e})=>{
    if(weekKey(d)!==wk){ if(wk) lines.push(''); lines.push(`_KW ${kw(d)}_`); wk = weekKey(d); }
    const team = e ? (e.team.length ? e.team.map(id=>short(members[id])).join(' & ') : 'OFFEN – bitte melden') : '–';
    lines.push(`${fmtS(d)}  ${team}${e && e.status==='bad' ? '  (!)' : ''}`);
  });
  lines.push('','Tausch nur nach Absprache mit der AG-Leitung.');
  return lines.join('\n');
}
function deliver(blob,filename){
  const file = new File([blob],filename,{type:blob.type});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    navigator.share({files:[file],title:filename}).catch(()=>{}); return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast(`${filename} erstellt`);
}
function openExport(){
  const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
  const rows = planRows(y,mo).filter(r=>r.e);
  if(!rows.length){ toast(`Noch kein Plan für ${MONTHS[mo]}`, true); return; }
  const text = planText(y,mo), open = rows.filter(r=>r.e.status==='bad').length;
  openSheet(`<h3 id="sheetTitle">Plan teilen</h3><p class="lead">${MONTHS[mo]} ${y} · ${rows.length} Dienste · ${open} offen</p>
    <label class="sr-only" for="exText">Vorschau</label><textarea class="export-pre" id="exText" readonly>${esc(text)}</textarea>
    ${open?`<div class="alert"><i data-lucide="triangle-alert"></i><span>${open} Tag(e) haben noch Konflikte – vor dem Teilen neu generieren?</span></div>`:''}
    <div class="export-grid">
      <a class="ex-btn wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer"><span class="ei"><i data-lucide="message-circle"></i></span><span>WhatsApp<small>An die AG-Gruppe</small></span></a>
      <button class="ex-btn" id="exCopy"><span class="ei"><i data-lucide="copy"></i></span><span>Text kopieren<small>Für jede App</small></span></button>
      <button class="ex-btn" id="exPdf"><span class="ei"><i data-lucide="file-text"></i></span><span>PDF<small>A4 zum Aushang</small></span></button>
      <button class="ex-btn" id="exPng"><span class="ei"><i data-lucide="image"></i></span><span>Bild<small>PNG für Gruppe/Status</small></span></button>
    </div>
    <button class="btn-primary" data-close>Fertig</button>`);
  $('#exCopy').onclick = () => {
    const ta = $('#exText');
    (navigator.clipboard?.writeText(text) || Promise.reject()).then(()=>toast('Text kopiert'))
      .catch(()=>{ ta.select(); try{ document.execCommand('copy'); toast('Text kopiert'); }catch(e){ toast('Bitte manuell kopieren', true); } });
  };
  $('#exPdf').onclick = () => makePdf(y,mo);
  $('#exPng').onclick = () => makePng(y,mo);
}
function makePdf(y,mo){
  const jsPDF = window.jspdf?.jsPDF;
  if(!jsPDF){ toast('PDF-Modul lädt noch …', true); return; }
  const doc = new jsPDF({unit:'mm',format:'a4'});
  const header = () => {
    doc.setFillColor(39,39,39); doc.rect(0,0,210,30,'F');
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(19); doc.text(`Dienstplan ${MONTHS[mo]} ${y}`,16,16);
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(200,168,246); doc.text('Schulsanitätsdienst · Sanitätsraum B014 · 1. große Pause',16,23);
  };
  header();
  let yy = 42;
  doc.setFontSize(8.5); doc.setTextColor(111,110,104); doc.text('DATUM',16,yy); doc.text('TEAM',50,yy); doc.text('STATUS',180,yy,{align:'center'}); yy += 3;
  planRows(y,mo).forEach(({d,e},i)=>{
    if(yy>272){ doc.addPage(); header(); yy = 40; }
    if(i%2===0){ doc.setFillColor(249,248,242); doc.rect(12,yy,186,9,'F'); }
    doc.setFontSize(10.5); doc.setTextColor(21,21,21); doc.text(fmtS(d),16,yy+6);
    const team = e ? (e.team.map(id=>fullName(members[id])).join(', ') || 'Offen') : '–';
    doc.text(team,50,yy+6,{maxWidth:112});
    const st = !e ? ['–',[210,208,200],60] : e.status==='ok' ? ['OK',[52,199,89],255] : e.status==='warn' ? [e.tag,[255,193,7],40] : ['Konflikt',[220,53,69],255];
    doc.setFillColor(...st[1]); doc.roundedRect(168,yy+1.8,24,5.4,2.7,2.7,'F');
    doc.setFontSize(8); doc.setTextColor(st[2]); doc.text(String(st[0]),180,yy+5.6,{align:'center'});
    yy += 9;
  });
  doc.setFontSize(8); doc.setTextColor(150); doc.text(`Erstellt am ${TODAY.toLocaleDateString('de-DE')} mit SaniAlarm · Klausuren & Sperrtage berücksichtigt`,16,288);
  deliver(doc.output('blob'),`Dienstplan-${MONTHS[mo]}-${y}.pdf`);
}
async function makePng(y,mo){
  const rows = planRows(y,mo), W = 1080, rowH = 66, top = 230, H = top + rows.length*rowH + 110;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); try{ await document.fonts.ready; }catch(e){}
  const rr = (x,y0,w,h,r) => { g.beginPath(); g.roundRect(x,y0,w,h,r); g.fill(); };
  g.fillStyle = '#F9F8F2'; g.fillRect(0,0,W,H);
  g.fillStyle = '#272727'; rr(40,40,W-80,150,36);
  g.fillStyle = '#C8A8F6'; g.font = '500 26px Outfit, sans-serif'; g.fillText('SANIALARM · DIENSTPLAN',84,100);
  g.fillStyle = '#FFFFFF'; g.font = '300 58px Outfit, sans-serif'; g.fillText(`${MONTHS[mo]} ${y}`,84,162);
  rows.forEach(({d,e},i)=>{
    const y0 = top + i*rowH;
    if(i%2===0){ g.fillStyle = '#FFFFFF'; rr(40,y0,W-80,rowH-8,18); }
    g.fillStyle = '#6F6E68'; g.font = '500 26px Outfit, sans-serif'; g.fillText(fmtS(d),72,y0+39);
    g.fillStyle = '#151515'; g.font = '400 28px Outfit, sans-serif';
    g.fillText(e ? (e.team.map(id=>short(members[id])).join('  &  ') || 'Offen') : '–', 260, y0+39);
    g.fillStyle = !e ? '#D3D1C6' : {ok:'#34C759',warn:'#FFC107',bad:'#DC3545'}[e.status];
    g.beginPath(); g.arc(W-84,y0+29,11,0,Math.PI*2); g.fill();
  });
  g.fillStyle = '#6F6E68'; g.font = '400 22px Outfit, sans-serif'; g.fillText('Sanitätsraum B014 · 1. große Pause · Tausch nur nach Absprache',72,H-48);
  c.toBlob(b=>deliver(b,`Dienstplan-${MONTHS[mo]}-${y}.png`),'image/png');
}

/* ---------- Einsatz-Log ---------- */
let logDate = new Date(TODAY), logRows = [], logType = 'Sportunfall', pickerOpen = false;
function loadLog(){
  const info = isSchool(logDate) ? evaluate(logDate) : null;
  logRows = (info ? info.team : []).map(id=>({id,present:!info.hit.includes(id),spont:false}));
  pickerOpen = false; renderLog();
}
function renderLog(){
  $('#logDate').textContent = fmt(logDate);
  $('#logTypes').innerHTML = ['Sportunfall','Kreislauf','Schnittwunde','Sonstiges'].map(t=>`<button aria-pressed="${t===logType}" data-type="${t}">${t}</button>`).join('');
  $$('[data-type]').forEach(b=>b.onclick=()=>{ logType = b.dataset.type; renderLog(); });
  $('#soll').textContent = logRows.filter(r=>!r.spont).length;
  $('#ist').textContent = logRows.filter(r=>r.present).length;
  $('#spont').textContent = logRows.filter(r=>r.spont).length;
  $('#logList').innerHTML = logRows.length ? logRows.map((r,i)=>{ const m = members[r.id]; return `
    <div class="mem ${r.present?'':'absent'}">${av(m)}<div class="info"><div class="name">${esc(fullName(m))} ${r.spont?'<span class="badge spont">SPONTAN</span>':''}</div>
    <div class="sub">Klasse ${m.cls} · ${r.present?'Anwesend':'Abwesend'}</div></div>
    ${r.spont?`<button class="check no" data-rm="${i}" aria-label="${esc(m.first)} entfernen"><i data-lucide="trash-2"></i></button>`:''}
    <button class="check ${r.present?'yes':'no'}" data-pres="${i}" aria-pressed="${r.present}" aria-label="${esc(m.first)} ${r.present?'als abwesend markieren':'als anwesend markieren'}"><i data-lucide="${r.present?'check':'x'}"></i></button></div>`; }).join('')
    : `<div class="empty-state" style="padding:20px 0">Kein Dienst geplant. Füge Helfer spontan hinzu.</div>`;
  $$('[data-pres]').forEach(b=>b.onclick=()=>{ const r = logRows[+b.dataset.pres]; r.present = !r.present; renderLog(); });
  $$('[data-rm]').forEach(b=>b.onclick=()=>{ logRows.splice(+b.dataset.rm,1); renderLog(); });
  const picker = $('#picker'); picker.hidden = !pickerOpen; $('#addHelper').setAttribute('aria-expanded',pickerOpen);
  if(pickerOpen){
    const ids = logRows.map(r=>r.id);
    picker.innerHTML = members.filter(m=>m.available && !ids.includes(m.id)).map(m=>`<button data-add="${m.id}">${av(m)}${esc(fullName(m))}<span class="cls">${m.cls}${m.ausb?' · AUSB':''}</span></button>`).join('');
    $$('[data-add]').forEach(b=>b.onclick=()=>{ logRows.push({id:+b.dataset.add,present:true,spont:true}); pickerOpen = false; renderLog(); });
  }
  $('#history').innerHTML = history.slice(0,5).map(h=>`<div class="hist"><span class="ico"><i data-lucide="siren"></i></span><div><div>${esc(h.type)}</div><div style="font-size:12.5px;color:var(--muted)">${fmt(parse(h.d))} · ${esc(h.place)}</div></div>
    <div class="r">Ist ${h.ist} / Soll ${h.soll}<br><span style="color:${h.ist>=h.soll?'#1E8E3E':'var(--red)'}">${h.ist>=h.soll?'vollständig':'unterbesetzt'}</span></div></div>`).join('');
  icons();
}
$('#addHelper').onclick = () => { pickerOpen = !pickerOpen; renderLog(); };
$('#logPrev').onclick = () => { logDate.setDate(logDate.getDate()-1); loadLog(); };
$('#logNext').onclick = () => { logDate.setDate(logDate.getDate()+1); loadLog(); };
$('#saveLog').onclick = () => {
  const present = logRows.filter(r=>r.present);
  if(!present.length){ toast('Mindestens eine Person muss anwesend sein', true); return; }
  present.forEach(r=>{ const m = members[r.id]; m.total++; m.year++; if(logDate.getMonth()===TODAY.getMonth()) m.month++; });
  history.unshift({d:iso(logDate),type:logType,place:$('#logPlace').value,ist:present.length,soll:logRows.filter(r=>!r.spont).length});
  save(); renderLog(); renderBars(); toast(`Gespeichert · ${present.length} Einsätze gezählt`);
};

/* ---------- Statistik ---------- */
let tf = 'all';
function renderBars(){
  const active = members.filter(m=>m.total>0);
  const vals = active.map(m=>m[tf]); const avg = vals.reduce((a,b)=>a+b,0)/vals.length || 1;
  const max = Math.max(...vals); const sd = Math.sqrt(vals.reduce((a,v)=>a+(v-avg)**2,0)/vals.length);
  const fair = Math.max(0,Math.round(100 - sd/avg*100));
  $('#summary').innerHTML = `
    <div class="stat"><i data-lucide="sigma" style="color:var(--lav)"></i><span class="lbl">Ø Dienste</span><span class="val">${avg.toFixed(1).replace('.',',')}</span></div>
    <div class="stat"><i data-lucide="flame" style="color:var(--pink)"></i><span class="lbl">Maximum</span><span class="val">${max}</span></div>
    <div class="stat"><i data-lucide="scale" style="color:var(--green)"></i><span class="lbl">Fairness</span><span class="val">${fair}<span class="trend" style="color:#A9A9A3">%</span></span></div>`;
  $('#bars').innerHTML = [...active].sort((a,b)=>b[tf]-a[tf]).map(m=>{
    const idx = Math.round(m[tf]/avg*100);
    const color = idx>=130?'var(--red)':idx>=105?'var(--orange)':'var(--green)';
    return `<div class="bar-row"><div class="top-line"><span class="n">${av(m)}${esc(fullName(m))}</span><span class="idx"><b>${idx}%</b> · ${m[tf]}</span></div>
      <div class="track" role="progressbar" aria-label="Belastungsindex ${esc(m.first)}" aria-valuenow="${idx}" aria-valuemin="0" aria-valuemax="200"><div class="fill" style="width:${Math.min(idx/2,100)}%;background:${color}"></div><span class="avgmark"></span></div></div>`;
  }).join('') + `<div class="bars-legend"><span>0%</span><span>Ø 100%</span><span>200%</span></div>`;
  $('#shiftPerson').innerHTML = members.map(m=>`<option value="${m.id}">${esc(fullName(m))} (${m.cls})</option>`).join('');
  icons();
}
$$('[data-tf]').forEach(b=>b.onclick=()=>{ tf = b.dataset.tf; $$('[data-tf]').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderBars(); });
$('#addShift').onsubmit = e => {
  e.preventDefault(); const m = members[+$('#shiftPerson').value];
  const d = parse($('#shiftDate').value);
  m.total++; if(d.getFullYear()===2026) m.year++; if(d.getMonth()===TODAY.getMonth() && d.getFullYear()===2026) m.month++;
  save(); renderBars(); toast(`Schicht für ${m.first} nachgetragen`);
};
function renderExams(){
  const lim = iso(addDays(TODAY,62));
  const list = blocks.filter(b=>b.to>=iso(TODAY) && b.from<=lim).sort((a,b)=>a.from<b.from?-1:1);
  $('#exams').innerHTML = (list.map(b=>{ const d = parse(b.from), ids = affected(b.scope);
    return `<div class="exam"><div class="dd"><b>${d.getDate()}</b><span>${MON3[d.getMonth()]}</span></div>
      <div class="inf"><div>${esc(b.type)} · ${esc(b.title)} · ${esc(scopeLabel(b.scope))}</div><div>Betroffen: ${ids.slice(0,3).map(id=>members[id].first).join(', ')}${ids.length>3?` +${ids.length-3}`:''}</div></div>
      <span class="status-pill ${ids.length>2?'bad':'warn'}">${ids.length} Sanis</span></div>`; }).join('') || '<p class="muted">Keine Sperrtage in den nächsten 2 Monaten.</p>')
    + `<button class="btn-line" style="margin-top:10px" data-new-block="">Sperrtag / Klausur eintragen</button>`;
}

/* ---------- Sheet / Settings / Toast ---------- */
function openSheet(html,refresh=null){
  sheetRefresh = refresh;
  $('#sheetBody').innerHTML = html; $('#overlay').classList.add('open'); $('#sheet').classList.add('open'); icons();
  $$('#sheet [data-close]').forEach(b=>b.onclick=closeSheet);
}
function closeSheet(){ sheetRefresh = null; $('#overlay').classList.remove('open'); $('#sheet').classList.remove('open'); }
$('#overlay').onclick = closeSheet;
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSheet(); });

document.addEventListener('click', e=>{
  const t = e.target.closest('[data-del-block],[data-new-block],[data-new-block-person],[data-open],[data-partner],[data-unpartner]');
  if(!t) return;
  if(t.dataset.delBlock){
    const b = blocks.find(x=>x.id===+t.dataset.delBlock); blocks = blocks.filter(x=>x!==b);
    save(); renderAll(); sheetRefresh?.(); toast(`Sperrtag „${b.title}“ gelöscht`);
  }else if(t.hasAttribute('data-new-block')) openBlockSheet({date:t.dataset.newBlock||undefined});
  else if(t.dataset.newBlockPerson) openBlockSheet({personId:+t.dataset.newBlockPerson});
  else if(t.dataset.open) openPerson(+t.dataset.open);
  else if(t.dataset.partner || t.dataset.unpartner){
    const id = +(t.dataset.partner || t.dataset.unpartner);
    const m = members[+$('#sheet [data-new-block-person]').dataset.newBlockPerson], p = members[id];
    if(t.dataset.partner){ if(linkPartner(m,p)){ partnerOpen = false; partnerQuery = ''; toast(`${m.first} & ${p.first} sind jetzt ein Team`); } }
    else { unlinkPartner(p); toast(`${p.first} aus dem Team entfernt`); }
    save(); renderAll(); sheetRefresh?.();
  }
});

const settingsRow = (k,t,s) => `<div class="set-row"><span>${t}<small>${s}</small></span><button class="switch" role="switch" aria-checked="${settings[k]}" data-set="${k}" aria-label="${t}"></button></div>`;
function dbInfo(){
  return `${members.length} Personen · ${teamsList().length} Teams · ${blocks.length} Sperrtage · ${Object.keys(plan).length} Plantage${lastSaved?` · gespeichert ${pad(lastSaved.getHours())}:${pad(lastSaved.getMinutes())}`:''}`;
}
function openSettings(){
  openSheet(`<h3 id="sheetTitle">Konfiguration</h3><p class="lead">Regeln für den Plan-Generator und Datenverwaltung.</p>
    <div class="set-row"><span>Sanis pro Dienst<small>Fehlende Plätze füllen Springer</small></span><div class="stepper"><button data-step="-1" aria-label="Weniger"><i data-lucide="minus"></i></button><b id="perShift">${settings.perShift}</b><button data-step="1" aria-label="Mehr"><i data-lucide="plus"></i></button></div></div>
    <div class="set-row lockrow"><span>Sperrtage & Klausuren<small>Immer hart – werden nie gelockert</small></span><i data-lucide="lock"></i></div>
    ${settingsRow('fair','Fairness-Ausgleich','Wenig belastete Teams zuerst')}
    ${settingsRow('weekday','Kein Wochentag doppelt','Pro Team und Monat')}
    ${settingsRow('friMon','Kein Fr–Mo-Doppeldienst','Keine Back-to-Back-Dienste übers Wochenende')}
    ${settingsRow('notify','Push bei Alarm','Benachrichtigung an eingeteilte Sanis')}
    <div class="sub-h">Daten</div>
    <div class="set-row"><span>Lokale Datenbank<small id="dbInfo">${dbInfo()}</small></span><span class="status-pill ok">Offline</span></div>
    <div class="export-grid">
      <button class="ex-btn" id="bkExport"><span class="ei"><i data-lucide="download"></i></span><span>Backup<small>.saniteam exportieren</small></span></button>
      <button class="ex-btn" id="bkImport"><span class="ei"><i data-lucide="upload"></i></span><span>Import<small>.saniteam laden</small></span></button>
    </div>
    <input type="file" id="bkFile" accept=".saniteam,application/json" hidden>
    <button class="btn-line" id="bkReset" style="margin-top:8px"><i data-lucide="rotate-ccw"></i>Demo-Daten zurücksetzen</button>
    <button class="btn-primary" data-close>Fertig</button>`);
  $$('[data-set]').forEach(b=>b.onclick=()=>{ settings[b.dataset.set] = !settings[b.dataset.set]; b.setAttribute('aria-checked',settings[b.dataset.set]); save(); });
  $$('[data-step]').forEach(b=>b.onclick=()=>{ settings.perShift = Math.min(3,Math.max(1,settings.perShift + +b.dataset.step)); $('#perShift').textContent = settings.perShift; save(); });
  $('#bkExport').onclick = () => deliver(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),`SaniAlarm-${iso(TODAY)}.saniteam`);
  $('#bkImport').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    try{ restore(JSON.parse(await f.text())); save(); loadLog(); renderAll(); $('#dbInfo').textContent = dbInfo(); toast('Backup importiert'); }
    catch(err){ toast(err.message||'Import fehlgeschlagen', true); }
  };
  $('#bkReset').onclick = () => { seed(); prevOpen = null; save(); loadLog(); renderAll(); $('#dbInfo').textContent = dbInfo(); toast('Demo-Daten wiederhergestellt'); };
}
$$('[data-open-settings]').forEach(b=>b.onclick=openSettings);
let tt;
function toast(msg,warn){
  const t = $('#toast'); t.querySelector('span').textContent = msg;
  t.querySelector('svg')?.style.setProperty('color',warn?'var(--red)':'var(--green)');
  t.classList.add('show'); clearTimeout(tt); tt = setTimeout(()=>t.classList.remove('show'),2400);
}

/* ---------- Navigation ---------- */
$$('[data-tab]').forEach(b=>b.onclick=()=>{
  const tab = b.dataset.tab;
  $$('[data-tab]').forEach(x=>x.toggleAttribute('aria-current',false)); b.setAttribute('aria-current','page');
  $$('.screen').forEach(s=>s.classList.toggle('active', s.id==='s-'+tab));
  $('#ctaWrap').classList.toggle('hidden', tab!=='home');
  $('#scroller').scrollTop = 0;
});
$('#prevM').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1, 1); renderCal(); icons(); };
$('#nextM').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 1); renderCal(); icons(); };
$('#todayBtn').onclick = () => { viewMonth = new Date(2026,10,1); selected = new Date(TODAY); renderCal(); };
$('#blockBtn').onclick = () => openBlockSheet({date:isSchool(selected)?iso(selected):undefined});
$('#exportBtn').onclick = openExport;

function renderAll(){ renderStats(); renderNext(); renderCal(); renderMembers(); renderBars(); renderExams(); renderLog(); icons(); }
boot(); loadLog(); renderAll(); save();
