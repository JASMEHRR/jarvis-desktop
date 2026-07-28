/**
 * Preload — the only bridge between renderer pages and the main process.
 * Exposes a minimal, explicit API; no Node primitives leak into the page.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  hide: () => ipcRenderer.send('jarvis:hide'),
  typeText: (text) => ipcRenderer.invoke('jarvis:type-text', text),
  transcribe: (pcmArrayBuffer) => ipcRenderer.invoke('jarvis:transcribe', pcmArrayBuffer),
  notify: (title, body) => ipcRenderer.send('jarvis:notify', { title, body }),
  reminderDue: (text) => ipcRenderer.send('jarvis:reminder-due', { text }),
  dictateDone: () => ipcRenderer.send('jarvis:dictate-done'),
  reportGlowState: (state) => ipcRenderer.send('jarvis:glow-state', { state }),
  reportGlowLevel: (level) => ipcRenderer.send('jarvis:glow-level', { level }),
  onMode: (cb) => ipcRenderer.on('jarvis:mode', (_e, payload) => cb(payload)),
  onDictateForceStop: (cb) => ipcRenderer.on('jarvis:dictate-force-stop', cb),
  onHiding: (cb) => ipcRenderer.on('jarvis:hiding', cb),
});
