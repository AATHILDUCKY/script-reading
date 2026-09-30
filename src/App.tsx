import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignLeft, Bot, Check, ChevronLeft, CircleStop, Download, FilePlus2,
  Gauge, Import, Library, Maximize2, Menu, Mic2, Pause, Play, Plus,
  RotateCcw, Save, Search, Settings2, Sparkles, Trash2, Volume2, VolumeX, WandSparkles, X,
} from 'lucide-react'
import type { Script } from './types'

const EMPTY_SCRIPT: Script = { title: 'Untitled script', content: '', tags: '' }
const AI_ACTIONS = [
  { id: 'improve', label: 'Polish script', description: 'Natural, clear and engaging', icon: WandSparkles },
  { id: 'hook', label: 'Generate hooks', description: 'Five stronger openings', icon: Sparkles },
  { id: 'concise', label: 'Make concise', description: 'Remove filler and repetition', icon: AlignLeft },
  { id: 'outline', label: 'Create outline', description: 'Key beats and delivery cues', icon: Menu },
]

function readingStats(content: string) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  return { words, minutes: Math.max(1, Math.ceil(words / 145)) }
}

function splitIntoCues(content: string, maxWords = 10) {
  const sentences = content
    .replace(/\s+/g, ' ')
    .trim()
    .match(/[^.!?…]+(?:[.!?…]+[”'’"]?|$)/g) ?? []

  return sentences.flatMap((sentence) => {
    const words = sentence.trim().split(/\s+/).filter(Boolean)
    const cues: string[][] = []
    for (let index = 0; index < words.length; index += maxWords) {
      const remaining = words.length - index
      const size = remaining > maxWords && remaining < maxWords + 4
        ? Math.ceil(remaining / 2)
        : Math.min(maxWords, remaining)
      cues.push(words.slice(index, index + size))
      index += size - maxWords
    }
    return cues
  }).filter((cue) => cue.length)
}

function App() {
  const [scripts, setScripts] = useState<Script[]>([])
  const [active, setActive] = useState<Script>({ ...EMPTY_SCRIPT })
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiOutput, setAiOutput] = useState('')
  const [aiError, setAiError] = useState('')
  const [model, setModel] = useState('qwen2.5:1.5b')
  const [teleprompter, setTeleprompter] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  const loadScripts = useCallback(async (selectId?: number) => {
    const data = await window.scriptFlow.listScripts()
    setScripts(data)
    if (selectId) {
      const selected = data.find((item) => item.id === selectId)
      if (selected) setActive(selected)
    } else if (!active.id && data[0]) setActive(data[0])
  }, [active.id])

  useEffect(() => {
    void loadScripts()
    void window.scriptFlow.getSetting('model').then((value) => value && setModel(value))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (draft = active) => {
    if (!draft.content.trim() && !draft.id) return
    setSaving(true)
    const id = await window.scriptFlow.saveScript(draft)
    setActive((current) => ({ ...current, id }))
    await loadScripts(id)
    setSaved(true)
    setSaving(false)
  }, [active, loadScripts])

  useEffect(() => {
    if (saved || (!active.id && !active.content.trim())) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), 900)
    return () => clearTimeout(saveTimer.current)
  }, [active.title, active.content, active.tags, saved, save])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); void save()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && active.content.trim()) setTeleprompter(true)
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [active.content, save])

  const update = (changes: Partial<Script>) => {
    setActive((current) => ({ ...current, ...changes }))
    setSaved(false)
  }

  const createScript = () => {
    setActive({ ...EMPTY_SCRIPT })
    setSaved(true)
    setAiOutput('')
  }

  const importScript = async () => {
    const imported = await window.scriptFlow.importScript()
    if (!imported) return
    const draft = { ...EMPTY_SCRIPT, ...imported }
    const id = await window.scriptFlow.saveScript(draft)
    await loadScripts(id)
  }

  const removeScript = async () => {
    if (!active.id || !window.confirm(`Delete “${active.title}”? This cannot be undone.`)) return
    await window.scriptFlow.deleteScript(active.id)
    const remaining = await window.scriptFlow.listScripts()
    setScripts(remaining)
    setActive(remaining[0] ?? { ...EMPTY_SCRIPT })
    setSaved(true)
  }

  const runAi = async (action: string) => {
    if (!active.content.trim()) return
    setAiBusy(true); setAiError(''); setAiOutput('')
    const result = await window.scriptFlow.generate({ content: active.content, action, model })
    if (result.ok) setAiOutput(result.text)
    else setAiError('Local AI is not available. Start Ollama and download the selected model, then try again.')
    setAiBusy(false)
  }

  const stats = readingStats(active.content)
  const filteredScripts = useMemo(() => scripts.filter((script) =>
    `${script.title} ${script.tags}`.toLowerCase().includes(query.toLowerCase())), [scripts, query])

  if (teleprompter) return <Teleprompter script={active} onExit={() => setTeleprompter(false)} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Mic2 size={19} /></span><span>ScriptFlow</span></div>
        <button className="new-button" onClick={createScript}><Plus size={17} /> New script</button>
        <div className="nav-label">Workspace</div>
        <button className="nav-item active"><Library size={17} /> All scripts <span>{scripts.length}</span></button>
        <button className="nav-item" onClick={importScript}><Import size={17} /> Import file</button>
        <div className="sidebar-spacer" />
        <div className="privacy-card"><Bot size={18} /><div><strong>Private by design</strong><small>Your scripts and AI stay on this computer.</small></div></div>
        <button className="nav-item muted" onClick={() => setAiOpen(true)}><Settings2 size={17} /> AI settings</button>
      </aside>

      <section className="library-panel">
        <header><div><p>Your workspace</p><h2>Scripts</h2></div><button className="icon-button" onClick={importScript} title="Import"><FilePlus2 size={18} /></button></header>
        <label className="search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scripts" /></label>
        <div className="script-list">
          {filteredScripts.map((script) => (
            <button key={script.id} className={`script-card ${active.id === script.id ? 'selected' : ''}`} onClick={() => { setActive(script); setSaved(true); setAiOutput('') }}>
              <strong>{script.title}</strong>
              <p>{script.content.slice(0, 100) || 'Empty script'}</p>
              <span>{readingStats(script.content).words} words · {new Date(`${script.updatedAt}Z`).toLocaleDateString()}</span>
            </button>
          ))}
          {!filteredScripts.length && <div className="empty-list"><FilePlus2 size={26} /><p>No scripts here yet.</p><button onClick={createScript}>Create your first</button></div>}
        </div>
      </section>

      <main className="editor-panel">
        <header className="topbar">
          <div className="save-state">{saving ? <><span className="spinner small" /> Saving</> : saved ? <><Check size={15} /> Saved locally</> : 'Unsaved'}</div>
          <div className="top-actions">
            <button className="button ghost" onClick={() => void window.scriptFlow.exportScript(active.title, active.content)}><Download size={16} /> Export</button>
            <button className="button ai-button" onClick={() => setAiOpen(true)}><Sparkles size={16} /> Improve with AI</button>
            <button className="button primary" disabled={!active.content.trim()} onClick={() => setTeleprompter(true)}><Play size={16} fill="currentColor" /> Present</button>
          </div>
        </header>
        <div className="editor-wrap">
          <input className="title-input" value={active.title} onChange={(e) => update({ title: e.target.value })} aria-label="Script title" />
          <div className="meta-row">
            <span>{stats.words} words</span><i /> <span>~{stats.minutes} min read</span>
            <input value={active.tags} onChange={(e) => update({ tags: e.target.value })} placeholder="Add tags…" aria-label="Tags" />
          </div>
          <textarea className="script-editor" value={active.content} onChange={(e) => update({ content: e.target.value })} placeholder={'Start writing, or import a .txt or .md script…\n\nWrite the way you speak. Short paragraphs make the teleprompter easier to follow.'} spellCheck />
          <footer className="editor-footer"><span><kbd>Ctrl</kbd> <kbd>S</kbd> save</span><span><kbd>Ctrl</kbd> <kbd>Enter</kbd> present</span>{active.id && <button onClick={removeScript}><Trash2 size={15} /> Delete</button>}</footer>
        </div>
      </main>

      {aiOpen && <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAiOpen(false)}>
        <aside className="ai-drawer">
          <header><div><span className="ai-orb"><Sparkles size={18} /></span><div><h2>Script assistant</h2><p>Powered locally by Ollama</p></div></div><button className="icon-button" onClick={() => setAiOpen(false)}><X size={19} /></button></header>
          <div className="drawer-content">
            <label className="field-label">Lightweight model</label>
            <select value={model} onChange={(e) => { setModel(e.target.value); void window.scriptFlow.setSetting('model', e.target.value) }}>
              <option value="qwen2.5:1.5b">Qwen 2.5 · 1.5B (recommended)</option>
              <option value="llama3.2:1b">Llama 3.2 · 1B (fastest)</option>
              <option value="gemma2:2b">Gemma 2 · 2B</option>
              <option value="phi3:mini">Phi-3 Mini · 3.8B</option>
            </select>
            <div className="ai-grid">{AI_ACTIONS.map(({ id, label, description, icon: Icon }) => <button key={id} disabled={aiBusy || !active.content.trim()} onClick={() => void runAi(id)}><Icon size={18} /><strong>{label}</strong><small>{description}</small></button>)}</div>
            {aiBusy && <div className="ai-loading"><span className="spinner" /><strong>Thinking on your laptop…</strong><p>The first run can take a little longer.</p></div>}
            {aiError && <div className="ai-error"><strong>Ollama connection needed</strong><p>{aiError}</p><code>ollama pull {model}</code></div>}
            {aiOutput && <div className="ai-result"><div><strong>Suggestion</strong><span>{aiOutput.trim().split(/\s+/).length} words</span></div><textarea readOnly value={aiOutput} /><div className="result-actions"><button className="button ghost" onClick={() => setAiOutput('')}>Discard</button><button className="button primary" onClick={() => { update({ content: aiOutput }); setAiOutput(''); setAiOpen(false) }}>Use this version</button></div></div>}
            {!aiBusy && !aiOutput && !aiError && <div className="ai-tip"><Bot size={20} /><p><strong>Your words stay yours.</strong><br />AI requests go only to Ollama at <code>127.0.0.1</code>. No cloud account is used.</p></div>}
          </div>
        </aside>
      </div>}
    </div>
  )
}

