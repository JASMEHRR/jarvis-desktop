/**
 * JARVIS desktop — main process.
 *
 * One invisible/transparent window (mainWin) serves three modes:
 *  - 'orb': hands-free voice conversation loop, no visible chrome — the
 *    screen-edge glow overlay is the only indicator of its state. Opened via
 *    the tray's "Talk to JARVIS" item.
 *  - 'chat': the full chat window (typed conversation), focusable. DOUBLE-TAP
 *    RIGHT SHIFT (fallback Ctrl+Alt+J) opens this directly.
 *  - 'dictate': DOUBLE-TAP RIGHT CTRL (fallback Ctrl+Alt+D) summons it
 *    NON-FOCUSABLE so the app the user was typing into keeps keyboard focus.
 *    It records the mic, transcribes via local Whisper, then the text is
 *    typed into the focused app (clipboard + simulated Ctrl+V).
 *
 * A second window (overlayWin) renders the screen-edge glow — a full-screen,
 * click-through, always-on-top window covering the true physical display
 * bounds — showing during listening/thinking/speaking and hidden at idle.
 *
 * Electron's globalShortcut API can only bind modifier+key combos, not a
 * bare modifier press — so double-tap detection for Right Ctrl / Right Shift
 * alone is done via `uiohook-napi`, a low-level OS key hook (N-API, no
 * native rebuild needed). If that module fails to load for any reason, we
 * fall back to the old Ctrl+Alt+J / Ctrl+Alt+D combo shortcuts so the app
 * still works.
 *
 * Reminder toasts arrive over IPC from the renderer (which watches Firestore)
 * and are shown as native Windows notifications + the popup itself.
 */
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  screen,
  clipboard,
  Notification,
  nativeImage,
  desktopCapturer,
} = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWin = null;
let tray = null;

// ── persisted user settings (userData/settings.json, no new dependency) ──
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return {}; }
}

function saveSettings(s) {
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s)); }
  catch (e) { console.error('[jarvis] settings save failed:', e.message); }
}

const settings = loadSettings(); // { openAtLogin?: boolean }

// Default OFF — only registers with Windows once the user opts in via the tray.
function applyAutostart(enabled) {
  const openAtLogin = !!enabled;
  app.setLoginItemSettings({
    openAtLogin,
    // In dev (`electron .`) process.execPath is electron.exe itself, so the
    // login item must also carry the app directory as an arg, or Windows
    // would launch a bare Electron with no app to run.
    ...(app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] }),
  });
  settings.openAtLogin = openAtLogin;
  saveSettings(settings);
}

// ── single instance ─────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());
}

// 16x16 cyan spark tray icon (base64 PNG) — avoids shipping binary assets.
const TRAY_ICON_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaElEQVQ4y2NgGAWDHjAiC/z//x+' +
  'rIkZGRkZ8BjDhs4mQAUz4bCJkABM+mwgZwITPJkIGMOGziZABTPhsImQAEz6bCBnAhM8mQgYw4b' +
  'OJkAFM+GwiZAATPpsIGcCEzyZCBoyCwQ8Ao9YQFTf2fbkAAAAASUVORK5CYII=';

function winBounds(width, height) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height - 12),
  };
}

// Small enough to be a corner glance, not a window: ~76px visible orb plus
// the hint/expand controls beneath it.
const ORB_SIZE = [104, 134];
const CHAT_SIZE = [600, 640];
let mainMode = 'orb'; // 'orb' | 'chat' | 'dictate' — which layout is currently shown

