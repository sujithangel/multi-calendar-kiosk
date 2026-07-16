/* Multi Room Calendar - renderer logic
 * Loads rooms + settings, fetches each ICS feed via the main process (no CORS),
 * parses today's events, and renders the timeline board, footer stats and
 * refresh countdown shown in the SP Jain kiosk UI.
 */

let CONFIG = null;
let refreshTimer = null;
let countdownTimer = null;
let nextRefreshAt = 0;
let lastData = {};            // roomName -> { events, online, configured, error }
let searchTerm = '';

const $ = (id) => document.getElementById(id);
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const REFRESH_OPTS = [
  [5,'5 min'],[15,'15 min'],[30,'30 min'],[60,'1 hour'],[240,'4 hours'],
  [360,'6 hours'],[480,'8 hours'],[720,'12 hours'],[1440,'24 hours']
];

function pad(n){ return n < 10 ? '0' + n : '' + n; }
function hhmm(dt){ return pad(dt.getHours()) + ':' + pad(dt.getMinutes()); }
function parseHour(s, f){ const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1] + (+m[2])/60) : f; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,'&#39;'); }

/* ---- room icons ---- */
function iconFor(name){
  const n = name.toLowerCase();
  if (n.startsWith('elo')) // camera / video
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="13" height="12" rx="2"/><path d="M22 8l-5 4 5 4V8z"/></svg>';
  if (n.startsWith('board')) // people
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><path d="M15.5 19c0-2 1.5-3.5 4-3.5"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
}

