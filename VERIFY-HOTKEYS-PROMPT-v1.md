# Verify Prompt: JARVIS Desktop hotkey mapping

## Context

This is a standalone Electron app (NOT the Ascend web repo). Required mapping:
- **Ctrl+Shift+Space** → summon JARVIS (shows the particle orb; fallback `Ctrl+Alt+J`)
- **Ctrl+Space** → start/stop dictation-anywhere (fallback `Ctrl+Alt+D`)

## Task

1. Open `main.js` and confirm the `globalShortcut.register` calls inside `app.whenReady()` match the mapping above exactly (`Control+Shift+Space` bound to `toggleMain`, `Control+Space` bound to `toggleDictation`). If they are swapped or wrong, fix them.
2. Grep the whole repo (`main.js`, `preload.js`, `renderer/index.html`, `renderer/dictation.html`, `README.md`) for every other mention of "Ctrl+Space" / "Ctrl+Shift+Space" / "Control+Space" / "Control+Shift+Space" (tray tooltip, tray menu labels, on-screen hint text, README) and confirm each one describes the CORRECT action for that key combo per the mapping above. Fix any that describe the wrong action.
3. Run `node --check main.js` and `node --check preload.js` to confirm no syntax errors were introduced.
4. Launch the app (`npm start` in this folder) and manually confirm: Ctrl+Shift+Space shows the orb window; Ctrl+Space (while any other app is focused) shows the dictation pill without stealing focus from that app.
5. Report exactly what was already correct vs. what you changed, file by file. If everything was already correct, say so plainly — do not invent changes to justify the task.

## Also: end-to-end test the transcribe/dictation pipeline

This app has no AI keys of its own — dictation calls the DEPLOYED Ascend backend at the URL in `config.js` (`API_BASE`), hitting `/api/transcribe` (defined in `E:\imp\projects\ASCEND\transcribe-routes.ts`, mounted in `E:\imp\projects\ASCEND\server.ts`). That route must actually be live on Vercel for this to work — it will NOT work by running anything inside this `jarvis-desktop` folder alone.

Steps:
1. Read `config.js` here and note the exact `API_BASE` URL.
2. Confirm reachability: `curl -s -o /dev/null -w "%{http_code}\n" <API_BASE>/api/transcribe` — expect a 4xx (e.g. 400, since no body is sent), NOT a 404. A 404 means the route isn't deployed yet; if so, stop and report that `E:\imp\projects\ASCEND` needs to be pushed (`push.bat`) before dictation can work, and do not attempt further fixes in this repo (the fix lives in the ASCEND repo, out of scope here).
3. If reachable, send a real test: record ~2 seconds of audio via `Control+Space` dictation while a text editor (e.g. Notepad) is focused, speaking a short test phrase. Confirm the words actually get typed into Notepad.
4. If it fails at step 3, capture the exact error shown (native notification text, or check `main.js`/renderer console via `--inspect` or by temporarily opening devtools) and report the precise failure — do not guess or paper over it with a workaround.
5. Report clearly: (a) was `/api/transcribe` reachable, (b) did a real dictation round-trip work end-to-end, (c) exact error text if not, (d) whether the problem is in this repo or in the ASCEND backend.

## Rules
- Do not change the orb's visuals, particle engine, or Firestore/reminder logic — hotkey wiring and its labels only.
- Do not modify anything in `E:\imp\projects\ASCEND` from this task — if the backend needs a fix, report it, don't touch that repo.
- Smallest possible diff.
