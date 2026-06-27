import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useProject } from './store/project'
import { buildExport, type ExportRequest } from './lib/export-format'
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
import { createEmptyProject } from './lib/create-empty-project'
import { useShortcuts } from './hooks/useShortcuts'
import { LoadScreen } from './components/LoadScreen'
import { VideoPlayer } from './components/VideoPlayer'
import { CueList } from './components/CueList'
import { SpeakerPanel } from './components/SpeakerPanel'
import { Toolbar } from './components/Toolbar'
import { ExportDialog } from './components/ExportDialog'
import { HelpOverlay } from './components/HelpOverlay'
import { HistoryPanel } from './components/HistoryPanel'
import { UnsavedDialog } from './components/UnsavedDialog'
import { VideoMismatchBanner } from './components/VideoMismatchBanner'
import { WaveformTimeline } from './components/WaveformTimeline'
import { useVideoIdentity } from './hooks/useVideoIdentity'
import { useWaveform, waveformCacheKey } from './store/waveform'
import { cacheWaveformPeaks } from './lib/waveform-cache'
import { buildVideoIdentity } from './lib/video-identity'
import {
  formatWaveformDurationMismatch,
  parseWaveformPeaksFile,
} from './lib/waveform-peaks'
import { usePlayback } from './store/playback'
import type { ReviewStatusFilter } from './lib/cue-filters'
import { readPreviewEnabled, writePreviewEnabled } from './lib/preview-settings'