// ── main popup (orb / chat / dictate all share this one window) ─
function createMain() {
  mainWin = new BrowserWindow({
    ...winBounds(...ORB_SIZE),
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWin.on('blur', () => {
    // Slide away when the user clicks elsewhere, like Raycast/Spotlight.
    // Not while dictating — that window is intentionally non-focusable and
    // "blurred" the instant it appears; blur must not hide it.
    if (mainMode === 'dictate') return;
    if (mainWin && !mainWin.webContents.isDevToolsOpened()) hideMain();
  });
  mainWin.on('closed', () => (mainWin = null));
}

// Double-tap Right Shift / tray "Open JARVIS" now goes straight to the chat
// window — there's no visible orb left to click through first.
function showMain() {
  if (!mainWin) createMain();
  if (mainMode === 'dictate') mainWin.setFocusable(true);
  mainMode = 'chat';
  mainWin.setBounds(winBounds(...CHAT_SIZE));
  mainWin.show();
  mainWin.focus();
  mainWin.webContents.send('jarvis:mode', { mode: mainMode });
}

// Tray-only entry point for the hands-free voice loop: an invisible window
// in 'orb' mode: the renderer auto-starts the conversation loop on receiving
// this mode (there's nothing left to click).
function showVoice() {
  if (!mainWin) createMain();
  if (mainMode === 'dictate') mainWin.setFocusable(true);
  mainMode = 'orb';
  mainWin.setBounds(winBounds(...ORB_SIZE));
  mainWin.show();
  mainWin.webContents.send('jarvis:mode', { mode: mainMode });
}

// expandMain/collapseMain were only used by the old ✕-collapses-to-orb
// behavior; the ✕ button now just hides fully (see renderer/index.html).

function hideMain() {
  if (mainMode === 'dictate') {
    // Dictation is non-focusable and owns an active recording — hiding it
    // outright would orphan that recording invisibly. Force-stop instead,
    // same as double-tapping Right Shift mid-dictation does.
    if (mainWin) mainWin.webContents.send('jarvis:dictate-force-stop');
    return;
  }
  // Tell the renderer first so it can end an in-progress orb conversation
  // (mic recording) — otherwise it keeps recording invisibly behind a hidden
  // window with no way to see status, on blur/Esc/double-tap-to-hide alike.
  if (mainWin) mainWin.webContents.send('jarvis:hiding');
  if (mainWin && mainWin.isVisible()) mainWin.hide();
  mainMode = 'orb';
  forceGlowIdle(); // belt-and-suspenders: don't rely solely on the renderer noticing it's hidden
}

function toggleMain() {
  if (mainMode === 'dictate') {
    // Right Shift during dictation just force-stops it rather than fighting
    // over the window's mode.
    if (mainWin) mainWin.webContents.send('jarvis:dictate-force-stop');
    return;
  }
  if (mainWin && mainWin.isVisible()) hideMain();
  else showMain();
}

// ── dictation (unified orb window, non-focusable) ────────────────
function showDictate() {
  if (!mainWin) createMain();
  mainWin.setFocusable(false);
  mainMode = 'dictate';
  mainWin.setBounds(winBounds(...ORB_SIZE));
  mainWin.showInactive(); // show without stealing focus from the target app
  mainWin.webContents.send('jarvis:mode', { mode: mainMode });
}

function hideDictate() {
  if (!mainWin) return;
  mainWin.hide();
  mainWin.setFocusable(true);
  mainMode = 'orb';
  forceGlowIdle();
}

function toggleDictation() {
  if (mainMode === 'dictate') {
    mainWin.webContents.send('jarvis:dictate-force-stop');
  } else {
    showDictate();
  }
}

// ── screen-edge glow overlay (click-through, full physical display bounds) ──
// Separate window from mainWin: it must cover the whole screen and ignore
// mouse events, which mainWin (focusable chat/dictate surface) must not.
let overlayWin = null;
let glowState = 'idle';

function overlayBounds() {
  // getPrimaryDisplay().bounds reaches the true physical edges; workArea
  // excludes the taskbar strip, which would leave a gap in the glow there.
  return screen.getPrimaryDisplay().bounds;
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    ...overlayBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 'screen-saver' is the highest always-on-top level Electron's public API
  // exposes, and it does get the glow above every ordinary application
  // window (verified) plus floats it above other apps' fullscreen windows
  // while a state is active — an accepted tradeoff (see SHADER-GLOW-PROMPT-
  // v1.md decision log).
  //
  // It does NOT reach above the taskbar itself. Measured directly: even a
  // plain opaque white window at this level leaves the taskbar strip's
  // brightness unchanged (desktopCapturer diff ~0), while the rest of the
  // screen goes fully white. Shell_TrayWnd is a protected system surface
  // that explorer.exe continuously re-asserts above all app windows — no
  // BrowserWindow flag defeats that; doing so would need raw Win32
  // SetWindowPos plus a re-assertion fight against explorer.exe, via a new
  // native dependency. Out of scope per the "no new npm dependencies" rule;
  // accepted as a known OS-level gap rather than shipping a native-module hack.
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWin.on('closed', () => (overlayWin = null));
}

// Single entry point for all glow state changes — main is the source of
// truth for show/hide so a renderer teardown race can't leave it stuck on.
function setGlowState(state) {
  glowState = state;
  if (!overlayWin) {
    if (state === 'idle') return; // nothing to hide, don't create a window just to hide it
    createOverlay();
  }
  const send = () => overlayWin.webContents.send('jarvis:glow-state', { state });
  if (overlayWin.webContents.isLoading()) overlayWin.webContents.once('did-finish-load', send);
  else send();

  if (state === 'idle') {
    if (overlayWin.isVisible()) overlayWin.hide();
  } else if (!overlayWin.isVisible()) {
    overlayWin.showInactive();
    // Re-apply every show — some Electron versions reset ignore-mouse-events
    // and always-on-top level when a hidden window is shown again; cheap to
    // always redo both.
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
  }
}

function forceGlowIdle() { setGlowState('idle'); }

// ── local speech-to-text (Whisper small, quantized, fully on-device) ─────
// No audio ever leaves the machine and no API key is required. Loaded lazily
// (first dictation pays the ~2s model-load cost) and cached forever after,
// so it doesn't slow down app startup.
// @xenova/transformers is ESM-only; Electron 33 bundles a Node without
// require(esm) support, so it must be loaded via dynamic import().
let whisperPipeline = null;
async function getWhisper() {
  if (!whisperPipeline) {
    whisperPipeline = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      // Cache lives outside node_modules so a fresh `npm install` doesn't
      // re-download the ~240MB model; scripts/download-whisper-model.js
      // fetches into the same dir.
      env.cacheDir = path.join(__dirname, '.whisper-cache');
      env.allowLocalModels = false;
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { quantized: true });
    })();
  }
  return whisperPipeline;
}

