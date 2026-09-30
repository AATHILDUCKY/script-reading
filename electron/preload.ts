import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('scriptFlow', {
  listScripts: () => ipcRenderer.invoke('scripts:list'),
  saveScript: (script: { id?: number; title: string; content: string; tags?: string }) => ipcRenderer.invoke('scripts:save', script),
  deleteScript: (id: number) => ipcRenderer.invoke('scripts:delete', id),
  importScript: () => ipcRenderer.invoke('scripts:import'),
  exportScript: (title: string, content: string) => ipcRenderer.invoke('scripts:export', title, content),
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  generate: (request: { content: string; action: string; model: string }) => ipcRenderer.invoke('ai:generate', request),
  selectVoiceModel: () => ipcRenderer.invoke('tts:selectModel'),
  ensureVoiceReady: () => ipcRenderer.invoke('tts:ensureReady'),
  speak: (request: { text: string; modelPath: string; pace: number }) => ipcRenderer.invoke('tts:speak', request),
  stopSpeech: () => ipcRenderer.invoke('tts:stop'),
  onSpeechEnded: (callback: (result: { ok: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: { ok: boolean }) => callback(result)
    ipcRenderer.on('tts:ended', listener)
    return () => ipcRenderer.removeListener('tts:ended', listener)
  },
  onVoiceSetupProgress: (callback: (progress: { message: string; percent: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { message: string; percent: number }) => callback(progress)
    ipcRenderer.on('tts:setupProgress', listener)
    return () => ipcRenderer.removeListener('tts:setupProgress', listener)
  },
})