function Teleprompter({ script, onExit }: { script: Script; onExit: () => void }) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(145)
  const [fontSize, setFontSize] = useState(54)
  const [mirrored, setMirrored] = useState(false)
  const [cueIndex, setCueIndex] = useState(0)
  const [wordIndex, setWordIndex] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [voiceModel, setVoiceModel] = useState('')
  const [voiceReady, setVoiceReady] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [voiceSetup, setVoiceSetup] = useState({ message: '', percent: 0 })
  const cues = useMemo(() => splitIntoCues(script.content), [script.content])
  const cue = cues[cueIndex] ?? []
  const completedWords = cues.slice(0, cueIndex).reduce((total, words) => total + words.length, 0) + wordIndex
  const totalWords = cues.reduce((total, words) => total + words.length, 0)
  const progress = totalWords ? Math.min(100, (completedWords / totalWords) * 100) : 0

  const previousCue = useCallback(() => {
    void window.scriptFlow.stopSpeech()
    setPlaying(false)
    setCueIndex((current) => Math.max(0, current - 1))
    setWordIndex(0)
  }, [])

  const nextCue = useCallback(() => {
    void window.scriptFlow.stopSpeech()
    setPlaying(false)
    setCueIndex((current) => Math.min(cues.length - 1, current + 1))
    setWordIndex(0)
  }, [cues.length])

  const restart = useCallback(() => {
    void window.scriptFlow.stopSpeech()
    setPlaying(false)
    setCueIndex(0)
    setWordIndex(0)
  }, [])

  useEffect(() => {
    void window.scriptFlow.getSetting('voiceModel').then((value) => value && setVoiceModel(value))
    const unsubscribe = window.scriptFlow.onVoiceSetupProgress(setVoiceSetup)
    return () => {
      void window.scriptFlow.stopSpeech()
      unsubscribe()
    }
  }, [])

  const chooseVoice = useCallback(async () => {
    const selected = await window.scriptFlow.selectVoiceModel()
    if (!selected) return false
    setVoiceModel(selected)
    setVoiceError('')
    await window.scriptFlow.setSetting('voiceModel', selected)
    return true
  }, [])

  const toggleSound = useCallback(async () => {
    if (soundEnabled) {
      await window.scriptFlow.stopSpeech()
      setSoundEnabled(false)
      setVoiceReady(false)
      return
    }
    setVoiceError('')
    setVoiceSetup({ message: 'Checking offline voice…', percent: 5 })
    try {
      const available = voiceModel || await window.scriptFlow.ensureVoiceReady()
      setVoiceModel(available)
      await window.scriptFlow.setSetting('voiceModel', available)
      setSoundEnabled(true)
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Automatic voice setup failed. Check your internet connection and try Sound again.')
    }
  }, [soundEnabled, voiceModel])

  const togglePlaying = useCallback(() => {
    if (cueIndex >= cues.length - 1 && wordIndex >= cue.length - 1) {
      setCueIndex(0)
      setWordIndex(0)
    }
    if (playing) {
      void window.scriptFlow.stopSpeech()
      setVoiceReady(false)
    }
    setPlaying((value) => !value)
  }, [cue.length, cueIndex, cues.length, playing, wordIndex])

  useEffect(() => {
    if (!playing || !cue.length || (soundEnabled && !voiceReady)) return
    const activeWord = cue[wordIndex] ?? ''
    const punctuationPause = /[.!?…][”'’"]?$/.test(activeWord) ? 420 : /[,;:]$/.test(activeWord) ? 180 : 0
    const timer = window.setTimeout(() => {
      if (wordIndex < cue.length - 1) {
        setWordIndex((current) => current + 1)
      } else if (!soundEnabled && cueIndex < cues.length - 1) {
        setCueIndex((current) => current + 1)
        setWordIndex(0)
      } else if (!soundEnabled) {
        setPlaying(false)
      }
    }, (60_000 / speed) + punctuationPause)
    return () => window.clearTimeout(timer)
  }, [cue, cueIndex, cues.length, playing, soundEnabled, speed, voiceReady, wordIndex])

  useEffect(() => {
    if (!playing || !soundEnabled || !voiceModel || !cue.length) return
    let cancelled = false
    setVoiceReady(false)
    void window.scriptFlow.speak({ text: cue.join(' '), modelPath: voiceModel, pace: speed }).then((result) => {
      if (cancelled) return
      if (result.ok) setVoiceReady(true)
      else {
        setPlaying(false)
        setSoundEnabled(false)
        setVoiceError(result.error ?? 'Could not start the local voice')
      }
    })
    return () => { cancelled = true }
  }, [cue, playing, soundEnabled, speed, voiceModel])

  useEffect(() => window.scriptFlow.onSpeechEnded((result) => {
    if (!soundEnabled || !playing) return
    setVoiceReady(false)
    if (!result.ok) {
      setPlaying(false)
      setVoiceError('Audio playback stopped unexpectedly. Check that ALSA is available.')
    } else if (cueIndex < cues.length - 1) {
      setCueIndex((current) => current + 1)
      setWordIndex(0)
    } else {
      setPlaying(false)
    }
  }), [cueIndex, cues.length, playing, soundEnabled])

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.code === 'Space') { event.preventDefault(); togglePlaying() }
      if (event.key === 'Escape') onExit()
      if (event.key === 'ArrowUp') setSpeed((value) => Math.min(240, value + 5))
      if (event.key === 'ArrowDown') setSpeed((value) => Math.max(70, value - 5))
      if (event.key === 'ArrowLeft') previousCue()
      if (event.key === 'ArrowRight') nextCue()
      if (event.key.toLowerCase() === 'r') restart()
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [nextCue, onExit, previousCue, restart, togglePlaying])

  return <div className="prompter">
    <div className="progress" style={{ width: `${progress}%` }} />
    <header><button onClick={onExit}><ChevronLeft size={19} /> Back to editor</button><span>{script.title} · {cueIndex + 1} / {cues.length}</span><button onClick={() => document.documentElement.requestFullscreen()}><Maximize2 size={18} /> Fullscreen</button></header>
    <div className="subtitle-stage" style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}>
      {cue.length ? <div className="subtitle-cue" style={{ fontSize }} aria-live="polite">
        {cue.map((word, index) => <span
          key={`${cueIndex}-${index}`}
          className={index === wordIndex ? `current color-${completedWords % 4}` : index < wordIndex ? 'spoken' : ''}
        >{word}</span>)}
      </div> : <div className="end-marker"><CircleStop size={28} /><span>No script text</span></div>}
      <div className={`cue-status ${voiceError ? 'error' : ''}`}>{voiceError || (voiceSetup.percent > 0 && voiceSetup.percent < 100 ? `${voiceSetup.message} ${voiceSetup.percent}%` : playing ? soundEnabled && !voiceReady ? 'Preparing local voice…' : soundEnabled ? 'Speaking locally' : 'Following your pace' : cueIndex === cues.length - 1 && wordIndex === cue.length - 1 ? 'End of script' : 'Paused')}</div>
    </div>
    <div className="prompter-controls">
      <button className="cue-nav" disabled={cueIndex === 0} onClick={previousCue}>Previous</button>
      <button className="play-control" onClick={togglePlaying}>{playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</button>
      <button className="cue-nav" disabled={cueIndex >= cues.length - 1} onClick={nextCue}>Next</button>
      <button className="restart-control" onClick={restart} title="Restart from the beginning"><RotateCcw size={15} /> Restart</button>
      <button className={`sound-control ${soundEnabled ? 'active' : ''}`} onClick={() => void toggleSound()} title="Use offline Piper voice">{soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />} Sound</button>
      <button className="voice-picker" onClick={() => void chooseVoice()} title={voiceModel || 'Choose a different Piper voice model'}>Change voice…</button>
      <label><Gauge size={17} /><span>Pace</span><input type="range" min="70" max="240" step="5" value={speed} onChange={(e) => setSpeed(+e.target.value)} /><b>{speed} wpm</b></label>
      <label><span>Text</span><button onClick={() => setFontSize((v) => Math.max(30, v - 4))}>A−</button><b>{fontSize}</b><button onClick={() => setFontSize((v) => Math.min(90, v + 4))}>A+</button></label>
      <button className={mirrored ? 'active' : ''} onClick={() => setMirrored((v) => !v)}>Mirror</button>
      <small><kbd>Space</kbd> pause · <kbd>R</kbd> restart · <kbd>←</kbd> <kbd>→</kbd> phrase</small>
    </div>
  </div>
}

export default App
