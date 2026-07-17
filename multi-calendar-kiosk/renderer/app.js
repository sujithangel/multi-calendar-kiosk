/* Classroom Daily View - renderer logic */

let CONFIG = null;
let refreshTimer = null, nextRefreshAt = 0;
let lastData = {};          // name -> { raw, events, online, configured, error }
let refreshing = false;
let selectedDate = startOfDay(new Date());
let roomsEditMode = false;

const $ = (id) => document.getElementById(id);
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MON_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const REFRESH_OPTS = [[5,'5 min'],[15,'15 min'],[30,'30 min'],[60,'1 hour'],[240,'4 hours'],[360,'6 hours'],[480,'8 hours'],[720,'12 hours'],[1440,'24 hours']];
const DATE_FORMATS = [
  ['ddd-d-mon-yyyy','Wed, 16 Jul 2026'],['weekday-d-month-yyyy','Wednesday, 16 July 2026'],
  ['d-mon-yyyy','16 Jul 2026'],['dd/mm/yyyy','16/07/2026'],['mm/dd/yyyy','07/16/2026'],['yyyy-mm-dd','2026-07-16']
];
const PALETTES = {
  default:   ['#2563eb','#0891b2','#0d9488','#16a34a','#65a30d','#d97706','#ea580c','#dc2626','#db2777','#9333ea','#4f46e5','#0284c7','#7c3aed','#b45309'],
  ocean:     ['#0ea5e9','#0891b2','#0d9488','#0284c7','#2563eb','#3b82f6','#06b6d4','#14b8a6','#0369a1','#1d4ed8','#0e7490','#155e75','#1e40af','#0f766e'],
  sunset:    ['#f97316','#ea580c','#dc2626','#e11d48','#db2777','#c026d3','#f59e0b','#d97706','#b45309','#be123c','#9d174d','#a21caf','#b91c1c','#c2410c'],
  forest:    ['#16a34a','#15803d','#65a30d','#4d7c0f','#0d9488','#0f766e','#22c55e','#166534','#3f6212','#14532d','#047857','#065f46','#4ade80','#84cc16'],
  grayscale: ['#334155','#475569','#64748b','#1e293b','#52525b','#57534e','#71717a','#0f172a','#3f3f46','#44403c','#525252','#404040','#525b67','#374151'],
  vibrant:   ['#7c3aed','#db2777','#e11d2a','#f59e0b','#16a34a','#0891b2','#2563eb','#9333ea','#c026d3','#ea580c','#ca8a04','#059669','#0284c7','#4f46e5']
};
const DEFAULT_FONTS = { heading:22, caption:13, timeline:16, roomName:20, sessionTitle:14, sessionDetail:11 };

function pad(n){ return n < 10 ? '0' + n : '' + n; }
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function isTodaySelected(){ return selectedDate.getTime() === startOfDay(new Date()).getTime(); }
function toISODate(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function parseHour(s, f){ const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1] + (+m[2])/60) : f; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }

/* ---- formatting ---- */
function formatTime(dt){
  let h = dt.getHours(), m = dt.getMinutes();
  if ((CONFIG.settings.timeFormat || '24') === '12'){ const ap = h>=12?'PM':'AM'; return (h%12||12) + ':' + pad(m) + ' ' + ap; }
  return pad(h) + ':' + pad(m);
}
function fmtHourFloat(h){ const d = new Date(); d.setHours(Math.floor(h), Math.round((h-Math.floor(h))*60), 0, 0); return formatTime(d); }
function axisHourLabel(h){
  if ((CONFIG.settings.timeFormat || '24') === '12'){ const ap = h>=12?'pm':'am'; return (h%12||12) + ' ' + ap; }
  return String(h);
}
function formatDate(dt){
  const key = CONFIG.settings.dateFormat || 'ddd-d-mon-yyyy';
  const d = dt.getDate(), mo = dt.getMonth(), y = dt.getFullYear(), dow = dt.getDay();
  switch(key){
    case 'weekday-d-month-yyyy': return DAYS_LONG[dow] + ', ' + d + ' ' + MON_LONG[mo] + ' ' + y;
    case 'd-mon-yyyy': return d + ' ' + MON_SHORT[mo] + ' ' + y;
    case 'dd/mm/yyyy': return pad(d) + '/' + pad(mo+1) + '/' + y;
    case 'mm/dd/yyyy': return pad(mo+1) + '/' + pad(d) + '/' + y;
    case 'yyyy-mm-dd': return y + '-' + pad(mo+1) + '-' + pad(d);
    default: return DAYS_SHORT[dow] + ', ' + d + ' ' + MON_SHORT[mo] + ' ' + y;
  }
}

