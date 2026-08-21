const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  getConfig: () => ipcRenderer.invoke('pet:getConfig'),
  getPresets: () => ipcRenderer.invoke('pet:getPresets'),
  applyPreset: (presetId) => ipcRenderer.invoke('pet:applyPreset', presetId),
  setConfig: (partial) => ipcRenderer.invoke('pet:setConfig', partial),
  openApp: (url) => ipcRenderer.invoke('pet:openApp', url),
  loginViaApp: () => ipcRenderer.invoke('pet:loginViaApp'),
  openSettings: () => ipcRenderer.invoke('pet:openSettings'),
  quit: () => ipcRenderer.invoke('pet:quit'),
  dragStart: (screenX, screenY) => ipcRenderer.send('pet:dragStart', { screenX, screenY }),
  dragMove: (screenX, screenY) => ipcRenderer.send('pet:dragMove', { screenX, screenY }),
  drag: (dx, dy) => ipcRenderer.send('pet:drag', { dx, dy }),
  dragEnd: () => ipcRenderer.send('pet:dragEnd'),
  noticeAttention: () => ipcRenderer.send('pet:noticeAttention'),
  setClickThrough: (enabled) => ipcRenderer.send('pet:setClickThrough', !!enabled),
  resizeBy: (dw, dh) => ipcRenderer.send('pet:resizeBy', { dw, dh }),
  getBounds: () => ipcRenderer.invoke('pet:getBounds'),
  setBounds: (bounds) => ipcRenderer.invoke('pet:setBounds', bounds),
  startWander: (opts) => ipcRenderer.invoke('pet:startWander', opts || {}),
  stopWander: (reason) => ipcRenderer.invoke('pet:stopWander', reason),
  setWanderPaused: (paused) => ipcRenderer.invoke('pet:setWanderPaused', paused),
  onSimulate: (cb) => {
    const handler = (_e, type) => cb(type);
    ipcRenderer.on('pet:simulate', handler);
    return () => ipcRenderer.removeListener('pet:simulate', handler);
  },
  onConfigUpdated: (cb) => {
    const handler = (_e, cfg) => cb(cfg);
    ipcRenderer.on('pet:configUpdated', handler);
    return () => ipcRenderer.removeListener('pet:configUpdated', handler);
  },
  onActivity: (cb) => {
    const handler = (_e, kind) => cb(kind);
    ipcRenderer.on('pet:activity', handler);
    return () => ipcRenderer.removeListener('pet:activity', handler);
  },
  onWander: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('pet:wander', handler);
    return () => ipcRenderer.removeListener('pet:wander', handler);
  },
});