// ── paste text into whatever app is focused ─────────────────────
function typeIntoActiveApp(text) {
  return new Promise((resolve) => {
    const previous = clipboard.readText();
    clipboard.writeText(text);
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-WindowStyle', 'Hidden',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
      ],
      { timeout: 10000 },
      (err) => {
        if (err) {
          console.error('[jarvis] paste failed:', err.message);
          new Notification({
            title: 'JARVIS',
            body: 'Could not type into the active app. The text is on your clipboard — press Ctrl+V.',
          }).show();
          // Leave the text on the clipboard as a fallback — do NOT schedule a
          // restore, or it would silently overwrite this fallback shortly after.
          clipboard.writeText(text);
          resolve(false);
        } else {
          // Paste succeeded — safe to restore the user's original clipboard now.
          setTimeout(() => {
            try { clipboard.writeText(previous); } catch { /* clipboard busy */ }
          }, 1500);
          resolve(true);
        }
      },
    );
  });
}

// ── IPC ─────────────────────────────────────────────────────────
ipcMain.on('jarvis:hide', hideMain);
ipcMain.on('jarvis:dictate-done', hideDictate);
ipcMain.on('jarvis:glow-state', (_e, { state }) => setGlowState(state));
// Lightweight, high-frequency amplitude channel — bypasses setGlowState's
// show/hide bookkeeping since it fires many times per second while active;
// silently dropped if the overlay isn't currently up.
ipcMain.on('jarvis:glow-level', (_e, { level }) => {
  if (overlayWin && !overlayWin.webContents.isLoading()) {
    overlayWin.webContents.send('jarvis:glow-level', { level });
  }
});

ipcMain.handle('jarvis:type-text', async (_e, text) => {
  if (typeof text !== 'string' || !text.trim()) return false;
  return typeIntoActiveApp(text.trim());
});

