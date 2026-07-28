# Fix Prompt: unreliable transcription + near-invisible orb

## Context

Read first (current versions — this app has been through several rounds of changes): `main.js`, `renderer/index.html`, `README.md`.

User testing feedback, verbatim problems to solve:
1. When dictating (Right Ctrl double-tap) or talking to Jarvis (orb), it's unclear whether speech actually got transcribed — the listening window closes/auto-stops and there's no clear confirmation of what happened.
2. Longer sentences spoken at normal-to-quiet volume: the mic clearly picks up SOMETHING (recording starts, orb reacts) but the words often fail to transcribe — likely being cut off mid-sentence by the silence-detection auto-stop, or the audio is too quiet for the ASR model.
3. The orb itself is described as "very translucent," "not visible," "I can't see it anywhere" — whatever is currently rendering is failing to read as a visible object on a real desktop background (varies by wallpaper/apps behind it), not just "I don't like the style."

## Task 1 — fix transcription reliability

The current auto-stop logic (added in a prior session) uses a fixed noise-floor + fixed silence duration to decide when the user has finished talking. This is very likely the root cause of #1 and #2. Fix properly, don't just tweak one number blindly:

1. **Calibrate the noise floor per-session instead of hardcoding it.** Sample the mic's ambient level for the first ~300-400ms after `getUserMedia` resolves (before the user has necessarily started talking) to establish a baseline, then use "baseline + a delta" as the real speech-detection threshold, rather than a fixed absolute number like `0.08` that will be wrong in a quiet room vs. a noisy one, and wrong for someone who naturally speaks softly.
2. **Loosen premature cutoff.** Longer or quieter sentences are getting cut off mid-thought. Increase the silence-required-to-end-turn window (current ~1100ms is too short for natural mid-sentence pauses/breaths) — a good starting point is ~1.6-1.8s, but actually test with real speech and tune, don't just guess a number and move on. Consider a debounce: if speech resumes within a short grace window after crossing the silence threshold, cancel the pending stop instead of ending the recording.
3. **Never leave the user unsure what happened.** After every recording ends (whether by auto-stop, manual force-stop, or timeout), the orb/pill's hint text AND a native notification (already have `Notification` wired in `main.js` — reuse it) must clearly state one of: "Heard: <first few words>… typing it" / "Didn't catch that — try again" / "Transcription failed: <reason>". Silence with no feedback is the actual bug the user is reacting to — fix the feedback loop even if perfect transcription accuracy can't be guaranteed.
4. **Verify audio isn't being sent too short/too quiet to the `/api/transcribe` endpoint.** Check the actual blob duration/size being sent for a real "spoken quietly for 5+ seconds" test case — if calibration in step 1 is right this should mostly resolve itself, but confirm end-to-end with a real test, don't just assume the fix worked from reading the code.

## Task 2 — make the orb actually visible

The orb is currently rendering too transparent/washed-out to be seen reliably against arbitrary desktop backgrounds. Rebuild its visual base so it reads clearly:

1. Add a genuinely opaque (or near-opaque, e.g. 80-90% alpha minimum) solid dark backing disc behind the particle field — something like a dark glass circle (`rgba(8,14,20,0.85)`+ with a soft border) so the orb is never "just a faint glow over your wallpaper." The particle-network animation sits ON TOP of this solid backing, not instead of it.
2. Increase contrast of the particles and connecting lines significantly — brighter cyan, higher minimum alpha even at idle, so it's legible at a glance without hunting for it.
3. Test this by actually taking a screenshot (or getting the user to describe) the orb sitting over a bright/light desktop background AND a dark one — "translucent, not visible" strongly suggests it currently only barely works over dark backgrounds, if at all.
4. Keep the particle-network style (connecting lines, rotation, voice-reactivity) — the user does want an animated version, they just want it SOLID and CLEARLY VISIBLE, and want the animation itself improved/more dynamic (not just brighter) — feel free to make the motion more visually interesting (e.g. more noticeable reaction to voice energy, livelier idle motion) as long as it stays readable and doesn't become distracting/chaotic. Use your judgment for tasteful improvement here since "way better" is intentionally open — but don't change the fundamental particle-network concept, the user has confirmed they like that concept, just not this specific execution.

## Verification (report honestly)
1. `node --check main.js` clean; renderer script has no syntax errors.
2. Real test: dictate a full, longer sentence (8+ words) at normal conversational volume into Notepad — confirm it types the COMPLETE sentence, not a truncated fragment.
3. Real test: dictate a shorter sentence quietly (near-whisper volume) — confirm it still transcribes correctly, or if it genuinely can't hear it, confirms via clear feedback rather than silently failing.
4. Real test: after each dictation attempt (success or failure), confirm a clear notification/on-screen message appears stating what happened.
5. Visually confirm (screenshot or detailed description) the orb is clearly visible over both a light and dark area of the screen.
6. List every file modified with a one-line reason each.

## Hard rules
- Do not touch `E:\imp\projects\ASCEND`.
- Do not change the conversation-loop logic from the previous session except where the silence-detection constants are shared with it (in which case update both consistently — check whether `renderer/index.html`'s conversation loop and dictation reuse the same detection constants/function, and keep them in sync).
- No new dependencies unless unavoidable — flag first if so.