/* ---- room icon (door) ---- */
function iconFor(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M7 3h8a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M5 19h14"/>'
    + '<circle cx="13" cy="12" r="1" fill="#fff" stroke="none"/></svg>';
}

/* ---- ICS parsing for a given date ---- */
function expandEventsForDate(text, date){
  const out = [];
  const comp = new ICAL.Component(ICAL.parse(text));
  const vevents = comp.getAllSubcomponents('vevent');
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  const rStart = ICAL.Time.fromJSDate(dayStart, false);
  const rEnd = ICAL.Time.fromJSDate(dayEnd, false);

  for (const ve of vevents){
    let ev; try { ev = new ICAL.Event(ve); } catch(e){ continue; }
    const title = ev.summary || '(busy)';
    const loc = ev.location || '';
    let organizer = '';
    try { const o = ve.getFirstPropertyValue('organizer'); if (o) organizer = String(o).replace(/^mailto:/i,''); } catch(e){}
    const sub = loc || organizer || '';

    if (ev.isRecurring()){
      let iter; try { iter = ev.iterator(); } catch(e){ continue; }
      let next, guard = 0;
      while ((next = iter.next()) && guard++ < 1200){
        if (next.compare(rEnd) >= 0) break;
        let d; try { d = ev.getOccurrenceDetails(next); } catch(e){ continue; }
        if (d.endDate.compare(rStart) <= 0) continue;
        push(out, d.startDate.toJSDate(), d.endDate.toJSDate(), title, sub, dayStart, dayEnd);
      }
    } else {
      const s = ev.startDate.toJSDate();
      const e = ev.endDate ? ev.endDate.toJSDate() : new Date(s.getTime()+3600000);
      push(out, s, e, title, sub, dayStart, dayEnd);
    }
  }
  out.sort((a,b) => a.start - b.start);
  return out;
}
function push(out, s, e, title, sub, dayStart, dayEnd){
  if (e <= dayStart || s >= dayEnd) return;
  out.push({ start: s < dayStart ? new Date(dayStart) : s, end: e > dayEnd ? new Date(dayEnd) : e, title, sub });
}

/* ---- fetch ---- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchWithRetry(url, retries){
  let last = { ok:false, error:'unknown' };
  for (let a=0; a<=retries; a++){
    try { last = await window.kiosk.fetchIcs(url); } catch(e){ last = { ok:false, error:e.message }; }
    if (last.ok) return last;
    if (a < retries) await sleep(2000);
  }
  return last;
}
async function refreshAll(){
  if (refreshing) return;
  refreshing = true;
  try {
    let i = 0;
    await Promise.all(CONFIG.calendars.map(async (r) => {
      if (!r.url || !r.url.trim()){ lastData[r.name] = { events:[], online:false, configured:false }; return; }
      await sleep((i++) * 300);
      const prev = lastData[r.name] || {};
      const res = await fetchWithRetry(r.url, 1);
      if (!res.ok){ lastData[r.name] = { raw: prev.raw, events: prev.events || [], online:false, configured:true, error:res.error, stale:true }; return; }
      try { lastData[r.name] = { raw: res.text, events: expandEventsForDate(res.text, selectedDate), online:true, configured:true }; }
      catch(e){ lastData[r.name] = { raw: res.text, events: prev.events || [], online:false, configured:true, error:'Parse error', stale:true }; }
      render();
    }));
  } finally { refreshing = false; }
  render();
  resetCountdown();
}
function recomputeFromCache(){
  for (const r of CONFIG.calendars){
    const d = lastData[r.name];
    if (d && d.raw){ try { d.events = expandEventsForDate(d.raw, selectedDate); } catch(e){} }
  }
}

/* ---- render ---- */
function visibleRooms(){
  const hidden = new Set(CONFIG.settings.hiddenRooms || []);
  return CONFIG.calendars.filter(r => r.enabled !== false && !hidden.has(r.name));
}
function clamp(v){ return Math.max(0, Math.min(100, v)); }
function gaps(events, H0, H1){
  const res = []; let cursor = H0;
  const sorted = events.map(e => ({ s:e.start.getHours()+e.start.getMinutes()/60, e:e.end.getHours()+e.end.getMinutes()/60 })).sort((a,b)=>a.s-b.s);
  for (const e of sorted){ if (e.s > cursor + 0.08) res.push({ s:cursor, e:Math.min(e.s,H1) }); cursor = Math.max(cursor, e.e); }
  if (cursor < H1 - 0.08) res.push({ s:cursor, e:H1 });
  return res;
}