// pcmBuffer: ArrayBuffer of 16kHz mono Float32 samples, resampled in the
// renderer. Runs entirely in this process so a slow transcription can't
// freeze renderer UI.
ipcMain.handle('jarvis:transcribe', async (_e, pcmBuffer) => {
  try {
    const samples = new Float32Array(pcmBuffer);
    if (!samples.length) return { text: '', error: null };
    const t0 = Date.now();
    const transcriber = await getWhisper();
    const result = await transcriber(samples);
    const secs = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[jarvis] local transcription: ${secs}s for ${(samples.length / 16000).toFixed(1)}s of audio`);
    return { text: (result.text || '').trim(), error: null };
  } catch (e) {
    console.error('[jarvis] transcription failed:', e);
    return { text: '', error: e.message };
  }
});

ipcMain.on('jarvis:notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: String(title || 'JARVIS'),
    body: String(body || ''),
    silent: false, // respects system mute
  });
  n.on('click', showMain);
  n.show();
});

// Reminder fired in the renderer: native toast + surface the popup briefly.
ipcMain.on('jarvis:reminder-due', (_e, { text }) => {
  if (Notification.isSupported()) {
    const n = new Notification({
      title: '⏰ JARVIS Reminder',
      body: String(text || 'Reminder'),
      urgency: 'critical',
      silent: false,
    });
    n.on('click', showMain);
    n.show();
  }
  showMain(); // Jarvis pops up, as requested
});

// ── double-tap Right Ctrl / Right Shift via a low-level key hook ─
const DOUBLE_TAP_MS = 350;
let hookActive = false;
let hookLabel = 'Ctrl+Alt+J summon · Ctrl+Alt+D dictate'; // updated once we know which mode is live

function setupDoubleTapHook() {
  let uIOhook, UiohookKey;
  try {
    ({ uIOhook, UiohookKey } = require('uiohook-napi'));
  } catch (e) {
    console.error('[jarvis] uiohook-napi unavailable, falling back to Ctrl+Alt shortcuts:', e.message);
    return false;
  }

  let rShiftDown = false, rShiftLastTap = 0;
  let rCtrlDown = false, rCtrlLastTap = 0;

  uIOhook.on('keydown', (e) => {
    const now = Date.now();
    if (e.keycode === UiohookKey.ShiftRight) {
      if (!rShiftDown) {
        rShiftDown = true;
        if (now - rShiftLastTap < DOUBLE_TAP_MS) { rShiftLastTap = 0; toggleMain(); }
        else rShiftLastTap = now;
      }
    } else if (e.keycode === UiohookKey.CtrlRight) {
      if (!rCtrlDown) {
        rCtrlDown = true;
        if (now - rCtrlLastTap < DOUBLE_TAP_MS) { rCtrlLastTap = 0; toggleDictation(); }
        else rCtrlLastTap = now;
      }
    }
  });
  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.ShiftRight) rShiftDown = false;
    else if (e.keycode === UiohookKey.CtrlRight) rCtrlDown = false;
  });
  // Without this, an 'error' emitted after startup (native hook dying mid-
  // session) would be an unhandled EventEmitter error and crash the whole
  // app, not just the hook — log it and keep running dark instead.
  uIOhook.on('error', (e) => console.error('[jarvis] uiohook error (hotkeys may stop working):', e));

  try {
    uIOhook.start();
  } catch (e) {
    console.error('[jarvis] uiohook failed to start, falling back to Ctrl+Alt shortcuts:', e.message);
    return false;
  }

  hookActive = true;
  hookLabel = 'double-tap Right Shift to summon · double-tap Right Ctrl to dictate';
  app.on('will-quit', () => { try { uIOhook.stop(); } catch { /* already stopped */ } });
  return true;
}

// ── lifecycle ───────────────────────────────────────────────────
app.whenReady().then(() => {
  createMain();

  const doubleTapOk = setupDoubleTapHook();
  if (!doubleTapOk) {
    // Fallback combos so the app is still usable without the key hook.
    const okToggle = globalShortcut.register('Control+Alt+J', toggleMain);
    const okDict = globalShortcut.register('Control+Alt+D', toggleDictation);
    if (!okToggle) console.error('[jarvis] could not register the fallback summon hotkey');
    if (!okDict) console.error('[jarvis] could not register the fallback dictation hotkey');
  }

  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_B64, 'base64'));
  tray = new Tray(icon);
  tray.setToolTip(`JARVIS — ${hookLabel}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open JARVIS chat (${doubleTapOk ? '2x Right Shift' : 'Ctrl+Alt+J'})`, click: showMain },
      { label: 'Talk to JARVIS (voice)', click: showVoice },
      { label: `Dictate (${doubleTapOk ? '2x Right Ctrl' : 'Ctrl+Alt+D'})`, click: toggleDictation },
      { type: 'separator' },
      {
        label: 'Start JARVIS with Windows',
        type: 'checkbox',
        checked: !!settings.openAtLogin,
        click: (item) => applyAutostart(item.checked),
      },
      { type: 'separator' },
      { label: 'Open Ascend in browser', click: () => require('electron').shell.openExternal('https://ascend-delta-sage.vercel.app') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  tray.on('click', toggleMain);
});