const JSON_ACCEPT = { 'application/json': ['.json'] }
const VIDEO_ACCEPT = { 'video/mp4': ['.mp4', '.m4v', '.mov'] }
const WAVEFORM_ACCEPT = {
  'application/octet-stream': ['.dat'],
  'application/json': ['.json', '.waveform.json'],
}

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
  const [movieFile, setMovieFile] = useState<File | null>(null)
  const [videoMismatchDismissed, setVideoMismatchDismissed] = useState(false)
  const [started, setStarted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [canRestore, setCanRestore] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [autosaveEnabled, setAutosaveEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unsavedOpen, setUnsavedOpen] = useState(false)
  const [previewEnabled, setPreviewEnabled] = useState(readPreviewEnabled)
  const [speakerFilter, setSpeakerFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter[]>([])

  const movieHandle = useRef<FsFileHandle | null>(null)
  const projectHandle = useRef<FsFileHandle | null>(null)
  const unsavedResolver = useRef<((proceed: boolean) => void) | null>(null)
  const fsSupported = isFsAccessSupported()

  const setMovieFromFile = useCallback((file: File) => {
    setMovieFile(file)
    setVideoMismatchDismissed(false)
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
      setVideoMismatchDismissed(false)
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
        setVideoMismatchDismissed(false)
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

  const doExport = useCallback((request: ExportRequest) => {
    const current = useProject.getState().project
    if (!current) return
    const { content, ext, mime } = buildExport(current, request)
    downloadText(`${current.videoName}.${ext}`, content, mime)
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
    useWaveform.getState().clearPeaks()
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

  const doImportWhisperx = useCallback(async () => {
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

  const doImportWaveform = useCallback(async () => {
    const current = useProject.getState().project
    if (!current) return
    const videoDuration = usePlayback.getState().duration
    if (!movieFile || !Number.isFinite(videoDuration) || videoDuration <= 0) {
      alert('Load a movie first so waveform peaks can be matched to the video.')
      return
    }

    const handle = await pickFile(WAVEFORM_ACCEPT, 'waveform peaks')
    if (!handle) return

    try {
      const file = await readHandleAsFile(handle)
      const parsed = await parseWaveformPeaksFile(file)
      const mismatch = formatWaveformDurationMismatch(parsed.meta.duration, videoDuration)
      if (mismatch && !window.confirm(`${mismatch}\n\nImport anyway?`)) return

      const identity = current.video ?? (await buildVideoIdentity(movieFile, videoDuration))
      const key = waveformCacheKey(identity)
      useWaveform.getState().setPeaks(parsed, file.name, key)
      await cacheWaveformPeaks(key, parsed)
    } catch (err) {
      alert((err as Error).message)
    }
  }, [movieFile])

  const doNewBlankProject = useCallback(async () => {
    if (!(await guardUnsaved())) return

    if (fsSupported) {
      const handle = await pickFile(VIDEO_ACCEPT, 'Movie')
      if (!handle) return
      movieHandle.current = handle
      await cacheMovieHandle(handle)
      const file = await readHandleAsFile(handle)
      setMovieFromFile(file)
      loadProject(createEmptyProject(file.name))
    } else if (movieName) {
      loadProject(createEmptyProject(movieName))
    } else {
      closeProject()
      return
    }

    projectHandle.current = null
    setAutosaveEnabled(false)
    setStarted(true)
  }, [guardUnsaved, fsSupported, movieName, setMovieFromFile, loadProject, closeProject])

  const startEditing = useCallback(() => {
    if (!useProject.getState().project) {
      loadProject(createEmptyProject(movieName ?? 'movie'))
      projectHandle.current = null
      setAutosaveEnabled(false)
    }
    setStarted(true)
  }, [loadProject, movieName])

  const togglePreview = useCallback(() => {
    setPreviewEnabled((prev) => {
      const next = !prev
      writePreviewEnabled(next)
      return next
    })
  }, [])

  const toggleSpeakerFilter = useCallback((speakerId: string) => {
    setSpeakerFilter((prev) =>
      prev.includes(speakerId) ? prev.filter((id) => id !== speakerId) : [...prev, speakerId],
    )
  }, [])

  const toggleStatusFilter = useCallback((status: ReviewStatusFilter) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )
  }, [])

  const clearFilters = useCallback(() => {
    setSpeakerFilter([])
    setStatusFilter([])
  }, [])

  // Drop stale filter ids when speakers are removed.
  useEffect(() => {
    if (!project) return
    setSpeakerFilter((prev) => {
      const valid = prev.filter((id) => project.speakers.some((s) => s.id === id))
      return valid.length === prev.length ? prev : valid
    })
  }, [project?.speakers])

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

  // `P` toggles subtitle preview on the video.
  useEffect(() => {
    const onToggle = () => togglePreview()
    window.addEventListener('subbit:preview-toggle', onToggle)
    return () => window.removeEventListener('subbit:preview-toggle', onToggle)
  }, [togglePreview])

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

  const waveformLoaded = useWaveform((s) => s.peaks !== null)
  const restoreWaveform = useWaveform((s) => s.restoreFromCache)

  const { status: videoIdentityStatus, message: videoMismatchMessage } = useVideoIdentity(movieFile)

  // Restore cached waveform peaks when video identity is known.
  useEffect(() => {
    if (!started || !project?.video) return
    void restoreWaveform(project.video)
  }, [started, project?.video, restoreWaveform])
  const showVideoMismatch =
    !videoMismatchDismissed &&
    (videoIdentityStatus === 'mismatch' || videoIdentityStatus === 'missing') &&
    !!videoMismatchMessage

  if (!started || !project) {
    return (
      <>
        {showVideoMismatch && (
          <VideoMismatchBanner
            message={videoMismatchMessage}
            onDismiss={() => setVideoMismatchDismissed(true)}
          />
        )}
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
        onStart={startEditing}
        />
      </>
    )
  }

  return (
    <div className="app">
      {showVideoMismatch && (
        <VideoMismatchBanner
          message={videoMismatchMessage}
          onDismiss={() => setVideoMismatchDismissed(true)}
        />
      )}
      <Toolbar
        project={project}
        dirty={dirty}
        lastSavedAt={lastSavedAt}
        autosaveEnabled={autosaveEnabled}
        saving={saving}
        onSave={() => void save()}
        onExport={() => setExportOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        onOpenProject={() => void doOpenProject()}
        onNewBlankProject={() => void doNewBlankProject()}
        onImportWhisperx={() => void doImportWhisperx()}
        onImportWaveform={() => void doImportWaveform()}
        onCloseProject={() => void doCloseProject()}
        waveformLoaded={waveformLoaded}
        previewEnabled={previewEnabled}
        onTogglePreview={togglePreview}
        speakerFilter={speakerFilter}
        statusFilter={statusFilter}
        onToggleSpeakerFilter={toggleSpeakerFilter}
        onToggleStatusFilter={toggleStatusFilter}
        onClearFilters={clearFilters}
      />
      <ExportDialog
        open={exportOpen}
        onExport={doExport}
        onClose={() => setExportOpen(false)}
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
          {movieUrl ? (
            <VideoPlayer src={movieUrl} project={project} previewEnabled={previewEnabled} />
          ) : (
            <div className="video-wrap empty">No movie loaded</div>
          )}
          <SpeakerPanel project={project} />
        </div>
        <CueList project={project} speakerFilter={speakerFilter} statusFilter={statusFilter} />
      </div>
      {waveformLoaded && <WaveformTimeline project={project} />}
    </div>
  )
}