function render(){
  const H0 = parseHour(CONFIG.settings.dayStart, 8);
  const H1 = parseHour(CONFIG.settings.dayEnd, 18);
  const span = Math.max(1, H1 - H0);
  const now = new Date();
  const today = isTodaySelected();
  const rooms = visibleRooms();

  let cOnline=0, cOffline=0, cBusy=0, cFree=0, cConfigured=0;
  for (const r of CONFIG.calendars){
    const d = lastData[r.name] || { events:[], online:false, configured:!!(r.url&&r.url.trim()) };
    const hasData = d.online || (d.events && d.events.length);
    if (d.configured) cConfigured++;
    if (d.online) cOnline++; else if (d.configured) cOffline++;
    const busyNow = today && hasData && d.events.some(e => now >= e.start && now < e.end);
    if (today && hasData){ if (busyNow) cBusy++; else cFree++; }
  }

  let html = '';
  for (const r of rooms){
    const d = lastData[r.name] || { events:[], online:false, configured:!!(r.url&&r.url.trim()) };
    const hasEvents = d.events && d.events.length;
    const dotCls = !d.configured ? 'na' : (d.online ? 'on' : 'off');

    let track = '';
    if (!d.configured || (!d.online && !hasEvents)){
      const err = (d.configured && d.error) ? ' — ' + escapeHtml(d.error) : '';
      const label = d.configured ? ('Offline' + err) : 'No Calendar Available';
      track = `<div class="empty" style="color:${r.color}">${label}</div>`;
    } else if (!hasEvents){
      track = `<div class="empty" style="color:${r.color}">No Sessions Today</div>`;
    } else {
      for (const g of gaps(d.events, H0, H1)){
        const l = clamp((g.s-H0)/span*100), w = clamp((g.e-H0)/span*100) - l;
        if (w < 2.5) continue;
        track += `<div class="block free" style="left:${l}%;width:${w}%;color:${r.color}">
          <div class="bt">${fmtHourFloat(g.s)} - ${fmtHourFloat(g.e)}</div><div class="bn">Free</div></div>`;
      }
      for (const ev of d.events){
        const sH = ev.start.getHours()+ev.start.getMinutes()/60;
        const eH = ev.end.getHours()+ev.end.getMinutes()/60;
        const l = clamp((sH-H0)/span*100), w = clamp((eH-H0)/span*100) - l;
        if (w <= 0) continue;
        const live = (today && now >= ev.start && now < ev.end) ? `<span class="live" style="color:${r.color}">LIVE</span>` : '';
        track += `<div class="block" style="left:${l}%;width:${w}%;background:${r.color};">
          ${live}<div class="bt">${formatTime(ev.start)} - ${formatTime(ev.end)}</div>
          <div class="bn">${escapeHtml(ev.title)}</div>
          ${ev.sub ? `<div class="bp">${escapeHtml(ev.sub)}</div>` : ''}</div>`;
      }
    }

    html += `<div class="row">
      <div class="row-head">
        <div class="room-tile" style="background:${r.color};">${iconFor()}</div>
        <div class="room-name">${escapeHtml(r.name)}</div>
        <span class="room-dot ${dotCls}"></span>
      </div>
      <div class="track">${track}</div>
      <div class="kebab">⋮</div>
    </div>`;
  }
  $('rows').innerHTML = html || '<div style="padding:24px;color:var(--text-muted);">All rooms hidden. Press F10 for settings.</div>';

  $('stTotal').textContent = CONFIG.calendars.length;
  $('stOnline').textContent = cOnline;
  $('stOffline').textContent = cOffline;
  $('stBusy').textContent = cBusy;
  $('stFree').textContent = cFree;
  $('onlineCount').textContent = cOnline + ' / ' + cConfigured + ' online';
  $('onlineCount').style.color = (cOffline===0 && cConfigured>0) ? '#16a34a' : (cConfigured===0 ? 'var(--text-muted)' : '#e11d2a');

  updateNowLine();
}

