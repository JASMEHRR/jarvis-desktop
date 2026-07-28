/**
 * Preload for the glow overlay window — a much smaller surface than
 * preload.js since the overlay only ever needs to receive state changes,
 * never call back into transcription/typing/auth.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisOverlay', {
  onGlowState: (cb) => ipcRenderer.on('jarvis:glow-state', (_e, payload) => cb(payload)),
  onGlowLevel: (cb) => ipcRenderer.on('jarvis:glow-level', (_e, payload) => cb(payload)),
});
