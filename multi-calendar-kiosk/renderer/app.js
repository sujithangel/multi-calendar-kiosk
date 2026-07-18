/* Classroom Daily View - renderer logic (v1.6) */

let CONFIG = null;
let refreshTimer = null, nextRefreshAt = 0;
let lastData = {};
let refreshing = false;
let selectedDate = startOfDay(new Date());
let followToday = true;   // true while the view is tracking "today" (auto-rolls at midnight)
let roomsEditMode = false;
let cfgBackup = null;

const $ = (id) => document.getElementById(id);
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MON_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const REFRESH_OPTS = [[5,'5 min'],[15,'15 min'],[30,'30 min'],[60,'1 hour'],[240,'4 hours'],[360,'6 hours'],[480,'8 hours'],[720,'12 hours'],[1440,'24 hours']];
const DATE_FORMATS = [['ddd-d-mon-yyyy','Wed, 16 Jul 2026'],['weekday-d-month-yyyy','Wednesday, 16 July 2026'],['d-mon-yyyy','16 Jul 2026'],['dd/mm/yyyy','16/07/2026'],['mm/dd/yyyy','07/16/2026'],['yyyy-mm-dd','2026-07-16']];
const LAYOUTS = [['rows','Timeline rows'],['nownext','Now / Next split']];
const AUTO_SWITCH_OPTS = [[1,'1 min'],[2,'2 min'],[5,'5 min'],[10,'10 min'],[15,'15 min'],[30,'30 min'],[60,'1 hour']];
let autoSwitchTimer = null;
const FONTS = [['','Default (Segoe UI)'],['Georgia, serif','Georgia (serif)'],['"Times New Roman", serif','Times (serif)'],['Arial, sans-serif','Arial'],['"Trebuchet MS", sans-serif','Trebuchet'],['Verdana, sans-serif','Verdana'],['Tahoma, sans-serif','Tahoma'],['"Courier New", monospace','Courier (mono)']];
const PALETTES = {
  default:   ['#2563eb','#0891b2','#0d9488','#16a34a','#65a30d','#d97706','#ea580c','#dc2626','#db2777','#9333ea','#4f46e5','#0284c7','#7c3aed','#b45309'],
  ocean:     ['#0ea5e9','#0891b2','#0d9488','#0284c7','#2563eb','#3b82f6','#06b6d4','#14b8a6','#0369a1','#1d4ed8','#0e7490','#155e75','#1e40af','#0f766e'],
  sunset:    ['#f97316','#ea580c','#dc2626','#e11d48','#db2777','#c026d3','#f59e0b','#d97706','#b45309','#be123c','#9d174d','#a21caf','#b91c1c','#c2410c'],
  forest:    ['#16a34a','#15803d','#65a30d','#4d7c0f','#0d9488','#0f766e','#22c55e','#166534','#3f6212','#14532d','#047857','#065f46','#4ade80','#84cc16'],
  grayscale: ['#334155','#475569','#64748b','#1e293b','#52525b','#57534e','#71717a','#0f172a','#3f3f46','#44403c','#525252','#404040','#525b67','#374151'],
  vibrant:   ['#7c3aed','#db2777','#e11d2a','#f59e0b','#16a34a','#0891b2','#2563eb','#9333ea','#c026d3','#ea580c','#ca8a04','#059669','#0284c7','#4f46e5'],
  pastel:    ['#6b8fd6','#5fb3b3','#57b58a','#7cb342','#b9a13e','#d1873f','#d97b66','#d16a7c','#c471a8','#9b7fd1','#7b78d6','#5b9bd1','#a06fd1','#c08a4a'],
  jewel:     ['#1e40af','#0e7490','#047857','#4d7c0f','#a16207','#b45309','#c2410c','#b91c1c','#be123c','#9d174d','#86198f','#6b21a8','#5b21b6','#3730a3'],
  candy:     ['#ff6b6b','#f06595','#cc5de8','#845ef7','#5c7cfa','#339af0','#22b8cf','#20c997','#51cf66','#94d82d','#fcc419','#ff922b','#ff8787','#e64980'],
  neon:      ['#22d3ee','#a3e635','#facc15','#fb923c','#f472b6','#c084fc','#818cf8','#38bdf8','#34d399','#fbbf24','#f87171','#e879f9','#60a5fa','#4ade80']
};
const THEMES = {
  light:    { label:'Light',     dark:false, bg:'#f4f6fb', surface:'#ffffff', surface2:'#f8fafc', border:'#eef2f7', border2:'#e5e7eb', text:'#0f172a', textSoft:'#64748b', textMuted:'#94a3b8', heading:'#0f172a', h1bg:'#ffffff', h2bg:'#ffffff' },
  dark:     { label:'Dark',      dark:true,  bg:'#0b1220', surface:'#111c31', surface2:'#16233a', border:'#1f2d47', border2:'#243350', text:'#e5edf8', textSoft:'#9fb1cc', textMuted:'#7488a8', heading:'#f1f5f9', h1bg:'#111c31', h2bg:'#0e1830' },
  midnight: { label:'Midnight',  dark:true,  bg:'#0b1220', surface:'#14223b', surface2:'#1b2c49', border:'#23324e', border2:'#2b3d5c', text:'#e5edf8', textSoft:'#9fb1cc', textMuted:'#7d92b3', heading:'#e5edf8', h1bg:'#111c31', h2bg:'#0e1830' },
  paper:    { label:'Paper',     dark:false, bg:'#f4efe4', surface:'#fffdf8', surface2:'#efe9db', border:'#e4dccc', border2:'#d8cfba', text:'#2b2620', textSoft:'#6b6252', textMuted:'#8a8070', heading:'#2b2620', h1bg:'#fffdf8', h2bg:'#efe9db' },
  slatepro: { label:'Slate Pro', dark:false, bg:'#eef1f5', surface:'#ffffff', surface2:'#f6f8fb', border:'#e2e8f0', border2:'#d7dee7', text:'#1e293b', textSoft:'#64748b', textMuted:'#94a3b8', heading:'#1e293b', h1bg:'#ffffff', h2bg:'#f6f8fb' },
  forest:   { label:'Forest',    dark:true,  bg:'#0c1f16', surface:'#143327', surface2:'#1a4030', border:'#244a38', border2:'#2d5a45', text:'#e6f2ea', textSoft:'#a8c9b8', textMuted:'#8fb3a0', heading:'#e6f2ea', h1bg:'#10291d', h2bg:'#0e2419' },
  contrast: { label:'Contrast',  dark:true,  bg:'#000000', surface:'#161616', surface2:'#1f1f1f', border:'#2a2a2a', border2:'#3a3a3a', text:'#ffffff', textSoft:'#c8c8c8', textMuted:'#9a9a9a', heading:'#ffffff', h1bg:'#0b0b0b', h2bg:'#111111' }
};
const DEFAULT_FONTS = { heading:22, caption:13, timeline:16, roomName:20, sessionTitle:14, sessionDetail:11 };

