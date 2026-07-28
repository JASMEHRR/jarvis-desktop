/**
 * postinstall: pre-fetch the local Whisper (base.en, quantized) model into
 * .whisper-cache/ so the first dictation doesn't stall on a ~145MB download.
 * Cache lives outside node_modules so it survives a fresh `npm install`.
 * Never fails the install — worst case, main.js downloads it lazily on first use.
 */
const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

env.cacheDir = path.join(__dirname, '..', '.whisper-cache');
env.allowLocalModels = false;

(async () => {
  console.log('[jarvis] fetching local Whisper (tiny.en, quantized, ~40MB, one-time)...');
  await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { quantized: true });
  console.log('[jarvis] Whisper model ready — dictation now works fully offline.');
})().catch((e) => {
  console.error('[jarvis] Whisper model download failed:', e.message);
  console.error('[jarvis] Not fatal — it will retry automatically the first time you dictate.');
});
