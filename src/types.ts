export type Script = {
  id?: number
  title: string
  content: string
  tags: string
  createdAt?: string
  updatedAt?: string
}

export type AiResult = { ok: true; text: string } | { ok: false; error: string }

export interface ScriptFlowApi {
  listScripts(): Promise<Script[]>
  saveScript(script: Script): Promise<number>
  deleteScript(id: number): Promise<boolean>
  importScript(): Promise<{ title: string; content: string } | null>
  exportScript(title: string, content: string): Promise<boolean>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<boolean>
  generate(request: { content: string; action: string; model: string }): Promise<AiResult>
  selectVoiceModel(): Promise<string | null>
  ensureVoiceReady(): Promise<string>
  speak(request: { text: string; modelPath: string; pace: number }): Promise<{ ok: boolean; error?: string }>
  stopSpeech(): Promise<boolean>
  onSpeechEnded(callback: (result: { ok: boolean }) => void): () => void
  onVoiceSetupProgress(callback: (progress: { message: string; percent: number }) => void): () => void
}

declare global {
  interface Window { scriptFlow: ScriptFlowApi }
}