function pad(n){ return n<10?'0'+n:''+n; }
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isTodaySelected(){ return selectedDate.getTime()===startOfDay(new Date()).getTime(); }
function toISODate(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function parseHour(s,f){ const m=/^(\d{1,2}):(\d{2})$/.exec(s||''); return m?(+m[1]+(+m[2])/60):f; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }

function formatTime(dt){ let h=dt.getHours(),m=dt.getMinutes(); if((CONFIG.settings.timeFormat||'24')==='12'){const ap=h>=12?'PM':'AM';return (h%12||12)+':'+pad(m)+' '+ap;} return pad(h)+':'+pad(m); }
function fmtHourFloat(h){ const d=new Date(); d.setHours(Math.floor(h),Math.round((h-Math.floor(h))*60),0,0); return formatTime(d); }
function axisHourLabel(h){ if((CONFIG.settings.timeFormat||'24')==='12'){const ap=h>=12?'pm':'am';return (h%12||12)+' '+ap;} return String(h); }
function formatDate(dt){
  const key=CONFIG.settings.dateFormat||'ddd-d-mon-yyyy';
  const d=dt.getDate(),mo=dt.getMonth(),y=dt.getFullYear(),dow=dt.getDay();
  switch(key){
    case 'weekday-d-month-yyyy': return DAYS_LONG[dow]+', '+d+' '+MON_LONG[mo]+' '+y;
    case 'd-mon-yyyy': return d+' '+MON_SHORT[mo]+' '+y;
    case 'dd/mm/yyyy': return pad(d)+'/'+pad(mo+1)+'/'+y;
    case 'mm/dd/yyyy': return pad(mo+1)+'/'+pad(d)+'/'+y;
    case 'yyyy-mm-dd': return y+'-'+pad(mo+1)+'-'+pad(d);
    default: return DAYS_SHORT[dow]+', '+d+' '+MON_SHORT[mo]+' '+y;
  }
}

/* Prefix matcher from editable Settings list */
function titleRegex(){
  const raw=(CONFIG.settings.titlePrefixes||'').split(',').map(s=>s.trim().replace(/\.+$/,'')).filter(Boolean);
  if(!raw.length) return null;
  const esc=raw.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  try { return new RegExp('\\b('+esc.join('|')+')\\b\\.?','i'); } catch(e){ return null; }
}
function parseSession(title,sub){
  const re=titleRegex(); const m=re?re.exec(title||''):null;
  if(m&&m.index>0){ const heading=title.slice(m.index).trim(); const before=title.slice(0,m.index).trim().replace(/[-–—•|,]\s*$/,'').trim(); return {heading,detail:before||sub||'',emphasize:true,subheading:!!before}; }
  if(m&&m.index===0){ return {heading:title.trim(),detail:sub||'',emphasize:true,subheading:false}; }
  return {heading:(title||'').trim(),detail:sub||'',emphasize:false,subheading:false};
}

function iconFor(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h8a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M5 19h14"/><circle cx="13" cy="12" r="1" fill="#fff" stroke="none"/></svg>';
}

/* ICS parsing for a date */
function expandEventsForDate(text,date){
  const out=[]; const comp=new ICAL.Component(ICAL.parse(text)); const vevents=comp.getAllSubcomponents('vevent');
  const dayStart=startOfDay(date), dayEnd=addDays(dayStart,1);
  const rStart=ICAL.Time.fromJSDate(dayStart,false), rEnd=ICAL.Time.fromJSDate(dayEnd,false);
  for(const ve of vevents){
    let ev; try{ ev=new ICAL.Event(ve); }catch(e){ continue; }
    const title=ev.summary||'(busy)'; const loc=ev.location||''; let organizer='';
    try{ const o=ve.getFirstPropertyValue('organizer'); if(o) organizer=String(o).replace(/^mailto:/i,''); }catch(e){}
    const sub=loc||organizer||'';
    if(ev.isRecurring()){
      let iter; try{ iter=ev.iterator(); }catch(e){ continue; }
      let next,guard=0;
      while((next=iter.next())&&guard++<1200){ if(next.compare(rEnd)>=0) break; let d; try{ d=ev.getOccurrenceDetails(next); }catch(e){ continue; } if(d.endDate.compare(rStart)<=0) continue; push(out,d.startDate.toJSDate(),d.endDate.toJSDate(),title,sub,dayStart,dayEnd); }
    } else {
      const s=ev.startDate.toJSDate(); const e=ev.endDate?ev.endDate.toJSDate():new Date(s.getTime()+3600000); push(out,s,e,title,sub,dayStart,dayEnd);
    }
  }
  out.sort((a,b)=>a.start-b.start); return out;
}
function push(out,s,e,title,sub,dayStart,dayEnd){ if(e<=dayStart||s>=dayEnd) return; out.push({start:s<dayStart?new Date(dayStart):s,end:e>dayEnd?new Date(dayEnd):e,title,sub}); }

/* fetch */
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function fetchWithRetry(url,retries){ let last={ok:false,error:'unknown'}; for(let a=0;a<=retries;a++){ try{ last=await window.kiosk.fetchIcs(url); }catch(e){ last={ok:false,error:e.message}; } if(last.ok) return last; if(a<retries) await sleep(2000); } return last; }
async function refreshAll(){
  if(refreshing) return; refreshing=true;
  try{
    let i=0;
    await Promise.all(CONFIG.calendars.map(async (r)=>{
      if(!r.url||!r.url.trim()){ lastData[r.name]={events:[],online:false,configured:false}; return; }
      await sleep((i++)*300); const prev=lastData[r.name]||{}; const res=await fetchWithRetry(r.url,1);
      if(!res.ok){ lastData[r.name]={raw:prev.raw,events:prev.events||[],online:false,configured:true,error:res.error,stale:true}; return; }
      try{ lastData[r.name]={raw:res.text,events:expandEventsForDate(res.text,selectedDate),online:true,configured:true}; }
      catch(e){ lastData[r.name]={raw:res.text,events:prev.events||[],online:false,configured:true,error:'Parse error',stale:true}; }
      render();
    }));
  } finally { refreshing=false; }
  render(); resetCountdown();
}
function recomputeFromCache(){ for(const r of CONFIG.calendars){ const d=lastData[r.name]; if(d&&d.raw){ try{ d.events=expandEventsForDate(d.raw,selectedDate); }catch(e){} } } }

/* render */
function visibleRooms(){ const hidden=new Set(CONFIG.settings.hiddenRooms||[]); return CONFIG.calendars.filter(r=>r.enabled!==false&&!hidden.has(r.name)); }
function clamp(v){ return Math.max(0,Math.min(100,v)); }
function gaps(events,H0,H1){ const res=[]; let cursor=H0; const sorted=events.map(e=>({s:e.start.getHours()+e.start.getMinutes()/60,e:e.end.getHours()+e.end.getMinutes()/60})).sort((a,b)=>a.s-b.s); for(const e of sorted){ if(e.s>cursor+0.08) res.push({s:cursor,e:Math.min(e.s,H1)}); cursor=Math.max(cursor,e.e); } if(cursor<H1-0.08) res.push({s:cursor,e:H1}); return res; }

function computeStats(){
  const now=new Date(); const today=isTodaySelected();
  let cOnline=0,cOffline=0,cBusy=0,cFree=0,cConfigured=0;
  for(const r of CONFIG.calendars){
    const d=lastData[r.name]||{events:[],online:false,configured:!!(r.url&&r.url.trim())};
    const hasData=d.online||(d.events&&d.events.length);
    if(d.configured) cConfigured++; if(d.online) cOnline++; else if(d.configured) cOffline++;
    const busyNow=today&&hasData&&d.events.some(e=>now>=e.start&&now<e.end);
    if(today&&hasData){ if(busyNow) cBusy++; else cFree++; }
  }
  return {cOnline,cOffline,cBusy,cFree,cConfigured};
}

function render(){
  const layout=CONFIG.settings.layout||'rows';
  if(layout==='nownext') renderNowNext(); else renderRows();
  const s=computeStats();
  $('stTotal').textContent=CONFIG.calendars.length;
  $('stOnline').textContent=s.cOnline; $('stOffline').textContent=s.cOffline; $('stBusy').textContent=s.cBusy; $('stFree').textContent=s.cFree;
  $('onlineCount').textContent=s.cOnline+' / '+s.cConfigured+' online';
  $('onlineCount').style.color=(s.cOffline===0&&s.cConfigured>0)?'#16a34a':(s.cConfigured===0?'var(--text-muted)':'#e11d2a');
  updateNowLine();
}

function renderRows(){
  const H0=parseHour(CONFIG.settings.dayStart,8),H1=parseHour(CONFIG.settings.dayEnd,18),span=Math.max(1,H1-H0);
  const now=new Date(),today=isTodaySelected();
  const nowH=now.getHours()+now.getMinutes()/60, nowInRange=today&&nowH>=H0&&nowH<=H1, nowPct=clamp((nowH-H0)/span*100);
  let html='';
  for(const r of visibleRooms()){
    const d=lastData[r.name]||{events:[],online:false,configured:!!(r.url&&r.url.trim())};
    const hasEvents=d.events&&d.events.length; const dotCls=!d.configured?'na':(d.online?'on':'off');
    const rowBusy=today&&hasEvents&&d.events.some(e=>now>=e.start&&now<e.end);
    let track='';
    if(!d.configured||(!d.online&&!hasEvents)){ const err=(d.configured&&d.error)?' — '+escapeHtml(d.error):''; track=`<div class="empty" style="color:${r.color}">${d.configured?('Offline'+err):'No Calendar Available'}</div>`; }
    else if(!hasEvents){ track=`<div class="empty" style="color:${r.color}">No Sessions Today</div>`; }
    else {
      for(const g of gaps(d.events,H0,H1)){ const l=clamp((g.s-H0)/span*100),w=clamp((g.e-H0)/span*100)-l; if(w<2.5) continue; track+=`<div class="block free" style="left:${l}%;width:${w}%;color:${r.color}"><div class="bt">${fmtHourFloat(g.s)} - ${fmtHourFloat(g.e)}</div><div class="bn">Free</div></div>`; }
      for(const ev of d.events){ const sH=ev.start.getHours()+ev.start.getMinutes()/60,eH=ev.end.getHours()+ev.end.getMinutes()/60; const l=clamp((sH-H0)/span*100),w=clamp((eH-H0)/span*100)-l; if(w<=0) continue; const isLive=today&&now>=ev.start&&now<ev.end; const ipTxt=(CONFIG.settings.inProgress&&CONFIG.settings.inProgress.text)||'in progress...'; const live=isLive?`<div class="live-top"><span class="live-dot"></span>${escapeHtml(ipTxt)}</div>`:''; const ps=parseSession(ev.title,ev.sub); track+=`<div class="block${isLive?' live-block':''}" style="left:${l}%;width:${w}%;background:${r.color};">${live}<div class="bt">${formatTime(ev.start)} - ${formatTime(ev.end)}</div><div class="bn${ps.emphasize?' bn-lg':''}">${escapeHtml(ps.heading)}</div>${ps.detail?`<div class="bp${ps.subheading?' bp-lg':''}">${escapeHtml(ps.detail)}</div>`:''}</div>`; }
    }
    if(nowInRange) track+=`<div class="rownow" style="left:${nowPct}%;"></div>`;
    html+=`<div class="row${rowBusy?' busy-now':''}"><div class="row-head"><div class="room-tile" style="background:${r.color};">${iconFor()}</div><div class="room-name">${escapeHtml(r.name)}</div><span class="room-dot ${dotCls}"></span></div><div class="track">${track}</div><div class="kebab">⋮</div></div>`;
  }
  $('rows').innerHTML=html||'<div style="padding:24px;color:var(--text-muted);">All rooms hidden. Press F10 for settings.</div>';
}

function renderNowNext(){
  const now=new Date(), today=isTodaySelected();
  const nowItems=[], nextItems=[];
  for(const r of visibleRooms()){
    const d=lastData[r.name]||{events:[]}; const evs=d.events||[];
    const cur=today?evs.find(e=>now>=e.start&&now<e.end):null;
    const ref=today?now:startOfDay(selectedDate);
    const next=evs.find(e=>e.start>ref);
    if(cur) nowItems.push({r,ev:cur,live:true});
    else if(next) nextItems.push({r,ev:next,live:false});
  }
  function item(o){
    const ps=parseSession(o.ev.title,o.ev.sub);
    const live=o.live?'<span class="live" style="color:#ef4444;background:transparent;padding:0;"><span class="live-dot"></span></span> ':'';
    return `<div class="nn-item"><div class="swatch" style="background:${o.r.color}">${iconFor()}</div>
      <div class="nn-room">${escapeHtml(o.r.name)}</div>
      <div class="nn-body"><div class="nn-name${ps.emphasize?' big':''}">${live}${escapeHtml(ps.heading)}</div>${ps.detail?`<div class="nn-sub${ps.subheading?' big':''}">${escapeHtml(ps.detail)}</div>`:''}</div>
      <div class="nn-time">${formatTime(o.ev.start)}–${formatTime(o.ev.end)}</div></div>`;
  }
  const nowHtml=nowItems.length?nowItems.map(item).join(''):'<div class="nn-empty">No sessions running right now.</div>';
  const nextHtml=nextItems.length?nextItems.map(item).join(''):'<div class="nn-empty">Nothing else scheduled.</div>';
  $('rows').innerHTML=`<div class="nn-wrap">
    <div class="nn-sec" style="flex:1;"><div class="nn-title now"><span class="live-dot"></span>In session now (${nowItems.length})</div><div class="nn-list">${nowHtml}</div></div>
    <div class="nn-sec" style="flex:1;"><div class="nn-title next">▸ Starting next (${nextItems.length})</div><div class="nn-list">${nextHtml}</div></div>
  </div>`;
}

/* time axis + now line */
function buildAxis(){
  const H0=Math.round(parseHour(CONFIG.settings.dayStart,8)),H1=Math.round(parseHour(CONFIG.settings.dayEnd,18)),span=Math.max(1,H1-H0);
  let html='';
  for(let h=H0;h<=H1;h++){ const L=(h-H0)/span*100; html+=`<div class="hr" style="left:${L}%;">${axisHourLabel(h)}</div><div class="tick" style="left:${L}%;"></div>`; if(h<H1) html+=`<div class="tick half" style="left:${(h+0.5-H0)/span*100}%;"></div>`; }
  $('axisHours').innerHTML=html; updateNowLine();
}
function updateNowLine(){
  const nt=$('nowTag'), axis=$('axisHours');
  const H0=parseHour(CONFIG.settings.dayStart,8),H1=parseHour(CONFIG.settings.dayEnd,18),span=Math.max(1,H1-H0);
  const n=new Date(),nowH=n.getHours()+n.getMinutes()/60;
  const show=(CONFIG.settings.layout||'rows')==='rows'&&isTodaySelected()&&nowH>=H0&&nowH<=H1;
  const pct=Math.max(0,Math.min(100,(nowH-H0)/span*100));
  document.querySelectorAll('.track .rownow').forEach(el=>{ el.style.left=pct+'%'; el.style.display=show?'':'none'; });
  if(nt){ if(!show){ nt.classList.add('hidden'); return; } if(nt.parentElement!==axis&&axis) axis.appendChild(nt); nt.style.left=pct+'%'; nt.textContent=formatTime(n); nt.classList.remove('hidden'); }
}

/* theme / header / fonts / palette / layout */
function applyFonts(){ const f=Object.assign({},DEFAULT_FONTS,CONFIG.settings.fonts||{}); const s=document.documentElement.style;
  s.setProperty('--fs-heading',f.heading+'px'); s.setProperty('--fs-caption',f.caption+'px'); s.setProperty('--fs-timeline',f.timeline+'px');
  s.setProperty('--fs-roomname',f.roomName+'px'); s.setProperty('--fs-session-title',f.sessionTitle+'px'); s.setProperty('--fs-session-detail',f.sessionDetail+'px'); }
function applyTheme(){
  const t=THEMES[CONFIG.settings.theme]||THEMES.light; const s=document.documentElement.style;
  s.setProperty('--bg',t.bg); s.setProperty('--surface',t.surface); s.setProperty('--surface-2',t.surface2);
  s.setProperty('--border',t.border); s.setProperty('--border-2',t.border2);
  s.setProperty('--text',t.text); s.setProperty('--text-soft',t.textSoft); s.setProperty('--text-muted',t.textMuted); s.setProperty('--heading-color',t.heading);
  document.body.classList.toggle('dark',!!t.dark); document.body.classList.toggle('bold-text',!!CONFIG.settings.boldText);
  applyHeader();
  const b=document.body.style;
  if(CONFIG.settings.textColor) b.setProperty('--text',CONFIG.settings.textColor); else b.removeProperty('--text');
  if(CONFIG.settings.dateColor) b.setProperty('--date-color',CONFIG.settings.dateColor); else b.removeProperty('--date-color');
  const ip=CONFIG.settings.inProgress||{};
  if(ip.color) b.setProperty('--ip-color',ip.color); else b.removeProperty('--ip-color');
  if(ip.bg) b.setProperty('--ip-bg',ip.bg); else b.removeProperty('--ip-bg');
  if(ip.size) b.setProperty('--ip-size',ip.size+'px'); else b.removeProperty('--ip-size');
}
function applyHeader(){
  const s=document.documentElement.style; const t=THEMES[CONFIG.settings.theme]||THEMES.light;
  const h1=CONFIG.settings.header1||{}, h2=CONFIG.settings.header2||{};
  s.setProperty('--h1-bg', h1.bg || t.h1bg);
  s.setProperty('--h2-bg', h2.bg || t.h2bg);
  s.setProperty('--h1-color', h1.color || 'var(--heading-color)');
  s.setProperty('--h2-color', h2.color || 'var(--text)');
  s.setProperty('--h1-size', h1.size ? h1.size+'px' : 'var(--fs-heading)');
  s.setProperty('--h2-size', h2.size ? h2.size+'px' : 'var(--fs-caption)');
  s.setProperty('--h1-font', h1.font || 'inherit');
  s.setProperty('--h2-font', h2.font || 'inherit');
}
function applyPalette(name){ const pal=PALETTES[name]||PALETTES.default; CONFIG.calendars.forEach((r,i)=>{ r.color=pal[i%pal.length]; }); }
/* Auto-switch theme rotation (fade handled by CSS transitions) */
function startAutoSwitch(){
  if(autoSwitchTimer){ clearInterval(autoSwitchTimer); autoSwitchTimer=null; }
  const list=(CONFIG.settings.autoSwitchThemes||[]).filter(t=>THEMES[t]);
  if(!CONFIG.settings.autoSwitch || list.length<2) return;
  const mins=parseInt(CONFIG.settings.autoSwitchMinutes,10)||15;
  autoSwitchTimer=setInterval(()=>{
    const cur=CONFIG.settings.theme; let idx=list.indexOf(cur); const next=list[(idx+1)%list.length];
    CONFIG.settings.theme=next; applyTheme();
    const sel=$('setTheme'); if(sel && !$('overlay').classList.contains('hidden')) sel.value=next;
  }, mins*60000);
}
function applyLayout(){ $('app').setAttribute('data-layout', CONFIG.settings.layout||'rows'); }
function applyHeadWidth(){ document.documentElement.style.setProperty('--head-w',(CONFIG.settings.headWidth||200)+'px'); positionDivider(); }

/* date navigation */
function updateDateLabel(){ $('todayDate').textContent=formatDate(selectedDate); $('datePick').value=toISODate(selectedDate); }
function goToDate(d){ selectedDate=startOfDay(d); followToday=(selectedDate.getTime()===startOfDay(new Date()).getTime()); recomputeFromCache(); updateDateLabel(); render(); }
/* Automatically roll to the new day at midnight (only while tracking today). */
function checkRollover(){
  if(followToday && selectedDate.getTime()!==startOfDay(new Date()).getTime()){
    selectedDate=startOfDay(new Date()); updateDateLabel(); recomputeFromCache(); render(); refreshAll();
  }
}

/* divider */
function positionDivider(){ const dv=$('colDivider'); if(!dv) return; const w=(CONFIG.settings.headWidth||200); dv.style.left=(w+14)+'px'; }
function setupDivider(){
  const dv=$('colDivider'), board=$('board'); if(!dv||!board) return;
  let dragging=false;
  const onMove=(e)=>{ if(!dragging) return; const rect=board.getBoundingClientRect(); let x=e.clientX-rect.left-14; x=Math.max(110,Math.min(rect.width*0.55,x)); x=Math.round(x); document.documentElement.style.setProperty('--head-w',x+'px'); dv.style.left=(x+14)+'px'; CONFIG.settings.headWidth=x; updateNowLine(); };
  const onUp=()=>{ if(!dragging) return; dragging=false; document.body.style.cursor=''; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); window.kiosk.saveConfig(CONFIG); };
  dv.addEventListener('mousedown',(e)=>{ dragging=true; document.body.style.cursor='col-resize'; window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp); e.preventDefault(); });
}