/* ---- time axis ---- */
function buildAxis(){
  const H0 = Math.round(parseHour(CONFIG.settings.dayStart, 8));
  const H1 = Math.round(parseHour(CONFIG.settings.dayEnd, 18));
  const span = Math.max(1, H1 - H0);
  let html = '';
  for (let h = H0; h <= H1; h++){
    const L = (h-H0)/span*100;
    html += `<div class="hr" style="left:${L}%;">${axisHourLabel(h)}</div>`;
    html += `<div class="tick" style="left:${L}%;"></div>`;
    if (h < H1) html += `<div class="tick half" style="left:${(h+0.5-H0)/span*100}%;"></div>`;
  }
  $('axisHours').innerHTML = html;
  updateNowLine();
}
function updateNowLine(){
  const nl = $('nowLine'), nt = $('nowTag');
  const board = $('board'); const track = document.querySelector('#rows .track');
  const H0 = parseHour(CONFIG.settings.dayStart, 8), H1 = parseHour(CONFIG.settings.dayEnd, 18);
  const span = Math.max(1, H1 - H0);
  const n = new Date(); const nowH = n.getHours()+n.getMinutes()/60;
  if (!board || !track || !isTodaySelected() || nowH < H0 || nowH > H1){
    if (nl) nl.classList.add('hidden'); if (nt) nt.classList.add('hidden'); return;
  }
  const br = board.getBoundingClientRect(), tr = track.getBoundingClientRect();
  const frac = Math.max(0, Math.min(1, (nowH-H0)/span));
  const x = (tr.left - br.left) + frac * tr.width;
  nl.style.left = x + 'px'; nt.style.left = x + 'px';
  nl.classList.remove('hidden'); nt.classList.remove('hidden');
  nt.textContent = formatTime(n);
}

/* ---- theme / fonts / palette ---- */
function applyFonts(){
  const f = Object.assign({}, DEFAULT_FONTS, CONFIG.settings.fonts || {});
  const s = document.documentElement.style;
  s.setProperty('--fs-heading', f.heading + 'px');
  s.setProperty('--fs-caption', f.caption + 'px');
  s.setProperty('--fs-timeline', f.timeline + 'px');
  s.setProperty('--fs-roomname', f.roomName + 'px');
  s.setProperty('--fs-session-title', f.sessionTitle + 'px');
  s.setProperty('--fs-session-detail', f.sessionDetail + 'px');
}
function applyTheme(){
  document.body.classList.toggle('dark', (CONFIG.settings.theme || 'light') === 'dark');
  document.body.classList.toggle('bold-text', !!CONFIG.settings.boldText);
  const b = document.body.style;
  if (CONFIG.settings.headingColor) b.setProperty('--heading-color', CONFIG.settings.headingColor); else b.removeProperty('--heading-color');
  if (CONFIG.settings.textColor) b.setProperty('--text', CONFIG.settings.textColor); else b.removeProperty('--text');
}
function applyPalette(name){
  const pal = PALETTES[name] || PALETTES.default;
  CONFIG.calendars.forEach((r, i) => { r.color = pal[i % pal.length]; });
}

