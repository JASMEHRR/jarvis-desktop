# Rework Prompt: screen-edge glow effect (replaces the small widget), faster voice, QA loop, screenshot self-check

## Context

Read first: `main.js`, `preload.js`, `renderer/index.html`, `package.json`, `README.md` (current versions — this app has been reworked many times, don't assume prior shapes). Reference-only, do not touch `E:\imp\projects\ASCEND`.

Reference design (concept only — it's Swift/SwiftUI, you're translating the IDEA to Electron/HTML/CSS/canvas, not porting code): https://github.com/jacobamobin/AppleIntelligenceGlowEffect — the core idea is a soft, colorful, animated gradient traced along a rounded border, with the gradient's color stops randomly reshuffled every ~250-300ms and cross-faded, plus a blurred duplicate layer for glow softness. Read `IOS.swift` and `README.md` from that repo (via web fetch) to understand the exact technique (base sharp stroke layer + a second blurred/wider stroke layer, both animating the same shifting gradient stops) before implementing — don't guess at the technique, the repo documents it clearly.

The user has decided this "screen-edge glow" concept is a better visual language for Jarvis than the small flat-square indicator built in the previous session. Replace it.

## Task 1 — screen-edge glow overlay (replaces the small widget entirely)

Build a new, separate, full-screen overlay `BrowserWindow` that:
- Covers the ENTIRE primary display's bounds exactly (use `screen.getPrimaryDisplay().bounds`, not `workArea`, so it reaches the true physical screen edges, not just the space excluding the taskbar).
- Is frameless, transparent, `alwaysOnTop: true`, `skipTaskbar: true`, and **click-through** (`setIgnoreMouseEvents(true, { forward: true })`) so it never blocks interaction with whatever app the user is actually using.
- Renders ONLY a glow traced along the four screen edges (not a filled rectangle, not centered content) — an animated multi-color gradient (translate the reference repo's color palette or pick your own tasteful set; purples/pinks/blues like the reference read as "Apple Intelligence," which is fine to reuse or riff on) using the two-layer technique from the reference (sharp inner stroke + soft blurred outer stroke), with gradient stops reshuffling smoothly every ~250-300ms via CSS transitions or canvas/SVG animation — don't just statically render one gradient, it must visibly shift like the reference.
- Is invisible/hidden at true idle, and appears specifically during: listening (dictation or orb-talk), thinking (waiting on `/api/jarvis`), and speaking (TTS playing) — pick a way to subtly vary its intensity/speed per state if reasonable (e.g. calmer during listening, more energetic while speaking) but don't over-engineer this; a single consistent glow that just shows/hides per active-state is an acceptable baseline if a 3-state variant proves fiddly — use your judgment, note what you chose and why.
- Must not noticeably tax the CPU/GPU while idle-hidden (fully stop its animation loop when not needed, don't animate an invisible window) — the reference repo's own README explicitly flags a prior version had a 100% CPU timer-leak bug (see `PERFORMANCE_GUIDE.md` in that repo) and shipped a fix; learn from that mistake, don't repeat it (properly clear intervals/rAF when hidden, don't just set opacity:0 while still animating underneath).
- Remove the old small flat-square orb/status-indicator widget and its window entirely — the glow is now the ONLY visual indicator of Jarvis's state. The actual chat window (text bubbles, input box, when the user expands to type/read) still needs to exist for typed conversations — keep that part, only the idle/summon indicator changes from "small square" to "screen-edge glow." Reconcile how summoning/talking still works without the old click-to-expand orb (e.g. the hotkeys still trigger listening/thinking/speaking states which the glow now visualizes; decide sensibly how the user still opens the actual text chat window if they want to type instead of talk, and document your decision).

## Task 2 — faster voice

Jarvis's spoken replies (both the ElevenLabs path and the browser-speechSynthesis fallback) should sound noticeably faster/snappier. Increase playback rate on the `Audio` element used for ElevenLabs (`audio.playbackRate`, try ~1.15-1.25x, tune by ear if you can judge it, otherwise pick 1.2x as a reasonable default) and increase the `SpeechSynthesisUtterance.rate` fallback proportionally from its current value. Don't distort pitch — `playbackRate` on `Audio` preserves pitch reasonably at these small multipliers; confirm this stays intelligible, not chipmunked.

## Task 3 — error-sorting QA loop on the new overlay specifically

Run the same kind of rigorous audit-and-fix loop as the previous QA session, focused on what's NEW here (the full-screen overlay is a new class of risk — multi-window coordination, always-on-top layering, click-through correctness):
- Does the overlay ever accidentally intercept a click/steal focus from the app underneath (defeats the whole point)?
- Does it correctly cover the true screen edges on this specific machine's actual resolution/scaling (check `screen.getPrimaryDisplay()` values directly, don't assume 1920x1080)?
- Resource cleanup: overlay window and its animation timers fully torn down / paused when Jarvis goes idle, no leak across many show/hide cycles.
- Does it interact badly with the existing hide/mode-conflict fixes from earlier sessions (e.g. does ending a conversation or force-stopping dictation correctly also hide the glow)?
- Fix every real issue found; minimum 2 rounds, continue until a round finds nothing new (same stop condition as the previous QA session).

## Task 4 — screenshot self-check

You have no eyes, but you can still verify the glow actually renders rather than assuming from code review alone:
1. Programmatically trigger each state (listening/thinking/speaking) in a way you can drive without a real mic (e.g. call the relevant IPC/renderer functions directly, or fake a `/api/jarvis` response) with the overlay visible.
2. Use `webContents.capturePage()` on the overlay window (or, if that only captures the window's own transparent buffer unhelpfully, a full-desktop capture via a short PowerShell script using `System.Drawing`) to save a PNG per state into a new `screenshots/` folder in this repo.
3. Do a basic programmatic sanity check on each saved PNG (e.g. read pixel data and confirm it's not just a blank/fully-transparent image — you don't need full image understanding, just confirm non-trivial colored content exists near the edges) so you're not just trusting that capture "probably worked."
4. Report what you found, and leave the PNGs in place for the user to actually look at and judge.

## Verification (report honestly)
1. `node --check main.js`/`preload.js` clean; renderer scripts syntax-checked.
2. Confirm click-through actually works (clicking where the glow renders should interact with whatever's behind it, not the overlay).
3. Confirm the screenshots exist and passed the basic sanity check in Task 4.
4. Confirm voice now plays back faster and is still intelligible.
5. Update `README.md` to describe the new screen-edge glow (replacing the old widget description) and how to still open the text chat window.
6. List every file created/modified/deleted, one-line reason each.

## Hard rules
- Do not touch `/api/jarvis`/`/api/tts` request logic itself (only the client-side playback rate) or anything in `E:\imp\projects\ASCEND`.
- Do not regress the local-whisper transcription or manual double-tap dictation behavior from the previous session — this prompt is about the VISUAL indicator and voice speed only.
- No new dependencies unless truly unavoidable — flag first.
- If true click-through + full-screen-edge coverage turns out to have a real Windows/Electron limitation you can't work around, stop and report exactly what you tried and what broke, rather than shipping something that silently blocks clicks or misrenders.