/* clock / countdown */
function tickClock(){ $('clock').textContent=formatTime(new Date()); checkRollover(); updateNowLine(); }
/* Snap back to today, then refresh (kiosk behaviour: every refresh returns to today). */
function refreshToToday(){ selectedDate=startOfDay(new Date()); followToday=true; updateDateLabel(); recomputeFromCache(); return refreshAll(); }
function scheduleRefresh(){ if(refreshTimer) clearInterval(refreshTimer); const mins=parseInt(CONFIG.settings.refreshMinutes,10)||30; refreshTimer=setInterval(refreshToToday,mins*60000); resetCountdown(); }
function resetCountdown(){ nextRefreshAt=Date.now()+(parseInt(CONFIG.settings.refreshMinutes,10)||30)*60000; }
function tickCountdown(){ const sec=Math.max(0,Math.floor((nextRefreshAt-Date.now())/1000)); $('countdown').textContent=sec>=3600?(Math.floor(sec/3600)+'h '+pad(Math.floor((sec%3600)/60))+'m'):(pad(Math.floor(sec/60))+':'+pad(sec%60)); }

/* settings */
function fillSelect(el,pairs,selected){ el.innerHTML=pairs.map(([v,l])=>`<option value="${escapeAttr(v)}"${String(v)===String(selected)?' selected':''}>${escapeHtml(l)}</option>`).join(''); }
function openSettings(){
  cfgBackup=JSON.parse(JSON.stringify(CONFIG));
  roomsEditMode=false; $('editRooms').textContent='Edit rooms'; $('addRoom').classList.add('hidden');
  switchTab('rooms'); buildRoomEditor();
  fillSelect($('setTheme'), Object.keys(THEMES).map(k=>[k,THEMES[k].label]), CONFIG.settings.theme||'light');
  fillSelect($('setLayout'), LAYOUTS, CONFIG.settings.layout||'rows');
  fillSelect($('setPalette'), Object.keys(PALETTES).map(k=>[k,k[0].toUpperCase()+k.slice(1)]), CONFIG.settings.palette||'default');
  $('autoSwitch').checked=!!CONFIG.settings.autoSwitch;
  fillSelect($('autoSwitchEvery'), AUTO_SWITCH_OPTS, String(CONFIG.settings.autoSwitchMinutes||15));
  buildAutoSwitchChips();
  fillSelect($('setDateFormat'), DATE_FORMATS.map(([k,ex])=>[k,ex]), CONFIG.settings.dateFormat||'ddd-d-mon-yyyy');
  fillSelect($('setRefresh2'), REFRESH_OPTS, String(CONFIG.settings.refreshMinutes||30));
  fillSelect($('h1font'), FONTS, (CONFIG.settings.header1||{}).font||'');
  fillSelect($('h2font'), FONTS, (CONFIG.settings.header2||{}).font||'');
  $('setTimeFormat').value=CONFIG.settings.timeFormat||'24';
  $('setBold').checked=!!CONFIG.settings.boldText;
  const tc=CONFIG.settings.textColor, dcol=CONFIG.settings.dateColor;
  $('autoText').checked=!tc; $('setTextColor').value=tc||'#0f172a'; $('setTextColor').disabled=!tc;
  $('autoDate').checked=!dcol; $('setDateColor').value=dcol||'#e11d2a'; $('setDateColor').disabled=!dcol;
  // header rows
  const h1=CONFIG.settings.header1||{}, h2=CONFIG.settings.header2||{};
  $('autoH1bg').checked=!h1.bg; $('h1bg').value=h1.bg||'#ffffff'; $('h1bg').disabled=!h1.bg;
  $('autoH1color').checked=!h1.color; $('h1color').value=h1.color||'#0f172a'; $('h1color').disabled=!h1.color;
  $('h1size').value=h1.size||'';
  $('autoH2bg').checked=!h2.bg; $('h2bg').value=h2.bg||'#ffffff'; $('h2bg').disabled=!h2.bg;
  $('autoH2color').checked=!h2.color; $('h2color').value=h2.color||'#0f172a'; $('h2color').disabled=!h2.color;
  $('h2size').value=h2.size||'';
  const f=Object.assign({},DEFAULT_FONTS,CONFIG.settings.fonts||{});
  $('fsHeading').value=f.heading; $('fsCaption').value=f.caption; $('fsTimeline').value=f.timeline; $('fsRoomName').value=f.roomName; $('fsSessionTitle').value=f.sessionTitle; $('fsSessionDetail').value=f.sessionDetail;
  $('setTitlePrefixes').value=CONFIG.settings.titlePrefixes||'';
  const ip=CONFIG.settings.inProgress||{};
  $('ipText').value=ip.text||''; $('ipSize').value=ip.size||'';
  $('autoIpColor').checked=!ip.color; $('ipColor').value=ip.color||'#ffffff'; $('ipColor').disabled=!ip.color;
  $('autoIpBg').checked=!ip.bg; $('ipBg').value=ip.bg||'#3b82f6'; $('ipBg').disabled=!ip.bg;
  $('setDayStart').value=CONFIG.settings.dayStart||'08:00'; $('setDayEnd').value=CONFIG.settings.dayEnd||'18:00';
  $('setFullscreen').checked=!!CONFIG.settings.startFullscreen; $('setAutoStart').checked=!!CONFIG.settings.autoStartOnBoot;
  $('overlay').classList.remove('hidden');
}
function buildAutoSwitchChips(){
  const sel=new Set(CONFIG.settings.autoSwitchThemes||[]);
  $('autoSwitchThemes').innerHTML=Object.keys(THEMES).map(k=>`<label><input type="checkbox" data-theme="${k}" ${sel.has(k)?'checked':''}/><span class="sw" style="background:${THEMES[k].bg};border:1px solid ${THEMES[k].border2}"></span>${THEMES[k].label}</label>`).join('');
}
function closeSettings(revert){ if(revert&&cfgBackup){ CONFIG=cfgBackup; applyFonts(); applyTheme(); applyLayout(); applyHeadWidth(); buildAxis(); render(); } cfgBackup=null; $('overlay').classList.add('hidden'); }
function previewApply(){ collectSettings(); applyFonts(); applyTheme(); applyLayout(); applyHeadWidth(); buildAxis(); render(); }
function switchTab(name){ document.querySelectorAll('.stab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name)); document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==name)); }
function urlHost(u){ try{ return new URL(u.replace(/^webcal:/i,'https:')).host; }catch(e){ return u?u.slice(0,44):''; } }
function updateRoomsSummary(){ const total=CONFIG.calendars.length; const withIcs=CONFIG.calendars.filter(c=>c.url&&c.url.trim()).length; const hiddenN=(CONFIG.settings.hiddenRooms||[]).length; $('roomsSummary').textContent=`${total} rooms · ${withIcs} with ICS link · ${hiddenN} hidden`; }
function buildRoomEditor(){
  const hidden=new Set(CONFIG.settings.hiddenRooms||[]); const wrap=$('roomList'); wrap.innerHTML='';
  CONFIG.calendars.forEach((r,i)=>{
    const div=document.createElement('div');
    if(!roomsEditMode){
      const has=!!(r.url&&r.url.trim()); div.className='room-card';
      div.innerHTML=`<span class="swatch" style="background:${r.color}"></span><div class="rc-grow"><div class="rc-name">${escapeHtml(r.name)}</div><div class="rc-meta">${has?escapeHtml(urlHost(r.url)):'No ICS link set'}</div></div><span class="pill-status ${has?'ok':'no'}">${has?'ICS set':'No link'}</span><label class="rc-show"><input type="checkbox" ${hidden.has(r.name)?'':'checked'}/> Show</label>`;
      div.querySelector('input[type=checkbox]').onchange=(e)=>{ const set=new Set(CONFIG.settings.hiddenRooms||[]); if(e.target.checked) set.delete(r.name); else set.add(r.name); CONFIG.settings.hiddenRooms=[...set]; updateRoomsSummary(); render(); };
    } else {
      div.className='room-edit';
      div.innerHTML=`<input type="text" class="rname" value="${escapeAttr(r.name)}" placeholder="Room name"/><input type="text" class="rurl" value="${escapeAttr(r.url||'')}" placeholder="ICS or webcal:// URL"/><input type="color" class="rcolor" value="${r.color||'#2563eb'}"/><button class="remove-room">Delete</button>`;
      const nameI=div.querySelector('.rname'),urlI=div.querySelector('.rurl'),colI=div.querySelector('.rcolor');
      nameI.oninput=()=>{ r.name=nameI.value; }; urlI.oninput=()=>{ r.url=urlI.value.trim(); }; colI.oninput=()=>{ r.color=colI.value; render(); };
      div.querySelector('.remove-room').onclick=(e)=>{ const btn=e.target; const span=document.createElement('span'); span.className='confirm'; span.innerHTML=`Delete “${escapeHtml(r.name)}”? <button class="cfm-yes remove-room">Delete</button> <button class="cfm-no small">Cancel</button>`; btn.replaceWith(span); span.querySelector('.cfm-yes').onclick=()=>{ CONFIG.calendars.splice(i,1); buildRoomEditor(); updateRoomsSummary(); render(); }; span.querySelector('.cfm-no').onclick=()=>buildRoomEditor(); };
    }
    wrap.appendChild(div);
  });
  updateRoomsSummary();
}
function collectSettings(){
  CONFIG.settings.theme=$('setTheme').value;
  CONFIG.settings.autoSwitch=$('autoSwitch').checked;
  CONFIG.settings.autoSwitchMinutes=parseInt($('autoSwitchEvery').value,10)||15;
  CONFIG.settings.autoSwitchThemes=[...$('autoSwitchThemes').querySelectorAll('input:checked')].map(i=>i.dataset.theme);
  CONFIG.settings.layout=$('setLayout').value;
  CONFIG.settings.palette=$('setPalette').value;
  CONFIG.settings.boldText=$('setBold').checked;
  CONFIG.settings.textColor=$('autoText').checked?'':$('setTextColor').value;
  CONFIG.settings.dateColor=$('autoDate').checked?'':$('setDateColor').value;
  CONFIG.settings.header1={ bg:$('autoH1bg').checked?'':$('h1bg').value, color:$('autoH1color').checked?'':$('h1color').value, size:parseInt($('h1size').value,10)||0, font:$('h1font').value };
  CONFIG.settings.header2={ bg:$('autoH2bg').checked?'':$('h2bg').value, color:$('autoH2color').checked?'':$('h2color').value, size:parseInt($('h2size').value,10)||0, font:$('h2font').value };
  CONFIG.settings.timeFormat=$('setTimeFormat').value;
  CONFIG.settings.dateFormat=$('setDateFormat').value;
  CONFIG.settings.refreshMinutes=parseInt($('setRefresh2').value,10);
  CONFIG.settings.fonts={ heading:+$('fsHeading').value, caption:+$('fsCaption').value, timeline:+$('fsTimeline').value, roomName:+$('fsRoomName').value, sessionTitle:+$('fsSessionTitle').value, sessionDetail:+$('fsSessionDetail').value };
  CONFIG.settings.titlePrefixes=$('setTitlePrefixes').value;
  CONFIG.settings.inProgress={ text:$('ipText').value, size:parseInt($('ipSize').value,10)||0, color:$('autoIpColor').checked?'':$('ipColor').value, bg:$('autoIpBg').checked?'':$('ipBg').value };
  CONFIG.settings.dayStart=$('setDayStart').value||'08:00'; CONFIG.settings.dayEnd=$('setDayEnd').value||'18:00';
  CONFIG.settings.startFullscreen=$('setFullscreen').checked; CONFIG.settings.autoStartOnBoot=$('setAutoStart').checked;
}
function applyChrome(){ $('app').classList.toggle('hide-bottom',!!CONFIG.settings.hideBottom); $('fcBottom').classList.toggle('on',!!CONFIG.settings.hideBottom); }

/* init */
async function init(){
  CONFIG=await window.kiosk.getConfig();
  applyFonts(); applyTheme(); applyLayout(); applyHeadWidth(); applyChrome();

  $('prevDay').onclick=()=>goToDate(addDays(selectedDate,-1));
  $('nextDay').onclick=()=>goToDate(addDays(selectedDate,1));
  $('todayBtn').onclick=()=>goToDate(new Date());
  $('datePick').onchange=()=>{ const v=$('datePick').value; if(v){ const [y,m,dd]=v.split('-').map(Number); goToDate(new Date(y,m-1,dd)); } };

  $('refreshNowBtn').onclick=()=>refreshToToday();
  $('fcFull').onclick=()=>window.kiosk.toggleFullscreen();
  $('fcBottom').onclick=()=>{ CONFIG.settings.hideBottom=!CONFIG.settings.hideBottom; applyChrome(); window.kiosk.saveConfig(CONFIG); };
  $('fcSettings').onclick=()=>openSettings();

  window.kiosk.onOpenSettings(()=>openSettings());
  $('closeSettings').onclick=()=>closeSettings(true);
  document.querySelectorAll('.stab').forEach(t=>{ t.onclick=()=>switchTab(t.dataset.tab); });

  const previewIds=['setTheme','setLayout','setBold','setTextColor','setDateColor','setTimeFormat','setDateFormat',
    'h1bg','h1color','h1size','h1font','h2bg','h2color','h2size','h2font',
    'fsHeading','fsCaption','fsTimeline','fsRoomName','fsSessionTitle','fsSessionDetail','setTitlePrefixes','ipText','ipSize','ipColor','ipBg','setDayStart','setDayEnd'];
  previewIds.forEach(id=>{ const el=$(id); if(el){ el.addEventListener('change',previewApply); el.addEventListener('input',previewApply); } });
  const autoPairs=[['autoText','setTextColor'],['autoDate','setDateColor'],['autoH1bg','h1bg'],['autoH1color','h1color'],['autoH2bg','h2bg'],['autoH2color','h2color'],['autoIpColor','ipColor'],['autoIpBg','ipBg']];
  autoPairs.forEach(([cb,inp])=>{ $(cb).addEventListener('change',()=>{ $(inp).disabled=$(cb).checked; previewApply(); }); });
  $('setPalette').addEventListener('change',()=>{ applyPalette($('setPalette').value); previewApply(); });

  $('editRooms').onclick=()=>{ roomsEditMode=!roomsEditMode; $('editRooms').textContent=roomsEditMode?'Done editing':'Edit rooms'; $('addRoom').classList.toggle('hidden',!roomsEditMode); buildRoomEditor(); };
  $('addRoom').onclick=()=>{ CONFIG.calendars.push({name:'New room',url:'',color:'#2563eb',enabled:true}); buildRoomEditor(); };
  $('applyPalette').onclick=()=>{ applyPalette($('setPalette').value); buildRoomEditor(); render(); };
  $('fsToggle').onclick=()=>window.kiosk.toggleFullscreen();
  $('quitApp').onclick=()=>window.kiosk.quit();

  $('resetDefault').onclick=()=>{ const bak=cfgBackup; Object.assign(CONFIG.settings,{ fonts:Object.assign({},DEFAULT_FONTS), palette:'default', theme:'light', autoSwitch:false, autoSwitchThemes:['light','dark','midnight'], autoSwitchMinutes:15, layout:'rows', headWidth:200, boldText:false, header1:{bg:'',color:'',size:0,font:''}, header2:{bg:'',color:'',size:0,font:''}, textColor:'', dateColor:'', titlePrefixes:'Dr., Prof., Mr., Ms., Miss, Mrs.', inProgress:{text:'in progress...',color:'',size:0,bg:''}, timeFormat:'24', dateFormat:'ddd-d-mon-yyyy', dayStart:'08:00', dayEnd:'18:00', refreshMinutes:30 }); applyPalette('default'); applyFonts(); applyTheme(); applyLayout(); applyHeadWidth(); openSettings(); cfgBackup=bak; buildAxis(); render(); };

  $('saveSettings').onclick=async ()=>{ collectSettings(); await window.kiosk.saveConfig(CONFIG); closeSettings(false); applyFonts(); applyTheme(); applyLayout(); applyHeadWidth(); buildAxis(); scheduleRefresh(); startAutoSwitch(); await refreshAll(); };

  setupDivider();
  window.addEventListener('resize',()=>{ updateNowLine(); positionDivider(); });

  buildAxis(); updateDateLabel(); tickClock();
  setInterval(tickClock,10000); setInterval(render,60000); setInterval(tickCountdown,1000);
  scheduleRefresh(); startAutoSwitch(); await refreshAll();
}
init();
