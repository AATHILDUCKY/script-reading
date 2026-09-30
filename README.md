# ScriptFlow Studio

ScriptFlow Studio is an offline-first desktop writing and teleprompter app for YouTube creators. It combines a distraction-free script editor, local SQLite storage, smooth presenting controls, and optional on-device AI through [Ollama](https://ollama.com/).

The application is designed for Ubuntu 24.04 and packages as an installable `.deb`. Scripts remain on the computer; there is no account, tracking, or cloud database.

## Features

- Write, autosave, search, tag, import, and export scripts
- Import plain-text (`.txt`) and Markdown (`.md`) files
- Store data locally in SQLite with WAL journaling
- Estimate word count and spoken duration
- Present in a non-scrolling, YouTube-style subtitle view
- Show one short phrase at a time with active-word colour highlighting
- Adjust speaking pace and text size while presenting
- Mirror text for use with physical teleprompter glass
- Use fullscreen and keyboard controls (`Space`, arrows, `Escape`)
- Improve scripts with a lightweight, open-source model running in Ollama
- Read subtitles aloud with a realistic, lightweight Piper voice running locally
- Generate hooks, tighten wording, polish delivery, or create a filming outline

## Technology

- Electron + React + TypeScript + Vite
- SQLite via `better-sqlite3`
- Electron context isolation and a restricted IPC preload bridge
- Ollama's local API; no AI request is sent to the internet
- `electron-builder` for Debian packaging

## Ubuntu 24.04 setup

Install the build requirements:

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++
```

Install Node.js 22 LTS (Node 20 LTS also works), then install project dependencies:

```bash
npm install
```

Run the development application:

```bash
npm run dev
```

## Local AI setup (optional)

The editor and teleprompter work without an AI model. For AI writing assistance, install Ollama from its official Linux instructions and download one lightweight model:

```bash
ollama pull qwen2.5:1.5b
```

Qwen 2.5 1.5B is the default and a good balance for script editing. Lower-resource laptops can use:

```bash
ollama pull llama3.2:1b
```

Keep Ollama running while using the assistant. The app communicates only with `http://127.0.0.1:11434`. Models are not bundled in the `.deb`, which keeps the installer small and lets creators choose a model appropriate for their RAM.

Approximate memory needs vary by model and quantization. The 1B–2B choices are intended for typical laptops with 8 GB RAM; close other heavy applications if inference is slow.

## Offline realistic voice

Sound mode uses [Piper](https://github.com/OHF-Voice/piper1-gpl), a fast local neural text-to-speech engine. No manual setup is required:

1. Installing the `.deb` with APT installs Python, virtual-environment, and ALSA playback requirements.
2. The first time you enable **Sound**, ScriptFlow creates a private voice runtime in its application-data folder.
3. It downloads Piper and the natural `en_US-lessac-medium` voice without blocking normal app startup.
4. Press Play. The currently visible subtitle is spoken, then the app advances to the next phrase after the audio finishes.

The first setup requires an internet connection and can take several minutes. Later launches and all speech work fully offline. The voice runtime is isolated from Ubuntu's system Python and is reused rather than downloaded again.

The **Change voice…** control remains available for advanced users who want to select another Piper `.onnx` model. Keep that model's `.onnx.json` file beside it.

## Build the `.deb`

```bash
npm run dist
```

The package is written to `release/`, for example:

```text
release/ScriptFlow Studio-1.3.2-amd64.deb
```

Install it with APT so system dependencies are resolved:

```bash
npm run install:deb
```

The install command copies the package to `/tmp` first so APT's `_apt` user
can read it even when the project is inside a private home directory.

Launch **ScriptFlow Studio** from Ubuntu's application menu.

## Keyboard controls

Editor:

- `Ctrl+S` — save now
- `Ctrl+Enter` — open the teleprompter

Teleprompter:

- `Space` — play or pause
- `Up` / `Down` — increase or decrease speaking pace
- `Left` / `Right` — move to the previous or next phrase
- `R` — restart from the first phrase
- `Escape` — return to the editor

## Data and privacy

The SQLite database is created in Electron's per-user application-data directory, normally:

```text
~/.config/scriptflow-studio/scriptflow.sqlite3
```

SQLite access, filesystem dialogs, and Ollama calls happen in Electron's main process. The React renderer has no Node.js access and receives only the specific methods exposed by the preload bridge.

To back up the library, close ScriptFlow Studio and copy the database file. Scripts can also be exported individually from the editor.

## Troubleshooting

### AI says Ollama is unavailable

Confirm Ollama is installed, running, and has the model selected in **AI settings**:

```bash
ollama list
ollama serve
```

If `ollama serve` says the port is already in use, Ollama is already running.

### Native module error during development

Rebuild the SQLite module for the installed Electron version:

```bash
npx electron-builder install-app-deps
```

### App does not launch after installing the package

Run it from a terminal to see the diagnostic message:

```bash
scriptflow-studio
```

On unusual minimal Ubuntu installations, install the standard Electron runtime libraries with:

```bash
sudo apt install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils
```

## Project structure

```text
electron/          Secure main process, SQLite, dialogs, Ollama and preload bridge
src/               React user interface and teleprompter
dist/              Production renderer output (generated)
dist-electron/     Compiled Electron code (generated)
release/           Debian packages (generated)
```

## License

MIT
