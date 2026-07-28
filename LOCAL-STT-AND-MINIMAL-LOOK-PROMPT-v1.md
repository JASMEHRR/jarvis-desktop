# Rework Prompt: fully local transcription + minimal/plain visual redesign

## Context

Read first: `main.js`, `preload.js`, `renderer/index.html`, `package.json`, `README.md` (all reworked multiple times already — read the CURRENT versions, don't assume prior-session shapes). Reference-only, do not modify: `E:\imp\projects\ASCEND` (any folder/file in there).

This app currently sends recorded audio to the deployed Ascend backend's `/api/transcribe` (Groq/Gemini) for speech-to-text, and uses ElevenLabs (also via the Ascend backend, `/api/tts`) for spoken replies. **Voice replies (`/api/tts`) and the chat backend (`/api/jarvis`) are explicitly OUT OF SCOPE for this prompt — leave them exactly as they are.** Only the transcription/dictation path changes.

## Task 1 — fully local transcription, no API key, no network call

Replace the remote `/api/transcribe` call entirely with on-device transcription via a local Whisper model (the "small" size, ~500MB one-time download, better accuracy than tiny). No audio should ever leave the machine for this feature; no API key or account should be required.

Implementation guidance (use your judgment on exact package/approach, but respect these constraints):
1. Investigate and pick a maintained Node package that runs whisper.cpp (or an equivalent local Whisper runtime) on Windows without requiring the user to hand-compile anything — e.g. `nodejs-whisper` or a comparable actively-maintained wrapper. Verify it actually installs and runs on a real Windows machine (this one) before committing to it; if your first choice fails to install/run cleanly, try an alternative rather than shipping something broken. Report clearly which package you ended up using and why.
2. Whisper.cpp-style runtimes need a 16kHz mono WAV file, not the webm/opus blob the renderer currently records. Prefer capturing raw PCM directly via the Web Audio API (e.g. an `AudioWorkletNode`/`ScriptProcessorNode` tapped off the existing `getUserMedia` stream) and writing a WAV file yourself (this is a well-known, fairly small amount of code) rather than pulling in a large `ffmpeg` binary dependency just for format conversion — but if that proves impractical, `ffmpeg-static` is an acceptable fallback; flag the size tradeoff if you go that route.
3. Model download: handle the one-time "small" model fetch as part of `npm install`'s postinstall (or a clearly-documented first-run step in `README.md` if a postinstall script is awkward with the chosen package) — the user should not have to figure this out manually.
4. Run the actual whisper inference in the Electron MAIN process (not the renderer) via IPC: renderer records → sends the raw audio/PCM to main → main writes the WAV, runs local whisper, returns text → renderer proceeds with the existing type-into-active-app flow. Keep this off the renderer thread so a slow transcription doesn't freeze any UI.
5. Confirm realistic latency on this machine (small model, few seconds of speech) and report the actual number you observe — don't guess.

## Task 2 — simplify dictation to explicit manual start/stop (remove auto-silence-detection for dictation ONLY)

The user wants dictation to work exactly like this, nothing smarter:
- Double-tap Right Ctrl → start recording.
- Double-tap Right Ctrl again → stop recording, transcribe everything captured in between, type it into the focused app.
- No auto-stop-on-silence, no calibration, no timeout-based ending for this path — purely the two explicit double-taps.

The shared `createVoiceTurn()` helper (built in an earlier session) currently drives BOTH dictation and the orb's continuous conversation loop with the same auto-stop-on-silence logic. Split this apart: dictation must use pure manual start/stop as described above; the orb-to-Jarvis conversation loop (double-tap Right Shift, talk-back-and-forth) should keep its existing auto-stop-on-silence behavior UNCHANGED — the user did not ask to change that, only dictation. Make sure this split doesn't reintroduce the mode-conflict bugs fixed in the previous QA session (can't have both recording paths grab the mic at once, hiding the window must still cleanly stop whichever is active, etc.) — re-verify those specifically after this refactor since you're touching the exact code that was patched for them.

## Task 3 — minimal, plain visual redesign (remove the sci-fi/Marvel/"Jarvis orb" look entirely)

The user explicitly does NOT want: a particle-network/glowing orb, sci-fi color treatment, anything that reads as "Iron Man Jarvis" or "agentic AI OS." They want something that looks like a normal, plain utility app widget — understated, not a showpiece.

Replace the current canvas-based particle orb (`orbEngine` in `renderer/index.html`) with something genuinely minimal:
- A small, simple, static-ish shape (e.g. a plain circle or rounded square, one flat/muted color, no gradient glow, no particles, no connecting lines, no rotation).
- Animation limited to something subtle and functional: e.g. a gentle opacity or scale pulse to indicate "listening"/"speaking"/"thinking" state, nothing more elaborate. State should still be visually distinguishable (idle vs listening vs thinking vs speaking) but through simple, restrained means (e.g. color shift + a slow single pulse), not motion spectacle.
- Keep it small (continue the "way smaller" direction from earlier feedback) and make sure it's actually visible/opaque against arbitrary desktop backgrounds (this was a real bug fixed last session — don't regress it while redesigning).
- Remove the "click to talk" / particle-specific hint copy and replace with whatever plain equivalent fits the new look.
- This redesign applies ONLY to the orb/summon window's idle+chat visual — do not touch the chat window's actual message bubbles/input layout/functionality beyond what's needed to remove now-dead CSS/references to the old look.

Use your own reasonable design judgment for the exact shape/colors within "minimal, plain, not sci-fi" — you don't need to ask for a second round of clarification on this, just clearly avoid neon-cyan-glow/particle-network aesthetics and anything Marvel/Jarvis-coded.

## Verification (report honestly)
1. `node --check main.js` / `preload.js` clean; renderer script syntax-checked.
2. Confirm the local whisper package actually installed and ran a real transcription end-to-end on this machine, with no network call involved (you can verify no network call by checking there's no more `fetch` to `API_BASE`/`/api/transcribe` anywhere in the dictation path).
3. Confirm dictation now requires exactly two double-taps (start, stop) with no auto-stop, and report the observed transcription latency.
4. Confirm the orb-to-Jarvis conversation loop (Right Shift) still auto-stops on silence as before, unaffected by the dictation change.
5. Confirm the redesigned orb is visible over both light and dark desktop backgrounds and re-verify the mode-conflict / hide-while-recording fixes from the last QA session still hold with the refactored recording code.
6. Update `README.md` to describe: fully local transcription (no API key, one-time model download), manual double-tap start/stop dictation, and the new minimal visual look — remove stale references to the old particle-orb description.
7. List every file created/modified/deleted with a one-line reason each, and the exact npm package(s) added.

## Hard rules
- Do not touch `/api/jarvis` chat or `/api/tts` voice paths, or anything in `E:\imp\projects\ASCEND`.
- Do not reintroduce auto-stop-on-silence for dictation — manual double-tap only, that's the explicit spec.
- If the chosen local-whisper package genuinely cannot be made to work reliably on this Windows machine after a real attempt, stop and report exactly what failed rather than shipping something that silently doesn't transcribe.
