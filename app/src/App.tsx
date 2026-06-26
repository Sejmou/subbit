import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useProject } from './store/project'
import { importWhisperx } from './lib/import-whisperx'
import { exportCsv, type Delimiter } from './lib/export-csv'
import { exportSrt } from './lib/export-srt'
import {
  cacheMovieHandle,
  cacheProjectHandle,
  downloadText,
  ensurePermission,
  getCachedMovieHandle,
  getCachedProjectHandle,
  isFsAccessSupported,
  parseProject,
  pickFile,
  pickProjectSaveFile,
  readHandleAsFile,
  serializeProject,
  writeTextToHandle,
  type FsFileHandle,
} from './lib/project-io'
import { useShortcuts } from './hooks/useShortcuts'
import { LoadScreen } from './components/LoadScreen'
import { VideoPlayer } from './components/VideoPlayer'
import { CueList } from './components/CueList'
import { SpeakerPanel } from './components/SpeakerPanel'
import { Toolbar } from './components/Toolbar'
import { HelpOverlay } from './components/HelpOverlay'

const JSON_ACCEPT = { 'application/json': ['.json'] }
const VIDEO_ACCEPT = { 'video/mp4': ['.mp4', '.m4v', '.mov'] }

export default function App() {
  const project = useProject((s) => s.project)
  const dirty = useProject((s) => s.dirty)
  const lastSavedAt = useProject((s) => s.lastSavedAt)
  const loadProject = useProject((s) => s.loadProject)
  const markSaved = useProject((s) => s.markSaved)

  const [movieUrl, setMovieUrl] = useState<string | null>(null)
  const [movieName, setMovieName] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [canRestore, setCanRestore] = useState(false)
  const [delimiter, setDelimiter] = useState<Delimiter>('\t')
  const [helpOpen, setHelpOpen] = useState(false)

  const movieHandle = useRef<FsFileHandle | null>(null)
  const projectHandle = useRef<FsFileHandle | null>(null)
  const fsSupported = isFsAccessSupported()

  // Offer to reopen the previous session if handles were cached.
  useEffect(() => {
    if (!fsSupported) return
    void (async () => {
      const [m, p] = await Promise.all([getCachedMovieHandle(), getCachedProjectHandle()])
      if (m && p) setCanRestore(true)
    })()
  }, [fsSupported])

  const setMovieFromFile = useCallback((file: File) => {
    setMovieUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setMovieName(file.name)
  }, [])

  // --- file pickers (FS Access) ---
  const pickMovie = useCallback(async () => {
    const handle = await pickFile(VIDEO_ACCEPT, 'Movie')
    if (!handle) return
    movieHandle.current = handle
    await cacheMovieHandle(handle)
    setMovieFromFile(await readHandleAsFile(handle))
  }, [setMovieFromFile])

  /**
   * Load subtitles from a JSON string, auto-detecting whether it's a saved
   * Subbit project (has `cues`) or raw whisperx output (has `segments`). When a
   * writable handle is provided for a project file, save-in-place is enabled.
   */
  const loadSubtitlesText = useCallback(
    (text: string, projectFileHandle?: FsFileHandle) => {
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('That file is not valid JSON.')
      }
      const obj = data as Record<string, unknown>
      if (Array.isArray(obj?.cues) && Array.isArray(obj?.speakers)) {
        loadProject(parseProject(text))
        projectHandle.current = projectFileHandle ?? null
        if (projectFileHandle) void cacheProjectHandle(projectFileHandle)
      } else if (Array.isArray(obj?.segments)) {
        loadProject(importWhisperx(data as Parameters<typeof importWhisperx>[0], movieName ?? 'movie'))
        projectHandle.current = null
      } else {
        throw new Error(
          'Unrecognized JSON. Expected a whisperx file (with a "segments" array) or a Subbit project (with "cues").',
        )
      }
    },
    [loadProject, movieName],
  )

  const loadSubtitlesFromHandle = useCallback(
    async (handle: FsFileHandle) => {
      try {
        loadSubtitlesText(await (await readHandleAsFile(handle)).text(), handle)
      } catch (err) {
        alert((err as Error).message)
      }
    },
    [loadSubtitlesText],
  )

  const pickSubtitles = useCallback(async () => {
    const handle = await pickFile(JSON_ACCEPT, 'whisperx JSON or Subbit project')
    if (handle) await loadSubtitlesFromHandle(handle)
  }, [loadSubtitlesFromHandle])

  // --- fallback file inputs ---
  const onMovieFile = useCallback((file: File) => setMovieFromFile(file), [setMovieFromFile])
  const onSubtitlesFile = useCallback(
    async (file: File) => {
      try {
        loadSubtitlesText(await file.text())
      } catch (err) {
        alert((err as Error).message)
      }
    },
    [loadSubtitlesText],
  )

  const restore = useCallback(async () => {
    setBusy('Reopening...')
    try {
      const [m, p] = await Promise.all([getCachedMovieHandle(), getCachedProjectHandle()])
      if (m && (await ensurePermission(m, 'read'))) {
        movieHandle.current = m
        setMovieFromFile(await readHandleAsFile(m))
      }
      if (p && (await ensurePermission(p, 'readwrite'))) {
        projectHandle.current = p
        loadProject(parseProject(await (await readHandleAsFile(p)).text()))
      }
      setStarted(true)
    } finally {
      setBusy(null)
    }
  }, [loadProject, setMovieFromFile])

  // --- save / export ---
  const save = useCallback(async () => {
    const current = useProject.getState().project
    if (!current) return
    const text = serializeProject(current)
    try {
      if (projectHandle.current) {
        await writeTextToHandle(projectHandle.current, text)
      } else if (fsSupported) {
        const handle = await pickProjectSaveFile(`${current.videoName}.subbit.json`)
        if (!handle) return
        projectHandle.current = handle
        await cacheProjectHandle(handle)
        await writeTextToHandle(handle, text)
      } else {
        downloadText(`${current.videoName}.subbit.json`, text, 'application/json')
      }
      markSaved()
    } catch (err) {
      console.error('Save failed', err)
      alert('Save failed: ' + (err as Error).message)
    }
  }, [fsSupported, markSaved])

  const doExportCsv = useCallback(() => {
    const current = useProject.getState().project
    if (!current) return
    const ext = delimiter === '\t' ? 'tsv' : 'csv'
    downloadText(`${current.videoName}.${ext}`, exportCsv(current, delimiter), 'text/csv')
  }, [delimiter])

  const doExportSrt = useCallback(() => {
    const current = useProject.getState().project
    if (!current) return
    downloadText(`${current.videoName}.srt`, exportSrt(current), 'text/plain')
  }, [])

  // Cmd/Ctrl+S from the shortcut hook.
  useEffect(() => {
    const onSave = () => void save()
    window.addEventListener('subbit:save', onSave)
    return () => window.removeEventListener('subbit:save', onSave)
  }, [save])

  // `?` toggles the shortcuts overlay.
  useEffect(() => {
    const onToggle = () => setHelpOpen((v) => !v)
    window.addEventListener('subbit:help-toggle', onToggle)
    return () => window.removeEventListener('subbit:help-toggle', onToggle)
  }, [])

  // Autosave (only when a project file handle exists, to avoid surprise downloads).
  useEffect(() => {
    if (!dirty || !projectHandle.current) return
    const id = setTimeout(() => void save(), 3000)
    return () => clearTimeout(id)
  }, [dirty, save])

  useShortcuts()

  if (!started || !project) {
    return (
      <LoadScreen
        fsSupported={fsSupported}
        movieName={movieName}
        hasSubtitles={!!project}
        canRestore={canRestore}
        busy={busy}
        onPickMovie={pickMovie}
        onPickSubtitles={pickSubtitles}
        onMovieFile={onMovieFile}
        onSubtitlesFile={onSubtitlesFile}
        onRestore={restore}
        onStart={() => setStarted(true)}
      />
    )
  }

  return (
    <div className="app">
      <Toolbar
        project={project}
        dirty={dirty}
        lastSavedAt={lastSavedAt}
        delimiter={delimiter}
        setDelimiter={setDelimiter}
        onSave={() => void save()}
        onExportCsv={doExportCsv}
        onExportSrt={doExportSrt}
        onHelp={() => setHelpOpen(true)}
      />
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <div className="main">
        <div className="left">
          {movieUrl ? <VideoPlayer src={movieUrl} /> : <div className="video-wrap empty">No movie loaded</div>}
          <SpeakerPanel project={project} />
        </div>
        <CueList project={project} />
      </div>
    </div>
  )
}