/* ---- ICS parsing: today's events ---- */
function expandTodayEvents(text){
  const out = [];
  const comp = new ICAL.Component(ICAL.parse(text));
  const vevents = comp.getAllSubcomponents('vevent');
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate()+1);
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
      while ((next = iter.next()) && guard++ < 800){
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

/* ---- Fetch ---- */
async function refreshAll(){
  await Promise.all(CONFIG.calendars.map(async (r) => {
    if (!r.url || !r.url.trim()){ lastData[r.name] = { events:[], online:false, configured:false }; return; }
    const res = await window.kiosk.fetchIcs(r.url);
    if (!res.ok){ lastData[r.name] = { events: (lastData[r.name]||{}).events || [], online:false, configured:true, error:res.error }; return; }
    try { lastData[r.name] = { events: expandTodayEvents(res.text), online:true, configured:true }; }
    catch(e){ lastData[r.name] = { events:[], online:false, configured:true, error:'Parse error' }; }
  }));
  render();
  resetCountdown();
}

/* ---- Render ---- */
function visibleRooms(){
  const hidden = new Set(CONFIG.settings.hiddenRooms || []);
  return CONFIG.calendars.filter(r => r.enabled !== false && !hidden.has(r.name)
    && (!searchTerm || r.name.toLowerCase().includes(searchTerm)));
}

function render(){
  const H0 = parseHour(CONFIG.settings.dayStart, 8);
  const H1 = parseHour(CONFIG.settings.dayEnd, 18);
  const span = Math.max(1, H1 - H0);
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes()/60;
  const rooms = visibleRooms();

  let html = '';
  let cOnline=0, cOffline=0, cBusy=0, cFree=0, cConfigured=0;

  for (const r of CONFIG.calendars){
    const d = lastData[r.name] || { events:[], online:false, configured:!!(r.url&&r.url.trim()) };
    if (d.configured) cConfigured++;
    if (d.online) cOnline++; else if (d.configured) cOffline++;
    const busyNow = d.online && d.events.some(e => now >= e.start && now < e.end);
    if (d.online){ if (busyNow) cBusy++; else cFree++; }
  }

  for (const r of rooms){
    const d = lastData[r.name] || { events:[], online:false, configured:!!(r.url&&r.url.trim()) };
    const statusCls = d.online ? 'on' : 'off';
    const statusTxt = d.online ? 'Online' : 'Offline';

    let track = '';
    if (!d.configured){
      track = '<div class="empty">⚠ No Calendar Available</div>';
    } else if (!d.online){
      track = '<div class="empty">⚠ No Calendar Available</div>';
    } else if (d.events.length === 0){
      track = '<div class="empty">No Sessions Today</div>';
    } else {
      // booked blocks
      for (const ev of d.events){
        const sH = ev.start.getHours()+ev.start.getMinutes()/60;
        const eH = ev.end.getHours()+ev.end.getMinutes()/60;
        const l = clamp((sH-H0)/span*100), w = clamp((eH-H0)/span*100) - l;
        if (w <= 0) continue;
        const live = (now >= ev.start && now < ev.end) ? '<span class="live">LIVE</span>' : '';
        track += `<div class="block" style="left:${l}%;width:${w}%;background:${r.color};">
          ${live}<div class="bt">${hhmm(ev.start)} - ${hhmm(ev.end)}</div>
          <div class="bn">${escapeHtml(ev.title)}</div>
          ${ev.sub ? `<div class="bp">${escapeHtml(ev.sub)}</div>` : ''}</div>`;
      }
      // free gaps
      for (const g of gaps(d.events, H0, H1)){
        const l = clamp((g.s-H0)/span*100), w = clamp((g.e-H0)/span*100) - l;
        if (w < 3) continue;
        track += `<div class="block free" style="left:${l}%;width:${w}%;">
          <div class="bt">${hourLbl(g.s)} - ${hourLbl(g.e)}</div><div class="bn">Free</div></div>`;
      }
    }
    if (nowH >= H0 && nowH <= H1) track += `<div class="nowline" style="left:${(nowH-H0)/span*100}%;"></div>`;

    html += `<div class="row" data-room="${escapeAttr(r.name)}">
      <div class="row-head">
        <div class="room-tile" style="background:${r.color};">${iconFor(r.name)}</div>
        <div><div class="room-name">${escapeHtml(r.name)}</div>
        <div class="room-status ${statusCls}"><span class="rd"></span>${statusTxt}</div></div>
      </div>
      <div class="track">${track}</div>
      <div class="kebab">⋮</div>
    </div>`;
  }
  $('rows').innerHTML = html || '<div style="padding:24px;color:#94a3b8;">No rooms match. Clear the search or press F10.</div>';

  // footer stats
  $('stTotal').textContent = CONFIG.calendars.length;
  $('stOnline').textContent = cOnline;
  $('stOffline').textContent = cOffline;
  $('stBusy').textContent = cBusy;
  $('stFree').textContent = cFree;

  // system status
  const allOnline = cOffline === 0 && cConfigured > 0;
  $('sysStatus').textContent = cConfigured === 0 ? 'No feeds configured' : (allOnline ? 'All Systems Online' : cOffline + ' room(s) offline');
  $('sysStatus').style.color = allOnline ? '#16a34a' : (cConfigured===0 ? '#94a3b8' : '#e11d2a');
  $('sysDot').style.background = allOnline ? '#16a34a' : (cConfigured===0 ? '#cbd5e1' : '#e11d2a');

  // alerts badge = offline count
  const badge = $('alertBadge');
  if (cOffline > 0){ badge.textContent = cOffline; badge.classList.remove('hidden'); } else badge.classList.add('hidden');

  const total = CONFIG.calendars.length;
  const shown = rooms.length;
  $('roomsShownLbl').textContent = shown + ' of ' + total + ' rooms shown';
}

function clamp(v){ return Math.max(0, Math.min(100, v)); }
function hourLbl(h){ const H=Math.floor(h), M=Math.round((h-H)*60); return pad(H)+':'+pad(M); }
function gaps(events, H0, H1){
  const res = []; let cursor = H0;
  const sorted = events.map(e => ({ s:e.start.getHours()+e.start.getMinutes()/60, e:e.end.getHours()+e.end.getMinutes()/60 }))
    .sort((a,b)=>a.s-b.s);
  for (const e of sorted){ if (e.s > cursor + 0.05) res.push({ s:cursor, e:Math.min(e.s,H1) }); cursor = Math.max(cursor, e.e); }
  if (cursor < H1 - 0.05) res.push({ s:cursor, e:H1 });
  return res;
}

/* ---- Timeline axis ---- */
function buildAxis(){
  const H0 = Math.round(parseHour(CONFIG.settings.dayStart, 8));
  const H1 = Math.round(parseHour(CONFIG.settings.dayEnd, 18));
  const span = Math.max(1, H1 - H0);
  let html = '';
  for (let h = H0; h <= H1; h++){
    html += `<div class="hr" style="left:${(h-H0)/span*100}%;">${pad(h)}:00</div>`;
  }
  $('axisHours').innerHTML = html;
  updateNowBadge();
}
function updateNowBadge(){
  const H0 = parseHour(CONFIG.settings.dayStart, 8);
  const H1 = parseHour(CONFIG.settings.dayEnd, 18);
  const span = Math.max(1, H1 - H0);
  const n = new Date(); const nowH = n.getHours()+n.getMinutes()/60;
  let badge = $('axisHours').querySelector('.now-badge');
  if (nowH < H0 || nowH > H1){ if (badge) badge.remove(); return; }
  if (!badge){ badge = document.createElement('div'); badge.className = 'now-badge'; $('axisHours').appendChild(badge); }
  badge.style.left = (nowH-H0)/span*100 + '%';
  badge.textContent = hhmm(n);
}

/* ---- Clock / date / countdown ---- */
function tickClock(){
  const n = new Date();
  $('todayDate').textContent = DAYS[n.getDay()] + ', ' + n.getDate() + ' ' + MONTHS[n.getMonth()] + ' ' + n.getFullYear();
  updateNowBadge();
}
function scheduleRefresh(){
  if (refreshTimer) clearInterval(refreshTimer);
  const mins = parseInt(CONFIG.settings.refreshMinutes,10) || 5;
  refreshTimer = setInterval(refreshAll, mins*60000);
  resetCountdown();
}
function resetCountdown(){
  const mins = parseInt(CONFIG.settings.refreshMinutes,10) || 5;
  nextRefreshAt = Date.now() + mins*60000;
}
function tickCountdown(){
  const ms = Math.max(0, nextRefreshAt - Date.now());
  const totalSec = Math.floor(ms/1000);
  if (totalSec >= 3600){
    const h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60);
    $('countdown').textContent = h + 'h ' + pad(m) + 'm';
  } else {
    $('countdown').textContent = pad(Math.floor(totalSec/60)) + ':' + pad(totalSec%60);
  }
}

