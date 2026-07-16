# Multi Room Calendar — Windows Kiosk

A fullscreen, self-refreshing room-booking board for SP Jain. Shows today's
schedule for 14 rooms (LC1–LC8, ELO1, ELO2, Boardroom, Meeting Room 1–3) on a
timeline, each room pulling its own ICS calendar link. Built with Electron so it
runs as a real Windows `.exe`, launches fullscreen on boot, and fetches ICS
feeds directly (no browser / CORS problems).

## Features

- One row per room on a today-only timeline (default 08:00–18:00, configurable)
- Colored session blocks with time, title and organizer; dashed **Free** slots;
  **LIVE** badge on an in-progress session; red "now" line and time badge
- Green/red **online/offline** dot per room (based on whether its ICS feed loaded)
- Header **Auto Refresh** selector: 5 / 15 / 30 min, 1 / 4 / 6 / 8 / 12 / 24 h
- Footer live counters: Total, Online, Offline, Busy Now, Free Now, **Next Refresh In**
- **Hide / Unhide Rooms** dropdown — hidden rows disappear and the rest resize to fill the screen
- **Compact / Normal / Large** row-size toggle, **Search Room**, CSV **Export**
- Fullscreen kiosk mode + optional **auto-start on Windows boot**

## 1. Prerequisites (one-time)

Install **Node.js LTS** on the Windows PC: https://nodejs.org (pick the "LTS" installer).
Then open **Command Prompt** or **PowerShell** in this folder.

## 2. Run it in dev (to test)

```bat
npm install
npm start
```

The window opens fullscreen. Press **F10** for settings, **Esc** to leave
fullscreen, **Ctrl+Shift+Q** to quit.

## 3. Add your room ICS links

Press **F10** (or click the gear / Settings). For each room paste its **ICS** or
**webcal://** URL, adjust the color, and tick/untick **Show**. Set the day
start/end and refresh interval, then **Save & reload**. Settings are stored in
`%APPDATA%\multi-calendar-kiosk\config.json` and survive updates.

> Tip: in Google Calendar, use "Settings → *calendar* → Secret address in iCal
> format". In Outlook/M365, "Publish calendar → ICS". Room mailboxes usually
> expose a published ICS URL.

## 4. Build the `.exe`

```bat
npm run dist
```

electron-builder produces installers in the **`dist\`** folder:

- `MultiCalendarKiosk Setup x.x.x.exe` — normal installer (Start-menu + desktop shortcut)
- `MultiCalendarKiosk-portable.exe` — single portable file, no install

(For only the portable build: `npm run dist:portable`.)

## 5. Auto-start on Windows boot

Two options — either works:

- **In-app:** open Settings (F10) → tick **Auto-start on Windows boot** → Save.
- **Manually:** press `Win+R`, type `shell:startup`, Enter, and drop a shortcut
  to the installed app (or the portable `.exe`) into that Startup folder.

The app opens fullscreen automatically. To run truly unattended, also set the PC
to auto-login and disable sleep/screensaver in Windows power settings.

## Offline / firewalled networks

The UI loads one small library (`ical.js`) from a CDN. If the kiosk network
blocks CDNs, vendor it locally:

1. On any machine with internet, download
   `https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js`
   into a new `vendor\` folder in this project.
2. In `renderer\index.html`, change the script line to
   `<script src="../vendor/ical.min.js"></script>`.
3. Rebuild (`npm run dist`).

The ICS feeds themselves still need to be reachable from the kiosk.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| F10 | Open settings |
| Esc | Exit fullscreen |
| Ctrl+Shift+Q | Quit the app |

## Project layout

```
main.js            Electron main: window, kiosk mode, ICS fetch, config, auto-start
preload.js         Secure bridge to the UI
renderer/
  index.html       Layout (sidebar, header, toolbar, timeline, footer)
  style.css        Bright SP Jain theme
  app.js           ICS parsing, rendering, refresh, settings
package.json       Dependencies + Windows build config
```

## Note on building from macOS/Linux

A Windows `.exe` is most reliably produced **on Windows** with the steps above.
Cross-building from macOS/Linux is possible with Wine but is not recommended for
a production kiosk.
