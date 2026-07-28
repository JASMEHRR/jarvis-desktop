# Fix Prompt: dictation only transcribes part of what was said

## Context

Read `main.js` (the `getWhisper`/`jarvis:transcribe` handler, ~lines 291-385) and `renderer/index.html` (`tapPcm`, `createManualPcmRecorder`, ~lines 371-453). Reference-only, never touch `E:\imp\projects\ASCEND`.

User report: dictating a full paragraph, only about half of it ends up transcribed/typed.

## Ranked hypotheses (confirm with evidence before fixing — don't patch blind)

**H1 (most likely): the Whisper pipeline call has no long-form chunking config.** In `main.js`, `ipcMain.handle('jarvis:transcribe', ...)` calls `await transcriber(samples)` with no options object. transformers.js's Whisper implementation needs `chunk_length_s`/`stride_length_s` passed explicitly to engage its long-form transcription algorithm (sliding-window with overlap-stitching); without it, generation is a single decode pass that is well-documented to stop early on anything beyond a short clip — the model predicts an end-of-sequence/repetition and simply stops, silently truncating. This gets worse with smaller models.

**H1b (compounding factor):** the loaded model is `Xenova/whisper-tiny.en` — the code comment above it says "Whisper small, quantized, ~240MB" but the actual model string is `whisper-tiny.en` (~75MB). Tiny is the most prone of the whisper.cpp/transformers.js model sizes to early-stopping on longer utterances. Resolve this comment/code mismatch either way (either the comment is stale and tiny was intentionally chosen for speed, or it should actually be `whisper-base.en`/`whisper-small.en` as originally intended) and decide, with the user's accuracy-vs-latency tradeoff in mind, which model size to actually use going forward — default to upgrading to at least `whisper-base.en` given the truncation complaint, and report the new download size/latency tradeoff.

**H2 (rule out with evidence, don't assume):** the PCM capture (`tapPcm`'s `onaudioprocess` accumulator) or the `resampleTo16k` resample step truncates the audio itself before it ever reaches Whisper. Before touching the transcription call, add a temporary diagnostic: log `samples.length / 16000` (implied seconds of audio actually sent) on both the renderer side (right after `stop()` returns) and the main-process side (already partially logged via the existing `console.log` in the transcribe handler — check it actually reflects the full spoken duration). Have the user (or you, if you can drive it via IPC directly) dictate a paragraph you know the approximate spoken length of, and confirm the reported audio duration matches how long they actually spoke. If the audio duration itself is already short, the bug is in capture, not in Whisper's decoding — pursue that instead of H1.

## Task — fix based on what the evidence shows

If H1 confirmed (most likely): pass proper chunking options to the pipeline call, e.g. `transcriber(samples, { chunk_length_s: 30, stride_length_s: 5 })` (consult the actual transformers.js docs/types for the exact correct parameter names and reasonable defaults for a local, non-streaming dictation use case — don't guess parameter names, verify them). Also apply the model-size decision from H1b.

If H2 confirmed instead: fix the actual capture/resample bug you find — report exactly what was wrong (e.g. a rounding error in `resampleTo16k`'s ratio math for longer sample counts, or a mic-stream issue) rather than assuming.

Both may be true — check and fix both if so.

## Verification (report honestly, with real numbers)

1. Log and report the actual audio duration captured (renderer) vs. what the user actually spoke, for a real multi-sentence dictation test.
2. Log and report the transcribed text's word count / rough duration-equivalent vs. the audio duration — confirm the ratio is now consistent with full coverage (a truncated result has transcribed-duration noticeably less than audio-duration; a fixed result should track closely).
3. Real test: dictate a genuine 15-25 second paragraph (multiple sentences) into Notepad and confirm the ENTIRE thing is typed, not a partial fragment.
4. Report the new model's one-time download size and typical transcription latency for a ~10s clip if the model was changed, so the user knows the tradeoff.
5. `node --check main.js`; syntax-check the renderer script.
6. List every file modified, one-line reason each, and state plainly which hypothesis (H1, H1b, H2, or a combination) was actually confirmed as the root cause — don't report a fix without having confirmed what was actually broken.

## Hard rules

- Do not touch the screen-edge glow shader, dictation hotkeys, reminders, chat, or anything in `E:\imp\projects\ASCEND` — this is scoped strictly to transcription completeness.
- No new dependencies.
- If you change the model, make sure `scripts/download-whisper-model.js` (the postinstall model-download script) is updated to fetch the correct model name, and the `.whisper-cache` from the old model doesn't cause a stale-model bug (verify the new model actually loads, don't assume the cache path just works).