/* ---- Rooms dropdown (hide/unhide) ---- */
function buildRoomsMenu(){
  const hidden = new Set(CONFIG.settings.hiddenRooms || []);
  $('roomsMenu').innerHTML = CONFIG.calendars.map((r,i) =>
    `<label><input type="checkbox" data-i="${i}" ${hidden.has(r.name)?'':'checked'}/>
     <span style="width:10px;height:10px;border-radius:3px;background:${r.color};display:inline-block;"></span>${escapeHtml(r.name)}</label>`
  ).join('');
  $('roomsMenu').querySelectorAll('input').forEach(cb => {
    cb.onchange = () => {
      const r = CONFIG.calendars[+cb.dataset.i];
      const set = new Set(CONFIG.settings.hiddenRooms || []);
      if (cb.checked) set.delete(r.name); else set.add(r.name);
      CONFIG.settings.hiddenRooms = [...set];
      window.kiosk.saveConfig(CONFIG);
      render();
    };
  });
}

/* ---- Settings panel ---- */
function openSettings(){
  buildRoomEditor();
  $('setDayStart').value = CONFIG.settings.dayStart || '08:00';
  $('setDayEnd').value = CONFIG.settings.dayEnd || '18:00';
  $('setFullscreen').checked = !!CONFIG.settings.startFullscreen;
  $('setAutoStart').checked = !!CONFIG.settings.autoStartOnBoot;
  $('overlay').classList.remove('hidden');
}
function closeSettings(){ $('overlay').classList.add('hidden'); }
function buildRoomEditor(){
  const hidden = new Set(CONFIG.settings.hiddenRooms || []);
  const wrap = $('roomList'); wrap.innerHTML = '';
  CONFIG.calendars.forEach((r,i) => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML =
      `<input type="text" class="rname" value="${escapeAttr(r.name)}" data-i="${i}" data-k="name"/>
       <input type="text" value="${escapeAttr(r.url||'')}" data-i="${i}" data-k="url" placeholder="ICS or webcal:// URL"/>
       <input type="color" value="${r.color||'#2563eb'}" data-i="${i}" data-k="color"/>
       <label class="check" style="white-space:nowrap;"><input type="checkbox" data-i="${i}" data-k="show" ${hidden.has(r.name)?'':'checked'}/> Show</label>
       <button class="remove-room" data-i="${i}">✕</button>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('.remove-room').forEach(b => {
    b.onclick = () => { CONFIG.calendars.splice(+b.dataset.i,1); buildRoomEditor(); };
  });
}
function collectSettings(){
  const hidden = [];
  $('roomList').querySelectorAll('.room-item').forEach(item => {
    const i = +item.querySelector('[data-k=name]').dataset.i;
    const cal = CONFIG.calendars[i]; if (!cal) return;
    cal.name = item.querySelector('[data-k=name]').value.trim() || cal.name;
    cal.url = item.querySelector('[data-k=url]').value.trim();
    cal.color = item.querySelector('[data-k=color]').value;
    if (!item.querySelector('[data-k=show]').checked) hidden.push(cal.name);
  });
  CONFIG.settings.hiddenRooms = hidden;
  CONFIG.settings.dayStart = $('setDayStart').value || '08:00';
  CONFIG.settings.dayEnd = $('setDayEnd').value || '18:00';
  CONFIG.settings.startFullscreen = $('setFullscreen').checked;
  CONFIG.settings.autoStartOnBoot = $('setAutoStart').checked;
}

/* ---- Init ---- */
async function init(){
  CONFIG = await window.kiosk.getConfig();

  // refresh dropdown
  $('refreshSel').innerHTML = REFRESH_OPTS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  $('refreshSel').value = String(CONFIG.settings.refreshMinutes || 5);
  $('refreshSel').onchange = () => {
    CONFIG.settings.refreshMinutes = parseInt($('refreshSel').value,10);
    window.kiosk.saveConfig(CONFIG); scheduleRefresh();
  };

  // view size
  $('rows').className = 'size-' + (CONFIG.settings.viewSize || 'normal');
  document.querySelectorAll('.seg').forEach(seg => {
    seg.classList.toggle('active', seg.dataset.size === (CONFIG.settings.viewSize||'normal'));
    seg.onclick = () => {
      document.querySelectorAll('.seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      CONFIG.settings.viewSize = seg.dataset.size;
      $('rows').className = 'size-' + seg.dataset.size;
      window.kiosk.saveConfig(CONFIG); render();
    };
  });

  // rooms dropdown
  $('roomsToggleBtn').onclick = (e) => { e.stopPropagation(); buildRoomsMenu(); $('roomsMenu').classList.toggle('hidden'); };
  document.addEventListener('click', () => $('roomsMenu').classList.add('hidden'));
  $('roomsMenu').addEventListener('click', e => e.stopPropagation());

  // search
  $('searchInput').oninput = () => { searchTerm = $('searchInput').value.trim().toLowerCase(); render(); };

  // sidebar
  $('collapseBtn').onclick = () => $('app').classList.toggle('collapsed');
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.onclick = () => {
      const nav = el.dataset.nav;
      if (nav === 'settings' || nav === 'rooms'){ openSettings(); return; }
      if (nav === 'export'){ exportCsv(); return; }
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      if (nav === 'calendar') el.classList.add('active');
    };
  });

  // settings wiring
  window.kiosk.onOpenSettings(() => openSettings());
  $('closeSettings').onclick = closeSettings;
  $('addRoom').onclick = () => { CONFIG.calendars.push({ name:'New room', url:'', color:'#2563eb', enabled:true }); buildRoomEditor(); };
  $('fsToggle').onclick = () => window.kiosk.toggleFullscreen();
  $('quitApp').onclick = () => window.kiosk.quit();
  $('refreshNowBtn').onclick = () => refreshAll();
  $('saveSettings').onclick = async () => {
    collectSettings();
    await window.kiosk.saveConfig(CONFIG);
    closeSettings();
    buildAxis(); scheduleRefresh(); await refreshAll();
  };

  buildAxis();
  tickClock();
  setInterval(tickClock, 15000);
  setInterval(render, 60000);
  setInterval(tickCountdown, 1000);

  scheduleRefresh();
  await refreshAll();
}

function exportCsv(){
  const rows = [['Room','Status','Start','End','Title']];
  for (const r of CONFIG.calendars){
    const d = lastData[r.name] || {};
    if (!d.events || !d.events.length){ rows.push([r.name, d.online?'online':'offline','','','']); continue; }
    for (const e of d.events) rows.push([r.name,'online',hhmm(e.start),hhmm(e.end),e.title]);
  }
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = 'room-schedule-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

init();
