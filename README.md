# JARVIS Desktop

Ascend Protocol's Jarvis as a desktop companion for Windows.

## What it does
- **Screen-edge glow** — JARVIS's state (listening / thinking / speaking) is shown as a soft, animated, multi-color glow traced along the very edges of your screen — no small widget anymore. It's invisible at idle, and the whole overlay is click-through, so it never blocks whatever you're doing underneath.
- **Double-tap Right Shift** — opens the full chat window directly (text or mic, replies spoken aloud, mute button in header). Esc, the ✕ button, or clicking away hides it completely.
- **Tray → "Talk to JARVIS (voice)"** — starts the hands-free voice conversation loop (no visible window at all — just the glow) without needing to type. Click the tray icon again (double-tap Right Shift) to end it.
- **Double-tap Right Ctrl** — dictation, usable in ANY app: a non-focusable window (the app you were typing into keeps keyboard focus) starts listening immediately, shown only via the glow. **Double-tap Right Ctrl again to stop** — dictation only starts and stops on these two explicit taps, there is no auto-stop-on-silence or timeout for this path. The transcribed words are then typed into whatever app you were using.
- **Fully local transcription** — speech-to-text runs entirely on-device via a local Whisper model (`@xenova/transformers`, "small", quantized, ~240MB one-time download). No audio ever leaves the machine, no API key or account is needed for this feature, and it works with no internet connection.
- **Voice replies** — spoken via ElevenLabs (Daniel — British, authoritative) through the Ascend backend; falls back automatically to the browser's built-in voice if ElevenLabs is unavailable (quota exhausted, not configured, etc.) so a reply is never silent. (Unlike transcription, replies still go through the Ascend backend — out of scope for the local-STT change.)
- **Reminders** — "Jarvis, remind me to call mom at 6pm" → stored in your Ascend Firestore (`users/{uid}/reminders`), synced live. When due, Jarvis pops up with a Windows toast + sound (respects system mute). Reminders set anywhere appear everywhere.
- Lives in the system tray; closing the popup doesn't quit.

Double-tap detection uses a low-level key hook (`uiohook-napi`) so it can catch a bare Right Shift / Right Ctrl press, which Electron's normal hotkey API can't do. If that hook fails to load on your machine (rare — check the terminal for `uiohook-napi unavailable`), it falls back automatically to **Ctrl+Alt+J** (summon) and **Ctrl+Alt+D** (dictate).

## Setup (one time)
```
cd E:\imp\projects\jarvis-desktop
npm install
```
This also downloads the local Whisper model (~240MB, one time) via a postinstall step — you'll see `[jarvis] fetching local Whisper...` during install. If that step fails (e.g. no internet at install time), dictation retries the download automatically the first time you use it.

Sign in with your Ascend email + password. If your Ascend account is Google-only, use "Forgot password" on the web app once to set a password for the same email.

**Windows may prompt for input-monitoring/accessibility permission** the first time `uiohook-napi` starts (it needs to see raw keyboard events system-wide to detect the double-tap). Allow it — this app only watches for Right Shift/Right Ctrl taps, nothing else is logged or sent anywhere.

### Running it without a terminal
No more `npm start` in a terminal — pick one:
- **Double-click `Launch JARVIS.vbs`** in this folder any time you want to open it. It starts the app with no console window. To pin it: right-click → Pin to Start / Pin to taskbar. If your Windows build doesn't offer that for a `.vbs` file, run **`Create Shortcut.vbs`** once — it generates `Launch JARVIS.lnk` next to it, which can always be pinned.
- **Start it with Windows automatically**: right-click the JARVIS tray icon → check "Start JARVIS with Windows". It's OFF by default; once you turn it on, JARVIS launches on every login and just lives in the tray — you never need to open a terminal or click a launcher again. Uncheck it any time to disable.

(A full installer / `electron-builder` packaged build is a possible future step, not done yet — this covers "no terminal" without that extra work.)

## Architecture
- `main.js` — two windows: `mainWin` (chat/dictate/orb-voice-loop modes — invisible except in chat mode) and `overlayWin` (the screen-edge glow, click-through, covers `screen.getPrimaryDisplay().bounds` so it reaches the true physical screen edges). Tray, global hotkeys, native toasts, types text via clipboard + simulated Ctrl+V (PowerShell SendKeys; your original clipboard is restored after). Dictate mode is `mainWin` shown non-focusable (`setFocusable(false)` + `showInactive()`) so the target app keeps keyboard focus. `setGlowState()` is the single place that shows/hides the overlay and forwards state to it, so a renderer teardown race can't leave the glow stuck on. Also hosts the local Whisper pipeline (`@xenova/transformers`) and the `jarvis:transcribe` IPC handler — transcription runs here, off the renderer thread, so it never freezes the UI. `electron . --capture-glow` drives each state without a mic and saves screenshots into `screenshots/` for a visual sanity check.
- `renderer/index.html` — chat UI (also used, non-focusable, for dictation and the voice loop, with no visible chrome in those modes); reports state changes to `overlayWin` via `window.jarvis.reportGlowState()`. Firebase Auth + Firestore (same project as Ascend); calls the deployed `/api/jarvis` relay, declaring desktop tools (`set_reminder`, `complete_reminder`, `delete_reminder`, `type_text`) that execute locally. Captures mic audio as raw PCM (`ScriptProcessorNode`, resampled to 16kHz mono in JS — no ffmpeg), sends it to `main.js` over IPC for local transcription. Two separate recorder helpers: a manual start/stop recorder for dictation + the chat mic button, and an auto-stop-on-silence recorder (unchanged) for the voice conversation loop only. Replies → `/api/tts` (ElevenLabs, played back at 1.2x for snappier delivery) with browser-speech fallback (`rate = 1.2`).
- `renderer/overlay.html` + `preload-overlay.js` — the glow itself: two stacked border layers (sharp inner + blurred outer), both painted with the same conic-gradient whose color stops reshuffle every ~180-380ms (faster while speaking, calmer while listening) via a single `setTimeout` loop that's fully cleared at idle — no animation runs while hidden.
- `scripts/download-whisper-model.js` — `postinstall` step that pre-fetches the Whisper model into `.whisper-cache/` (outside `node_modules`, so it survives reinstalls) so first use isn't a 240MB surprise.
- `config.js` — API base URL + public Firebase web config. No AI keys on the desktop.
