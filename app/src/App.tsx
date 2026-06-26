import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useProject } from './store/project'
import { exportCsv, type Delimiter } from './lib/export-csv'
import { exportSrt } from './lib/export-srt'
import {
  parseSubtitleJsonText,
  projectFromSubtitleData,
  projectFromWhisperxData,
} from './lib/load-subtitles'
import {
  cacheMovieHandle,
  cacheProjectHandle,
  downloadText,
  ensurePermission,
  getCachedMovieHandle,
  getCachedProjectHandle,
  hasPermission,
  isFsAccessSupported,
  parseProject,
  pickFile,
  pickProjectSaveFile,
  readHandleAsFile,
  serializeProject,
  writeTextToHandle,
  type FsFileHandle,
} from './lib/project-io'
import { addVersion } from './lib/history'
import { useShortcuts } from './hooks/useShortcuts'
import { LoadScreen } from './components/LoadScreen'
import { VideoPlayer } from './components/VideoPlayer'
import { CueList } from './components/CueList'
import { SpeakerPanel } from './components/SpeakerPanel'
import { Toolbar } from './components/Toolbar'
import { HelpOverlay } from './components/HelpOverlay'
import { HistoryPanel } from './components/HistoryPanel'
import { UnsavedDialog } from './components/UnsavedDialog'

const JSON_ACCEPT = { 'application/json': ['.json'] }
const VIDEO_ACCEPT = { 'video/mp4': ['.mp4', '.m4v', '.mov'] }

