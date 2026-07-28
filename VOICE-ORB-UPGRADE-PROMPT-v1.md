# Upgrade Prompt: JARVIS Desktop — unify orb+dictation, auto-stop, real voice, shrink orb

## Context (read every file below before changing anything)

Read first: `main.js`, `preload.js`, `renderer/index.html`, `renderer/dictation.html`, `config.js`, `package.json`, `README.md`.

This is a standalone Electron app (repo root = this folder, NOT the Ascend web repo). It talks to the deployed Ascend backend at `API_BASE` in `config.js` (currently `https://ascend-delta-sage.vercel.app`) for `/api/jarvis` (chat), `/api/transcribe` (speech-to-text, Gemini), and now also `/api/tts` (text-to-speech, ElevenLabs — already built and deployed server-side, see `E:\imp\projects\ASCEND\tts-routes.ts` and `E:\imp\projects\ASCEND\src\features\jarvis\voice\useVoice.ts` for the exact contract to mirror; do not modify that repo, only read it as reference).

**`/api/tts` contract** (already live): `POST { text: string, voiceId: string }` → on success, raw `audio/mpeg` bytes; on failure, JSON `{ error, code }` where `code` is `"quota"`, `"not_configured"`, or `"upstream"`. Use voice id `onwK4e9ZLuTAKqWW03F9` ("Daniel — British, authoritative") to match the persona already used on Ascend web, unless a quota/not_configured error comes back, in which case fall back to the browser's `speechSynthesis` exactly like `useVoice.ts` does (`speakBrowser` there is the reference implementation — pick a natural English voice by the same scoring heuristic, don't just take `voices[0]`).

## Step 0 — diagnose why the last round of changes didn't visibly take effect

Before writing new code, figure out what actually happened last session:
1. Was `npm install` ever run after `uiohook-napi` was added to `package.json`'s dependencies? Check `node_modules/uiohook-napi` exists and actually loads: `node -e "require('uiohook-napi')"` should not throw.
2. Launch the app (`npm start`) and watch the terminal output for `[jarvis] uiohook-napi unavailable, falling back to Ctrl+Alt shortcuts` — if that line appears, the double-tap hook never activated and the user has only ever had the Ctrl+Alt+J / Ctrl+Alt+D fallback, which explains "the previous keys are only working."
3. Report which of these was the actual cause before proceeding, so we don't repeat it.

## Task — four changes

### 1. Merge dictation into the orb itself (no separate pill)
Currently `dictWin` (`renderer/dictation.html`) is a separate small window with a plain pulsing-dot animation, used only for dictation, while `mainWin` (`renderer/index.html`) shows the particle-network orb for chat. Unify these: delete the dictation pill UI entirely. The SAME particle-orb window (`mainWin`) should be used for both chat-summon (double-tap Right Shift) and dictation (double-tap Right Ctrl):
- Double-tap Right Ctrl: show `mainWin` in a new **non-focusable** "dictate" mode (reuse `focusable: false` like the old `dictWin` had, so the app the user was typing into keeps keyboard focus) positioned bottom-center, start recording immediately, orb animates reactively to mic input (this part already exists in `index.html`'s `orbEngine`/`readMicLevel` — reuse it, don't rewrite the particle engine).
- Double-tap Right Shift: show `mainWin` in the existing focusable orb/chat mode as today.
- These are two different window configs (focusable vs not) — you may need to destroy/recreate the BrowserWindow when switching modes, or use `setFocusable()` if that's reliable enough (test it; if `setFocusable(false)` on an already-shown window doesn't reliably give up focus on Windows, recreate the window instead — don't guess, verify by testing).
- Remove `renderer/dictation.html`, the `dictWin`/`createDict`/`toggleDictation` pill-window logic in `main.js`, and the `dict:start`/`dict:stop`/`dict:done` IPC channels — replace with whatever new IPC/state you need for the unified orb's two modes.

### 2. Auto-stop recording on silence (no second key press needed)
Currently dictation requires pressing the hotkey again to stop. Replace with voice-activity auto-stop:
- Use the existing `AnalyserNode` / `readMicLevel()` pattern already in `index.html` (don't reinvent it).
- Track: recording only auto-stops after (a) at least ~600ms of actual speech has been detected (average level above a noise-floor threshold) AND (b) ~1.1s of continuous silence follows. Tune thresholds by testing with real speech — don't just pick numbers and assume they work.
- Keep a hard safety cap (the existing 120s max) in case detection fails.
- Once auto-stopped, the existing transcribe → type flow runs exactly as today.
- The hotkey should still be able to force-stop early if double-tapped again mid-recording (manual override stays available, just no longer required).

### 3. Real human-like voice via ElevenLabs
Replace the `speechSynthesis`-only `speak()` function in `renderer/index.html` with a version that calls `${API_BASE}/api/tts` first (voice id `onwK4e9ZLuTAKqWW03F9`), plays the returned mp3 via an `Audio` element, and falls back to the existing browser TTS only on a `quota`/`not_configured`/non-OK response — mirror the resilience pattern in Ascend's `useVoice.ts` (`speakEleven`/`speakBrowser`/generation-counter-to-avoid-stale-audio) since that's a proven pattern for exactly this. Drive the orb's `orbSpeaking` reactive state off whichever engine actually ends up playing (audio element's play/pause events for ElevenLabs, utterance events for the fallback).

### 4. Shrink the orb further — "way smaller"
Current orb canvas is 260×260 logical / 128px CSS, window 150×178. Cut it down significantly — target roughly 70–80px CSS diameter for the visible orb, with the Electron window sized just large enough to contain it plus the small hint/expand controls beneath (recompute `ORB_SIZE` in `main.js` and the canvas/CSS dimensions in `index.html` together so nothing gets clipped). Keep the particle-network look (connecting lines + rotation + voice-reactivity) — the user explicitly likes that animation style; just render it smaller, not simpler.

## Verification (do all of these, report honestly if any fail)
1. `node --check main.js` and `node --check preload.js` clean.
2. Launch the app; confirm in the terminal which hotkey path is active (double-tap hook vs fallback) and that it matches what's documented.
3. Manually test: double-tap Right Shift shows the small orb; double-tap Right Ctrl (with e.g. Notepad focused) starts listening WITHOUT stealing focus from Notepad, and speaking a sentence then pausing auto-types it into Notepad without any second key press.
4. Manually test a chat reply and confirm audio actually plays through `/api/tts` (check dev tools network tab or add a temporary console.log) — if ElevenLabs quota is exhausted server-side, confirm it falls back to browser speech instead of going silent.
5. Confirm the orb visually shrank and still animates (particles + lines + rotation + voice reactivity) — take a screenshot or describe what you see.
6. Update `README.md` to describe the new unified orb behavior, auto-stop dictation, and the ElevenLabs voice (remove stale references to the old pill window).
7. List every file created/deleted/modified with a one-line reason each.

## Hard rules
- Do not touch anything under `E:\imp\projects\ASCEND` — read-only reference only.
- Do not reintroduce a second hotkey press requirement for dictation — auto-stop is the whole point of this change.
- Preserve the existing reminders/Firestore logic in `index.html` untouched except where it must move because of the window-mode refactor.
- No new dependencies beyond what's already in `package.json` unless something is truly unavoidable — if so, flag it before adding.
- If something in this spec turns out to be technically impossible on Windows/Electron as described (e.g. focus-stealing can't be avoided in dictate mode), stop and report exactly why, with what you tried, rather than shipping a silently broken version.
