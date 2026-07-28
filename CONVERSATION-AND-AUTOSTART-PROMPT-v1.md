# Upgrade Prompt: continuous conversation mode + no-terminal launch/autostart

## Context

Read first: `main.js`, `preload.js`, `renderer/index.html`, `package.json`, `README.md` (these were substantially reworked in the previous session — merged dictation into the main orb window, added auto-stop-on-silence, ElevenLabs voice — so re-read the CURRENT versions, don't assume the shape from before that refactor).

Two independent problems reported by the user after testing:

1. **Talking to Jarvis is one-shot, not a conversation.** You click the orb, say something, it transcribes → sends to `/api/jarvis` → replies with voice — but then you have to click again for your next turn. The user wants a natural back-and-forth: after Jarvis finishes speaking its reply, the orb should automatically start listening again (like a phone call), so the user can just keep talking without touching anything, until they explicitly end the conversation.

2. **The app only runs if launched from a terminal (`npm start`).** The user wants to just click something in the Start Menu / Desktop / system tray to open it, have it live in the tray so they can close/reopen at will, and ideally have it auto-start with Windows so they never think about a terminal again.

(A third complaint — disliking the orb's current animation — is explicitly NOT in scope for this prompt; the user said it can be revisited later. Do not touch the particle engine, orb visuals, or animation timing in this pass.)

## Task 1 — continuous (turn-taking) conversation mode

In `renderer/index.html`, the orb currently: click → record → auto-stop on silence → transcribe → send to `/api/jarvis` → speak reply → done (back to idle, waiting for another click).

Change this so that after Jarvis finishes speaking a reply that was triggered from the orb's mic (NOT from the dictate-elsewhere mode, and NOT from the full chat window's mic button — scope this to the "talk to Jarvis" orb-click flow specifically), it automatically re-arms listening using the exact same auto-stop-on-silence logic already built for dictation, and loops: listen → transcribe → send → speak → listen again.

Requirements:
- A clear way to END the conversation loop: clicking the orb again while it's mid-loop should stop the loop (not just stop the current recording) and return to idle. Also auto-end the loop if the user says nothing for one full silence-timeout cycle right after Jarvis finishes speaking (i.e. don't keep the mic hot forever if they've walked away) — pick a sensible timeout (e.g. ~8-10s of silence with no speech detected before ending the loop), and communicate it clearly to me.
- Visually distinguish "in a live conversation, waiting for your turn" vs "one-shot idle orb" in the `orbHint` text (e.g. "listening…" / "your turn" vs "click to talk"), and make sure the existing `orb.thinking`/`orbSpeaking` states still work correctly inside the loop.
- Do NOT change the dictate-into-other-apps flow (Right Ctrl double-tap) — that should remain: listen once, auto-stop, type, done. Only the "talk to Jarvis" orb-click flow becomes conversational.
- Make sure mic resources (the `MediaRecorder`/`AudioContext`/tracks) are properly stopped and re-acquired each loop iteration, not leaked — check this carefully, a resource leak here would slowly degrade the app the longer a conversation runs.

## Task 2 — launch without a terminal + tray persistence + optional autostart

The app already has a working system tray icon (`Tray` in `main.js`) and correctly stays running when the popup is closed (`window-all-closed` is prevented) — that part is fine. The actual gap is that the user currently has no way to START it except `npm start` in a terminal.

1. Add a **"Start JARVIS with Windows"** toggle to the tray context menu (checkbox item), backed by Electron's `app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: [...] })`. Persist the user's choice (e.g. `electron-store`-free approach: a small JSON file in `app.getPath('userData')` is fine, no new dependency needed) so the checkbox reflects reality on next launch. Default OFF (don't silently enable autostart without the user opting in) — but the whole point is the user can turn it on once and never open a terminal again.
2. Create a **silent launcher** the user can double-click (Start Menu / Desktop / pinned to taskbar) that starts the app with NO visible console/terminal window — a `.vbs` wrapper that shells out to the local Electron binary is the standard trick for this without needing a full installer build (`node_modules\.bin\electron.cmd` or `node_modules\electron\dist\electron.exe` with `.` as the app path, run via `wscript` with a hidden window). Name it something like `Launch JARVIS.vbs` in the project root, and write clear instructions in `README.md` for pinning it to the Start Menu / taskbar (right-click → Pin to Start / Pin to taskbar works on `.vbs` and `.lnk` files, but if `.vbs` can't be pinned directly on this Windows version, instead have the script create a proper `.lnk` shortcut via PowerShell's `WScript.Shell` COM object and tell the user to pin THAT).
3. Update `README.md`'s setup section to describe: run `npm install` once, then either use `Launch JARVIS.vbs` going forward (no terminal), or enable "Start JARVIS with Windows" from the tray icon so it's just always running.
4. Do not attempt a full `electron-builder` installer build in this pass — that requires a proper packaged build pipeline, a real `.ico` icon, and is a bigger scope than "let me stop using a terminal." Flag it as a possible future step if you think it's warranted, but don't build it now.

## Verification (report honestly)
1. `node --check main.js` and `node --check preload.js` clean.
2. Launch via `npm start`, use the orb to start a conversation, confirm it genuinely loops (Jarvis replies, then starts listening again on its own) for at least 2-3 turns, and confirm clicking the orb mid-loop ends it cleanly.
3. Confirm dictate-into-other-apps (Right Ctrl) still works exactly as before (single-shot, not looping).
4. Test `Launch JARVIS.vbs` (or the shortcut it creates) actually opens the app with no visible console window.
5. Toggle "Start JARVIS with Windows" on, confirm `app.setLoginItemSettings` reflects it (Windows Settings → Apps → Startup, or Task Manager → Startup tab, should show it once toggled on — you may not be able to reboot to fully verify autostart fires, but confirm the login-item registration itself succeeded, e.g. via `app.getLoginItemSettings()` logging back `openAtLogin: true`).
6. List every file created/modified with a one-line reason each.

## Hard rules
- Do not touch the particle engine / orb visuals / animation — out of scope this pass.
- Do not touch `E:\imp\projects\ASCEND` at all.
- No new npm dependencies unless genuinely unavoidable — flag before adding.
- Smallest diff that correctly achieves both tasks.