export default function App() {
  const project = useProject((s) => s.project)
  const dirty = useProject((s) => s.dirty)
  const lastSavedAt = useProject((s) => s.lastSavedAt)
  const loadProject = useProject((s) => s.loadProject)
  const clearProject = useProject((s) => s.clearProject)
  const markSaved = useProject((s) => s.markSaved)
  const restoreProject = useProject((s) => s.restoreProject)

  const [movieUrl, setMovieUrl] = useState<string | null>(null)
  const [movieName, setMovieName] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [canRestore, setCanRestore] = useState(false)
  const [delimiter, setDelimiter] = useState<Delimiter>('\t')
  const [helpOpen, setHelpOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [autosaveEnabled, setAutosaveEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unsavedOpen, setUnsavedOpen] = useState(false)

  const movieHandle = useRef<FsFileHandle | null>(null)
  const projectHandle = useRef<FsFileHandle | null>(null)
  const unsavedResolver = useRef<((proceed: boolean) => void) | null>(null)
  const fsSupported = isFsAccessSupported()

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
      const data = parseSubtitleJsonText(text)
      const parsed = projectFromSubtitleData(data, movieName ?? 'movie')
      const isSubbitProject =
        typeof data === 'object' &&
        data !== null &&
        Array.isArray((data as Record<string, unknown>).cues) &&
        Array.isArray((data as Record<string, unknown>).speakers)

      loadProject(parsed)
      if (isSubbitProject) {
        projectHandle.current = projectFileHandle ?? null
        setAutosaveEnabled(!!projectFileHandle)
        if (projectFileHandle) void cacheProjectHandle(projectFileHandle)
      } else {
        projectHandle.current = null
        setAutosaveEnabled(false)
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

  /**
   * Reopen the last session from cached file handles.
   * `silent` only proceeds if permission is already granted (used on page load,
   * where we can't show a permission prompt without a user gesture). A button
   * click passes silent=false and may prompt to re-grant access.
   */
  const doRestore = useCallback(
    async (silent: boolean): Promise<boolean> => {
      const [m, p] = await Promise.all([getCachedMovieHandle(), getCachedProjectHandle()])
      if (!m || !p) return false

      const check = silent ? hasPermission : ensurePermission
      const [mOk, pOk] = await Promise.all([check(m, 'read'), check(p, 'readwrite')])
      if (!mOk || !pOk) return false

      setBusy('Reopening...')
      try {
        movieHandle.current = m
        setMovieFromFile(await readHandleAsFile(m))
        projectHandle.current = p
        setAutosaveEnabled(true)
        loadProject(parseProject(await (await readHandleAsFile(p)).text()))
        setStarted(true)
        return true
      } finally {
        setBusy(null)
      }
    },
    [loadProject, setMovieFromFile],
  )

  // On load: auto-reopen if permission persisted, else offer a one-click button.
  useEffect(() => {
    if (!fsSupported) return
    void (async () => {
      if (await doRestore(true)) return
      const [m, p] = await Promise.all([getCachedMovieHandle(), getCachedProjectHandle()])
      if (m && p) setCanRestore(true)
    })()
  }, [fsSupported, doRestore])

  // --- save / export ---
  const save = useCallback(
    async (opts: { auto?: boolean } = {}): Promise<boolean> => {
      const current = useProject.getState().project
      if (!current) return false
      const text = serializeProject(current)
      setSaving(true)
      try {
        if (projectHandle.current) {
          await writeTextToHandle(projectHandle.current, text)
        } else if (fsSupported) {
          const handle = await pickProjectSaveFile(`${current.videoName}.subbit.json`)
          if (!handle) return false
          projectHandle.current = handle
          setAutosaveEnabled(true)
          await cacheProjectHandle(handle)
          await writeTextToHandle(handle, text)
        } else {
          downloadText(`${current.videoName}.subbit.json`, text, 'application/json')
        }
        markSaved()
        // Capture a persisted version snapshot (deduped on identical content).
        void addVersion(current, text, { auto: opts.auto }).catch((err) =>
          console.error('History snapshot failed', err),
        )
        return true
      } catch (err) {
        console.error('Save failed', err)
        alert('Save failed: ' + (err as Error).message)
        return false
      } finally {
        setSaving(false)
      }
    },
    [fsSupported, markSaved],
  )

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

  /** Returns true when it's safe to leave or replace the current project. */
  const guardUnsaved = useCallback((): Promise<boolean> => {
    if (!useProject.getState().dirty) return Promise.resolve(true)
    return new Promise((resolve) => {
      unsavedResolver.current = resolve
      setUnsavedOpen(true)
    })
  }, [])

  const resolveUnsaved = useCallback(
    async (choice: 'save' | 'discard' | 'cancel') => {
      setUnsavedOpen(false)
      const resolve = unsavedResolver.current
      unsavedResolver.current = null
      if (!resolve) return
      if (choice === 'cancel') {
        resolve(false)
        return
      }
      if (choice === 'discard') {
        resolve(true)
        return
      }
      resolve(await save())
    },
    [save],
  )

  const closeProject = useCallback(() => {
    projectHandle.current = null
    setAutosaveEnabled(false)
    setStarted(false)
    clearProject()
  }, [clearProject])

  const doCloseProject = useCallback(async () => {
    if (!(await guardUnsaved())) return
    closeProject()
  }, [guardUnsaved, closeProject])

  const doOpenProject = useCallback(async () => {
    if (!(await guardUnsaved())) return
    const handle = await pickFile(JSON_ACCEPT, 'Subbit project')
    if (!handle) return
    try {
      loadSubtitlesText(await (await readHandleAsFile(handle)).text(), handle)
    } catch (err) {
      alert((err as Error).message)
    }
  }, [guardUnsaved, loadSubtitlesText])

  const doNewFromWhisperx = useCallback(async () => {
    if (!(await guardUnsaved())) return
    const handle = await pickFile(JSON_ACCEPT, 'whisperx JSON')
    if (!handle) return
    try {
      const text = await (await readHandleAsFile(handle)).text()
      const data = parseSubtitleJsonText(text)
      loadProject(projectFromWhisperxData(data, movieName ?? 'movie'))
      projectHandle.current = null
      setAutosaveEnabled(false)
    } catch (err) {
      alert((err as Error).message)
    }
  }, [guardUnsaved, loadProject, movieName])

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
    const id = setTimeout(() => void save({ auto: true }), 3000)
    return () => clearTimeout(id)
  }, [dirty, save])

  // Tab close / refresh — browsers only allow their native leave prompt here, not UnsavedDialog.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

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
        onRestore={() => void doRestore(false)}
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
        autosaveEnabled={autosaveEnabled}
        saving={saving}
        delimiter={delimiter}
        setDelimiter={setDelimiter}
        onSave={() => void save()}
        onExportCsv={doExportCsv}
        onExportSrt={doExportSrt}
        onHelp={() => setHelpOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        onOpenProject={() => void doOpenProject()}
        onNewFromWhisperx={() => void doNewFromWhisperx()}
        onCloseProject={() => void doCloseProject()}
      />
      <UnsavedDialog
        open={unsavedOpen}
        onSave={() => void resolveUnsaved('save')}
        onDiscard={() => void resolveUnsaved('discard')}
        onCancel={() => void resolveUnsaved('cancel')}
      />
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        project={project}
        onRestore={restoreProject}
      />
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
