import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import Database from 'better-sqlite3'
let mainWindow: BrowserWindow | null = null
let db: Database.Database
let piperServer: ChildProcess | null = null
let piperModel = ''
let piperPort = 5011
let audioProcess: ReturnType<typeof spawn> | null = null
let speechId = 0
let voiceSetupPromise: Promise<string> | null = null
const setupProcesses = new Set<ChildProcess>()
let isQuitting = false

type ScriptInput = {
  id?: number
  title: string
  content: string
  tags?: string
}

function initializeDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'scriptflow.sqlite3')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

function registerIpc() {
  ipcMain.handle('scripts:list', () => db.prepare(
    'SELECT id, title, content, tags, created_at AS createdAt, updated_at AS updatedAt FROM scripts ORDER BY datetime(updated_at) DESC'
  ).all())

  ipcMain.handle('scripts:save', (_event, input: ScriptInput) => {
    const title = input.title.trim() || 'Untitled script'
    if (input.id) {
      db.prepare('UPDATE scripts SET title = ?, content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(title, input.content, input.tags ?? '', input.id)
      return input.id
    }
    return Number(db.prepare('INSERT INTO scripts (title, content, tags) VALUES (?, ?, ?)')
      .run(title, input.content, input.tags ?? '').lastInsertRowid)
  })

  ipcMain.handle('scripts:delete', (_event, id: number) => {
    db.prepare('DELETE FROM scripts WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('scripts:import', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import a script',
      properties: ['openFile'],
      filters: [{ name: 'Script files', extensions: ['txt', 'md'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    return {
      title: path.basename(filePath, path.extname(filePath)),
      content: await fs.readFile(filePath, 'utf8'),
    }
  })

  ipcMain.handle('scripts:export', async (_event, title: string, content: string) => {
    if (!mainWindow) return false
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export script',
      defaultPath: `${title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'script'}.txt`,
      filters: [{ name: 'Text file', extensions: ['txt'] }, { name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, content, 'utf8')
    return true
  })

  ipcMain.handle('tts:selectModel', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a Piper voice model',
      properties: ['openFile'],
      filters: [{ name: 'Piper voice model', extensions: ['onnx'] }],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('tts:ensureReady', (event) => {
    if (isQuitting) throw new Error('The application is closing')
    if (!voiceSetupPromise) {
      voiceSetupPromise = installDefaultVoice((message, percent) => {
        if (!event.sender.isDestroyed()) event.sender.send('tts:setupProgress', { message, percent })
      }).catch((error) => {
        voiceSetupPromise = null
        throw error
      })
    }
    return voiceSetupPromise
  })

  ipcMain.handle('tts:stop', () => {
    speechId += 1
    audioProcess?.kill('SIGTERM')
    audioProcess = null
    return true
  })

  ipcMain.handle('tts:speak', async (event, request: { text: string; modelPath: string; pace: number }) => {
    try {
      if (!request.modelPath) throw new Error('Choose a Piper voice model first')
      await fs.access(request.modelPath)
      await ensurePiperServer(request.modelPath)
      speechId += 1
      const currentSpeechId = speechId
      audioProcess?.kill('SIGTERM')

      const response = await fetch(`http://127.0.0.1:${piperPort}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          length_scale: Math.max(0.6, Math.min(1.8, 145 / request.pace)),
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`Piper returned ${response.status}`)
      const wavPath = path.join(app.getPath('temp'), `scriptflow-speech-${process.pid}.wav`)
      await fs.writeFile(wavPath, Buffer.from(await response.arrayBuffer()))

      audioProcess = spawn('aplay', ['-q', wavPath], { stdio: 'ignore' })
      await new Promise<void>((resolve, reject) => {
        audioProcess?.once('spawn', resolve)
        audioProcess?.once('error', reject)
      })
      audioProcess.once('close', (code) => {
        if (currentSpeechId !== speechId) return
        audioProcess = null
        if (!event.sender.isDestroyed()) event.sender.send('tts:ended', { ok: code === 0 })
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Local voice failed' }
    }
  })

  ipcMain.handle('settings:get', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  })
  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
    return true
  })

  ipcMain.handle('ai:generate', async (_event, request: { content: string; action: string; model: string }) => {
    const prompts: Record<string, string> = {
      improve: 'Rewrite this YouTube script so it sounds natural when spoken. Strengthen clarity, rhythm, transitions, and emotional pull. Preserve all factual meaning and return only the complete revised script.',
      hook: 'Create 5 short, compelling opening hooks for this YouTube video. Avoid clickbait that the script cannot support. Return only the numbered hooks.',
      concise: 'Tighten this YouTube script by removing repetition and filler while preserving its voice and important details. Return only the revised script.',
      outline: 'Turn this script into a clear filming outline with sections, key beats, and brief delivery cues. Return only the outline.',
    }
    const prompt = `${prompts[request.action] ?? prompts.improve}\n\nSCRIPT:\n${request.content}`
    try {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: request.model || 'qwen2.5:1.5b', prompt, stream: false, options: { temperature: 0.65, num_ctx: 4096 } }),
        signal: AbortSignal.timeout(180_000),
      })
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`)
      const data = await response.json() as { response?: string }
      return { ok: true, text: data.response?.trim() ?? '' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not connect to Ollama' }
    }
  })
}

async function ensurePiperServer(modelPath: string) {
  const modelId = path.basename(modelPath, '.onnx')
  for (let port = 5011; port <= 5015; port += 1) {
    const probe = await probePiper(port, modelId)
    if (probe.valid) {
      piperPort = port
      piperModel = modelPath
      return
    }
  }

  if (piperServer && piperModel !== modelPath) piperServer.kill('SIGTERM')
  piperModel = modelPath
  const localPython = path.join(app.getPath('userData'), 'voice-runtime', 'venv', 'bin', 'python3')
  let pythonCommand = 'python3'
  try { await fs.access(localPython); pythonCommand = localPython } catch { /* use system Python */ }
  let lastError = ''

  for (let port = 5011; port <= 5015; port += 1) {
    const occupied = await probePiper(port, modelId)
    if (occupied.responding) continue
    piperPort = port
    const server = spawn(pythonCommand, ['-m', 'piper.http_server', '-m', modelPath, '--host', '127.0.0.1', '--port', String(port)], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    piperServer = server
    server.stderr?.on('data', (chunk) => { lastError += String(chunk) })
    server.once('close', () => { if (piperServer === server) piperServer = null })

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      const health = await probePiper(port, modelId)
      if (health.valid) return
      if (server.exitCode !== null) break
    }
    server.kill('SIGTERM')
    if (piperServer === server) piperServer = null
  }

  throw new Error(lastError.includes('No module named')
    ? 'The local Piper runtime is incomplete. Restart ScriptFlow to repair it.'
    : `Piper could not start${lastError.trim() ? `: ${lastError.trim().split('\n').at(-1)}` : '. No local port is available.'}`)
}

async function probePiper(port: number, modelId: string) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/voices`, { signal: AbortSignal.timeout(700) })
    if (!response.ok) return { responding: true, valid: false }
    const voices = await response.json() as Record<string, unknown>
    return { responding: true, valid: modelId in voices }
  } catch {
    return { responding: false, valid: false }
  }
}

async function installDefaultVoice(progress: (message: string, percent: number) => void) {
  const runtimeDir = path.join(app.getPath('userData'), 'voice-runtime')
  const venvDir = path.join(runtimeDir, 'venv')
  const pythonPath = path.join(venvDir, 'bin', 'python3')
  const pipPath = path.join(venvDir, 'bin', 'pip')
  const voicesDir = path.join(runtimeDir, 'voices')
  const modelPath = path.join(voicesDir, 'en_US-lessac-medium.onnx')
  const configPath = `${modelPath}.json`

  try {
    await Promise.all([fs.access(pythonPath), fs.access(modelPath), fs.access(configPath)])
    progress('Offline voice ready', 100)
    return modelPath
  } catch { /* install missing runtime below */ }

  await fs.mkdir(runtimeDir, { recursive: true })
  await fs.mkdir(voicesDir, { recursive: true })
  try {
    await fs.access(pythonPath)
  } catch {
    progress('Preparing local voice engine…', 10)
    await runProcess('python3', ['-m', 'venv', venvDir])
  }

  progress('Downloading lightweight speech engine…', 30)
  await runProcess(pipPath, ['install', '--disable-pip-version-check', '--no-input', 'piper-tts[http]==1.4.2'])
  progress('Downloading natural English voice…', 70)
  await runProcess(pythonPath, ['-m', 'piper.download_voices', '--data-dir', voicesDir, 'en_US-lessac-medium'])
  await Promise.all([fs.access(modelPath), fs.access(configPath)])
  progress('Offline voice ready', 100)
  return modelPath
}

function runProcess(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    setupProcesses.add(child)
    let errors = ''
    let settled = false
    child.stderr?.on('data', (chunk) => { errors = `${errors}${String(chunk)}`.slice(-32_000) })
    child.once('error', (error) => {
      setupProcesses.delete(child)
      if (!settled) { settled = true; reject(error) }
    })
    child.once('close', (code) => {
      setupProcesses.delete(child)
      if (settled) return
      settled = true
      if (isQuitting) reject(new Error('Voice setup was cancelled because the application closed'))
      else if (code === 0) resolve()
      else reject(new Error(errors.trim() || `${path.basename(command)} exited with code ${code}`))
    })
  })
}

function createWindow() {
  nativeTheme.themeSource = 'light'
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#f6f5f2',
    title: 'ScriptFlow Studio',
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  initializeDatabase()
  registerIpc()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  speechId += 1
  audioProcess?.kill('SIGTERM')
  piperServer?.kill('SIGTERM')
  for (const process of setupProcesses) process.kill('SIGTERM')
  setupProcesses.clear()
  audioProcess = null
  piperServer = null
  if (db?.open) db.close()
})