/* ---- date navigation ---- */
function updateDateLabel(){ $('todayDate').textContent = formatDate(selectedDate); $('datePick').value = toISODate(selectedDate); }
function goToDate(d){ selectedDate = startOfDay(d); recomputeFromCache(); updateDateLabel(); render(); }

/* ---- clock / countdown ---- */
function tickClock(){ $('clock').textContent = formatTime(new Date()); updateNowLine(); }
function scheduleRefresh(){
  if (refreshTimer) clearInterval(refreshTimer);
  const mins = parseInt(CONFIG.settings.refreshMinutes,10) || 30;
  refreshTimer = setInterval(refreshAll, mins*60000);
  resetCountdown();
}
function resetCountdown(){ nextRefreshAt = Date.now() + (parseInt(CONFIG.settings.refreshMinutes,10)||30)*60000; }
function tickCountdown(){
  const sec = Math.max(0, Math.floor((nextRefreshAt - Date.now())/1000));
  $('countdown').textContent = sec >= 3600 ? (Math.floor(sec/3600)+'h '+pad(Math.floor((sec%3600)/60))+'m') : (pad(Math.floor(sec/60))+':'+pad(sec%60));
}

/* ---- settings ---- */
function fillSelect(el, pairs, selected){
  el.innerHTML = pairs.map(([v,l]) => `<option value="${escapeAttr(v)}"${String(v)===String(selected)?' selected':''}>${escapeHtml(l)}</option>`).join('');
}
function openSettings(){
  roomsEditMode = false;
  $('editRooms').textContent = 'Edit rooms';
  $('addRoom').classList.add('hidden');
  switchTab('rooms');
  buildRoomEditor();
  fillSelect($('setTheme'), [['light','Light (bright)'],['dark','Dark']], CONFIG.settings.theme || 'light');
  fillSelect($('setPalette'), Object.keys(PALETTES).map(k => [k, k[0].toUpperCase()+k.slice(1)]), CONFIG.settings.palette || 'default');
  fillSelect($('setDateFormat'), DATE_FORMATS.map(([k,ex]) => [k, ex]), CONFIG.settings.dateFormat || 'ddd-d-mon-yyyy');
  fillSelect($('setRefresh2'), REFRESH_OPTS, String(CONFIG.settings.refreshMinutes || 30));
  $('setTimeFormat').value = CONFIG.settings.timeFormat || '24';
  $('setBold').checked = !!CONFIG.settings.boldText;

  const hc = CONFIG.settings.headingColor, tc = CONFIG.settings.textColor;
  $('autoHeading').checked = !hc; $('setHeadingColor').value = hc || '#0f172a'; $('setHeadingColor').disabled = !hc;
  $('autoText').checked = !tc; $('setTextColor').value = tc || '#0f172a'; $('setTextColor').disabled = !tc;
  $('autoHeading').onchange = () => { $('setHeadingColor').disabled = $('autoHeading').checked; };
  $('autoText').onchange = () => { $('setTextColor').disabled = $('autoText').checked; };

  const f = Object.assign({}, DEFAULT_FONTS, CONFIG.settings.fonts || {});
  $('fsHeading').value = f.heading; $('fsCaption').value = f.caption; $('fsTimeline').value = f.timeline;
  $('fsRoomName').value = f.roomName; $('fsSessionTitle').value = f.sessionTitle; $('fsSessionDetail').value = f.sessionDetail;
  $('setDayStart').value = CONFIG.settings.dayStart || '08:00';
  $('setDayEnd').value = CONFIG.settings.dayEnd || '18:00';
  $('setFullscreen').checked = !!CONFIG.settings.startFullscreen;
  $('setAutoStart').checked = !!CONFIG.settings.autoStartOnBoot;
  $('overlay').classList.remove('hidden');
}
function closeSettings(){ $('overlay').classList.add('hidden'); }
function switchTab(name){
  document.querySelectorAll('.stab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
}
function urlHost(u){ try { return new URL(u.replace(/^webcal:/i,'https:')).host; } catch(e){ return u ? u.slice(0,44) : ''; } }
function updateRoomsSummary(){
  const total = CONFIG.calendars.length;
  const withIcs = CONFIG.calendars.filter(c => c.url && c.url.trim()).length;
  const hiddenN = (CONFIG.settings.hiddenRooms || []).length;
  $('roomsSummary').textContent = `${total} rooms · ${withIcs} with ICS link · ${hiddenN} hidden`;
}
function buildRoomEditor(){
  const hidden = new Set(CONFIG.settings.hiddenRooms || []);
  const wrap = $('roomList'); wrap.innerHTML = '';
  CONFIG.calendars.forEach((r, i) => {
    const div = document.createElement('div');
    if (!roomsEditMode){
      // Read-only view card
      const has = !!(r.url && r.url.trim());
      div.className = 'room-card';
      div.innerHTML =
        `<span class="swatch" style="background:${r.color}"></span>
         <div class="rc-grow"><div class="rc-name">${escapeHtml(r.name)}</div>
           <div class="rc-meta">${has ? escapeHtml(urlHost(r.url)) : 'No ICS link set'}</div></div>
         <span class="pill-status ${has?'ok':'no'}">${has?'ICS set':'No link'}</span>
         <label class="rc-show"><input type="checkbox" ${hidden.has(r.name)?'':'checked'}/> Show</label>`;
      div.querySelector('input[type=checkbox]').onchange = (e) => {
        const set = new Set(CONFIG.settings.hiddenRooms || []);
        if (e.target.checked) set.delete(r.name); else set.add(r.name);
        CONFIG.settings.hiddenRooms = [...set]; updateRoomsSummary(); render();
      };
    } else {
      // Edit row (live-updates CONFIG)
      div.className = 'room-edit';
      div.innerHTML =
        `<input type="text" class="rname" value="${escapeAttr(r.name)}" placeholder="Room name"/>
         <input type="text" class="rurl" value="${escapeAttr(r.url||'')}" placeholder="ICS or webcal:// URL"/>
         <input type="color" class="rcolor" value="${r.color||'#2563eb'}"/>
         <button class="remove-room">Delete</button>`;
      const nameI = div.querySelector('.rname'), urlI = div.querySelector('.rurl'), colI = div.querySelector('.rcolor');
      nameI.oninput = () => { r.name = nameI.value; };
      urlI.oninput = () => { r.url = urlI.value.trim(); };
      colI.oninput = () => { r.color = colI.value; render(); };
      div.querySelector('.remove-room').onclick = (e) => {
        const btn = e.target;
        const span = document.createElement('span');
        span.className = 'confirm';
        span.innerHTML = `Delete “${escapeHtml(r.name)}”? <button class="cfm-yes remove-room">Delete</button> <button class="cfm-no small">Cancel</button>`;
        btn.replaceWith(span);
        span.querySelector('.cfm-yes').onclick = () => { CONFIG.calendars.splice(i,1); buildRoomEditor(); updateRoomsSummary(); render(); };
        span.querySelector('.cfm-no').onclick = () => buildRoomEditor();
      };
    }
    wrap.appendChild(div);
  });
  updateRoomsSummary();
}
function collectSettings(){
  // Room name/url/color and show/hide are updated live; nothing to read here.
  CONFIG.settings.theme = $('setTheme').value;
  CONFIG.settings.palette = $('setPalette').value;
  CONFIG.settings.boldText = $('setBold').checked;
  CONFIG.settings.headingColor = $('autoHeading').checked ? '' : $('setHeadingColor').value;
  CONFIG.settings.textColor = $('autoText').checked ? '' : $('setTextColor').value;
  CONFIG.settings.timeFormat = $('setTimeFormat').value;
  CONFIG.settings.dateFormat = $('setDateFormat').value;
  CONFIG.settings.refreshMinutes = parseInt($('setRefresh2').value,10);
  CONFIG.settings.fonts = {
    heading:+$('fsHeading').value, caption:+$('fsCaption').value, timeline:+$('fsTimeline').value,
    roomName:+$('fsRoomName').value, sessionTitle:+$('fsSessionTitle').value, sessionDetail:+$('fsSessionDetail').value
  };
  CONFIG.settings.dayStart = $('setDayStart').value || '08:00';
  CONFIG.settings.dayEnd = $('setDayEnd').value || '18:00';
  CONFIG.settings.startFullscreen = $('setFullscreen').checked;
  CONFIG.settings.autoStartOnBoot = $('setAutoStart').checked;
}

function applyChrome(){
  $('app').classList.toggle('hide-bottom', !!CONFIG.settings.hideBottom);
  $('fcBottom').classList.toggle('on', !!CONFIG.settings.hideBottom);
}

/* ---- init ---- */
async function init(){
  CONFIG = await window.kiosk.getConfig();
  applyFonts(); applyTheme(); applyChrome();

  // date navigation
  $('prevDay').onclick = () => goToDate(addDays(selectedDate, -1));
  $('nextDay').onclick = () => goToDate(addDays(selectedDate, 1));
  $('todayBtn').onclick = () => goToDate(new Date());
  $('datePick').onchange = () => { const v = $('datePick').value; if (v){ const [y,m,dd] = v.split('-').map(Number); goToDate(new Date(y, m-1, dd)); } };

  // header icon controls
  $('refreshNowBtn').onclick = () => refreshAll();
  $('fcFull').onclick = () => window.kiosk.toggleFullscreen();
  $('fcBottom').onclick = () => { CONFIG.settings.hideBottom = !CONFIG.settings.hideBottom; applyChrome(); window.kiosk.saveConfig(CONFIG); };
  $('fcSettings').onclick = () => openSettings();

  window.kiosk.onOpenSettings(() => openSettings());
  $('closeSettings').onclick = closeSettings;

  // settings tabs
  document.querySelectorAll('.stab').forEach(t => { t.onclick = () => switchTab(t.dataset.tab); });

  // rooms: guarded edit mode
  $('editRooms').onclick = () => {
    roomsEditMode = !roomsEditMode;
    $('editRooms').textContent = roomsEditMode ? 'Done editing' : 'Edit rooms';
    $('addRoom').classList.toggle('hidden', !roomsEditMode);
    buildRoomEditor();
  };
  $('addRoom').onclick = () => { CONFIG.calendars.push({ name:'New room', url:'', color:'#2563eb', enabled:true }); buildRoomEditor(); };
  $('applyPalette').onclick = () => { applyPalette($('setPalette').value); buildRoomEditor(); render(); };
  $('fsToggle').onclick = () => window.kiosk.toggleFullscreen();
  $('quitApp').onclick = () => window.kiosk.quit();

  $('resetDefault').onclick = () => {
    Object.assign(CONFIG.settings, {
      fonts: Object.assign({}, DEFAULT_FONTS), palette:'default', theme:'light', boldText:false,
      headingColor:'', textColor:'', timeFormat:'24', dateFormat:'ddd-d-mon-yyyy',
      dayStart:'08:00', dayEnd:'18:00', refreshMinutes:30
    });
    applyPalette('default');
    applyFonts(); applyTheme(); openSettings(); buildAxis(); render();
  };

  $('saveSettings').onclick = async () => {
    collectSettings();
    await window.kiosk.saveConfig(CONFIG);
    closeSettings();
    applyFonts(); applyTheme(); buildAxis(); scheduleRefresh(); await refreshAll();
  };

  window.addEventListener('resize', () => updateNowLine());

  buildAxis();
  updateDateLabel();
  tickClock();
  setInterval(tickClock, 10000);
  setInterval(render, 60000);
  setInterval(tickCountdown, 1000);

  scheduleRefresh();
  await refreshAll();
}

init();
