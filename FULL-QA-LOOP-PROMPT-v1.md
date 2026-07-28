# Full QA Loop: audit, break, fix, repeat — then hand off a manual test

## Context

Read every file in this folder first: `main.js`, `preload.js`, `renderer/index.html`, `package.json`, `README.md`, and the reference-only backend at `E:\imp\projects\ASCEND\transcribe-routes.ts` / `jarvis-routes.ts` / `llm.ts` (read-only, do not modify anything under `E:\imp\projects\ASCEND`).

Current state of this app, so you know what "should" be true before hunting for what's wrong:
- Double-tap Right Shift summons the orb (talk to Jarvis); double-tap Right Ctrl dictates into whatever app has focus. Both use `uiohook-napi` for the raw key hook, with a Ctrl+Alt+J / Ctrl+Alt+D fallback if that fails to load.
- Talking to Jarvis via the orb is a continuous conversation loop (listen → transcribe → send to `/api/jarvis` → speak reply → listen again), ending when the user clicks the orb again or goes quiet for ~9s.
- Dictation and the conversation loop share one `createVoiceTurn()` recording helper with per-session noise-floor calibration and a ~1.7s silence-ends-turn window.
- Voice replies use ElevenLabs via the Ascend backend's `/api/tts`, falling back to browser `speechSynthesis` on quota/failure.
- Transcription now tries Groq's Whisper first, falling back to Gemini only if Groq is unavailable/fails (just deployed — confirm it's actually live before assuming it works).
- Tray has a "Start JARVIS with Windows" toggle; `Launch JARVIS.vbs` / `Create Shortcut.vbs` exist for launching without a terminal.

You will not be able to judge subjective audio "feel" (does the voice sound natural, does the silence timing feel laggy) — you have no ears. Don't pretend you can. Everything else — correctness, resource leaks, race conditions, error handling, and anything observable via logs/network/process state — is fully in scope and you should be relentless about it.

## The loop (repeat rounds until a full round finds zero new real bugs, minimum 3 rounds)

**Round type A — static re-audit.** Re-read every file with fresh eyes as if reviewing someone else's PR. Specifically hunt for:
- Resource leaks: every `getUserMedia` stream, `AudioContext`, `MediaRecorder`, and `requestAnimationFrame`/`setTimeout`/`setInterval` — confirm each has a corresponding stop/cleanup on every exit path (success, error, user-cancel, app-quit), not just the happy path.
- Race conditions: can dictation mode and conversation-loop mode ever both try to grab the mic at once? What happens if the user double-taps Right Shift WHILE a Right Ctrl dictation is mid-recording, or vice versa? What happens if the orb is clicked to end a conversation at the exact moment a `/api/jarvis` response arrives?
- IPC consistency: every channel name sent from `preload.js`/`renderer` has a matching listener in `main.js` and vice versa — grep for every `ipcRenderer.send`/`invoke`/`on` and every `ipcMain.on`/`handle` and cross-check there's no orphaned or renamed channel left over from earlier refactors.
- Error handling: every `fetch` call (jarvis, transcribe, tts) — confirm a non-OK response and a network failure both produce a clear user-visible outcome (hint text + notification), never a silent swallow.
- Timing/threshold consistency: are the noise-floor calibration, silence-window, and conversation-timeout constants defined once and shared, or have they drifted into multiple copies that could disagree?

**Round type B — live-run testing.** Actually launch the app (`npm start`) and, without needing a real mic, exercise as many paths as you can:
- Watch the terminal for any error/warning on startup (uiohook load, tray creation, window creation).
- Deliberately break things: temporarily point `config.js`'s `API_BASE` at an unreachable URL, trigger a chat/transcribe call, confirm the failure is handled gracefully (clear error shown, app doesn't crash), then RESTORE the correct URL before moving on — don't leave it broken.
- Rapid-fire the same hotkey twice quickly (simulate via calling the relevant functions directly if you can't literally double-tap a physical key) to check for double-invocation bugs.
- Quit the app (or simulate `will-quit`) while a recording/timer is theoretically active — confirm no unhandled exception in the process's exit path.

**Round type C — adversarial / edge cases.** Think like someone trying to break this on purpose:
- What if `uiohook-napi` throws AFTER `setupDoubleTapHook` returns true (e.g. mid-session failure)? Is there any recovery, or does the app go dark?
- What if the Firestore reminder listener never resolves (offline)? Does anything else block on it?
- What if the user has no microphone at all — does `getUserMedia` rejection get a clear message everywhere it's called (dictation, conversation loop, chat mic button), or only in some paths?
- Multi-monitor: does `winBounds()` handle a primary display that isn't at (0,0), or a very small/very large primary display, sensibly?

After each round: fix every REAL bug found (not stylistic nitpicks — this is about correctness, not taste), re-run `node --check main.js` and a syntax pass on the renderer script, then start the next round. If a round turns up nothing, say so plainly and still do at least 3 rounds total before stopping the loop — but don't manufacture fake findings just to seem thorough; report "round N: no new issues found" honestly if that's the case.

## When to stop the loop

Stop once a full round finds zero new real (not cosmetic) issues, with a minimum of 3 rounds. At that point, write `MANUAL-QA-CHECKLIST.md` in this folder: a precise, numbered, step-by-step list of everything that genuinely requires a human to verify (voice naturalness, silence-timing feel, orb visibility over specific real backgrounds, whether the 9s conversation-timeout feels right, whether dictation into 2-3 different real apps works), each with a blank space for the user to note pass/fail so it's easy to report back precisely.

## Final report

For every round: what you checked, what you found (or "nothing new"), what you fixed. Then point clearly to `MANUAL-QA-CHECKLIST.md` as the next step for the user. Do not claim the app is "perfect" — claim exactly what was verified and what still needs a human.

## Hard rules
- Never leave `config.js` or any file in a deliberately-broken test state — always restore before finishing.
- Do not touch `E:\imp\projects\ASCEND` at all, read-only reference only.
- No new dependencies unless truly unavoidable — flag before adding.
- Do not change the orb's visual style or animation in this pass unless you find an actual bug in it (e.g. a memory/CPU leak in the render loop) — this loop is about correctness and robustness, not redesign.
