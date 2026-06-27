import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { useProject } from "./store/project";
import { buildExport, type ExportRequest } from "./lib/export-format";
import { parseSubtitleJsonText, projectFromWhisperxData } from "./lib/load-subtitles";
import {
  buildProjectBundleZip,
  parseProjectBundleZip,
  waveformInputToBundleFile,
} from "./lib/project-bundle";
import {
  projectFromBundleText,
  parseWaveformFromBundle,
} from "./lib/import-project-bundle";
import {
  cacheVideoHandle,
  downloadBlob,
  downloadText,
  ensurePermission,
  getCachedVideoHandle,
  hasPermission,
  isFsAccessSupported,
  pickFile,
  readHandleAsFile,
  serializeProject,
  type FsFileHandle,
} from "./lib/project-io";
import {
  getActiveProjectId,
  loadStoredProject,
  saveStoredProject,
} from "./lib/project-storage";
import { addVersion } from "./lib/history";
import { createEmptyProject } from "./lib/create-empty-project";
import {
  suggestedExportFilename,
  suggestedProjectBundleFilename,
} from "./lib/project-meta";
import { useShortcuts } from "./hooks/useShortcuts";
import { LoadScreen } from "./components/LoadScreen";
import { ProjectSetupDialog } from "./components/ProjectSetupDialog";
import { VideoPlayer } from "./components/VideoPlayer";
import { CueList } from "./components/CueList";
import { SpeakerPanel } from "./components/SpeakerPanel";
import { Toolbar } from "./components/Toolbar";
import { ExportDialog } from "./components/ExportDialog";
import { RolePicker } from "./components/RolePicker";
import { HelpOverlay } from "./components/HelpOverlay";
import { HistoryPanel } from "./components/HistoryPanel";
import { UnsavedDialog } from "./components/UnsavedDialog";
import { VideoMismatchBanner } from "./components/VideoMismatchBanner";
import { WaveformTimeline } from "./components/WaveformTimeline";
import { useVideoIdentity } from "./hooks/useVideoIdentity";
import { useWaveform } from "./store/waveform";
import {
  formatWaveformDurationMismatch,
  parseWaveformPeaksFile,
} from "./lib/waveform-peaks";
import { usePlayback } from "./store/playback";
import type { ReviewStatusFilter } from "./lib/cue-filters";
import type { Project } from "./types";
import {
  readPreviewEnabled,
  writePreviewEnabled,
} from "./lib/preview-settings";

const JSON_ACCEPT = { "application/json": [".json"] };
const ZIP_ACCEPT = {
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};
const VIDEO_ACCEPT = { "video/mp4": [".mp4", ".m4v", ".mov"] };
const WAVEFORM_ACCEPT = {
  "application/octet-stream": [".dat"],
  "application/json": [".json", ".waveform.json"],
};

export default function App() {
  const project = useProject((s) => s.project);
  const dirty = useProject((s) => s.dirty);
  const lastSavedAt = useProject((s) => s.lastSavedAt);
  const loadProject = useProject((s) => s.loadProject);
  const clearProject = useProject((s) => s.clearProject);
  const markSaved = useProject((s) => s.markSaved);
  const restoreProject = useProject((s) => s.restoreProject);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMismatchDismissed, setVideoMismatchDismissed] = useState(false);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(readPreviewEnabled);
  const [speakerFilter, setSpeakerFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter[]>([]);
  const [rolePickerCueId, setRolePickerCueId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupBusy, setSetupBusy] = useState<string | null>(null);

  const videoHandle = useRef<FsFileHandle | null>(null);
  const unsavedResolver = useRef<((proceed: boolean) => void) | null>(null);
  const fsSupported = isFsAccessSupported();

  const setVideoFromFile = useCallback((file: File) => {
    setVideoFile(file);
    setVideoMismatchDismissed(false);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setVideoFileName(file.name);
  }, []);

  const closeSetup = useCallback(() => {
    setSetupOpen(false);
    setSetupBusy(null);
  }, []);

  /** Load into editor, persist JSON to IndexedDB, restore stored waveform. */
  const activateProject = useCallback(
    async (next: Project) => {
      loadProject(next);
      setVideoMismatchDismissed(false);
      const text = serializeProject(next);
      await saveStoredProject(next, text);
      markSaved();
      useWaveform.getState().clearPeaks();
      await useWaveform.getState().restoreForProject(next.id);
    },
    [loadProject, markSaved],
  );

  const loadProjectBundleBytes = useCallback(
    async (data: Uint8Array) => {
      const bundle = parseProjectBundleZip(data);
      const next = projectFromBundleText(
        bundle.projectText,
        videoFileName ?? "video",
      );
      await activateProject(next);
      if (bundle.waveform) {
        const videoDuration = usePlayback.getState().duration;
        const parsed = await parseWaveformFromBundle(bundle.waveform);
        if (
          videoFile &&
          Number.isFinite(videoDuration) &&
          videoDuration > 0
        ) {
          const mismatch = formatWaveformDurationMismatch(
            parsed.meta.duration,
            videoDuration,
          );
          if (mismatch && !window.confirm(`${mismatch}\n\nImport anyway?`)) {
            return;
          }
        }
        useWaveform
          .getState()
          .setPeaks(parsed, bundle.waveform.fileName, next.id);
        await useWaveform.getState().persistForProject(next.id);
      }
    },
    [activateProject, videoFile, videoFileName],
  );

  const pickProjectBundle = useCallback(async () => {
    const handle = await pickFile(ZIP_ACCEPT, "Subbit project bundle");
    if (!handle) return null;
    return new Uint8Array(await (await readHandleAsFile(handle)).arrayBuffer());
  }, []);

  /** New-user path: video first, empty project, then setup dialog. */
  const beginNewSessionWithVideo = useCallback(
    async (file: File, handle?: FsFileHandle) => {
      if (handle) {
        videoHandle.current = handle;
        await cacheVideoHandle(handle);
      }
      setVideoFromFile(file);
      await activateProject(createEmptyProject(file.name));
      setSetupOpen(true);
      setStarted(true);
    },
    [setVideoFromFile, activateProject],
  );

  const pickVideo = useCallback(async () => {
    const handle = await pickFile(VIDEO_ACCEPT, "Video");
    if (!handle) return;
    await beginNewSessionWithVideo(await readHandleAsFile(handle), handle);
  }, [beginNewSessionWithVideo]);

  const onVideoFile = useCallback(
    (file: File) => void beginNewSessionWithVideo(file),
    [beginNewSessionWithVideo],
  );

  const doRestore = useCallback(
    async (silent: boolean): Promise<boolean> => {
      const [videoH, projectId] = await Promise.all([
        getCachedVideoHandle(),
        getActiveProjectId(),
      ]);
      if (!videoH || !projectId) return false;

      const stored = await loadStoredProject(projectId);
      if (!stored) return false;

      const check = silent ? hasPermission : ensurePermission;
      if (!(await check(videoH, "read"))) return false;

      setBusy("Reopening...");
      try {
        videoHandle.current = videoH;
        setVideoFromFile(await readHandleAsFile(videoH));
        await activateProject(stored);
        setStarted(true);
        return true;
      } finally {
        setBusy(null);
      }
    },
    [activateProject, setVideoFromFile],
  );

  useEffect(() => {
    void (async () => {
      if (fsSupported && (await doRestore(true))) return;
      const [videoH, projectId] = await Promise.all([
        getCachedVideoHandle(),
        getActiveProjectId(),
      ]);
      if (videoH && projectId && (await loadStoredProject(projectId))) {
        setCanRestore(true);
      }
    })();
  }, [fsSupported, doRestore]);

  const save = useCallback(
    async (opts: { auto?: boolean } = {}): Promise<boolean> => {
      const current = useProject.getState().project;
      if (!current) return false;
      const text = serializeProject(current);
      setSaving(true);
      try {
        await saveStoredProject(current, text);
        markSaved();
        void addVersion(current, text, { auto: opts.auto }).catch((err) =>
          console.error("History snapshot failed", err),
        );
        return true;
      } catch (err) {
        console.error("Save failed", err);
        alert("Save failed: " + (err as Error).message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [markSaved],
  );

  const doExport = useCallback((request: ExportRequest) => {
    const current = useProject.getState().project;
    if (!current) return;
    const { content, ext, mime } = buildExport(current, request);
    downloadText(suggestedExportFilename(current, ext), content, mime);
  }, []);

  const doExportProjectBundle = useCallback(() => {
    const current = useProject.getState().project;
    if (!current) return;
    const text = serializeProject(current);
    const peaks = useWaveform.getState().peaks;
    const waveform = peaks
      ? waveformInputToBundleFile(peaks.input)
      : undefined;
    const zip = buildProjectBundleZip(text, waveform);
    downloadBlob(
      suggestedProjectBundleFilename(current),
      new Blob([new Uint8Array(zip)], { type: "application/zip" }),
    );
  }, []);

  const guardUnsaved = useCallback((): Promise<boolean> => {
    if (!useProject.getState().dirty) return Promise.resolve(true);
    return new Promise((resolve) => {
      unsavedResolver.current = resolve;
      setUnsavedOpen(true);
    });
  }, []);

  const resolveUnsaved = useCallback(
    async (choice: "save" | "discard" | "cancel") => {
      setUnsavedOpen(false);
      const resolve = unsavedResolver.current;
      unsavedResolver.current = null;
      if (!resolve) return;
      if (choice === "cancel") {
        resolve(false);
        return;
      }
      if (choice === "discard") {
        resolve(true);
        return;
      }
      resolve(await save());
    },
    [save],
  );

  const closeProject = useCallback(() => {
    setStarted(false);
    setSetupOpen(false);
    setSetupBusy(null);
    clearProject();
    useWaveform.getState().clearPeaks();
  }, [clearProject]);

  const doCloseProject = useCallback(async () => {
    if (!(await guardUnsaved())) return;
    closeProject();
  }, [guardUnsaved, closeProject]);

  const doImportProjectBundle = useCallback(async () => {
    if (!(await guardUnsaved())) return;
    try {
      const bytes = await pickProjectBundle();
      if (!bytes) return;
      await loadProjectBundleBytes(bytes);
    } catch (err) {
      alert((err as Error).message);
    }
  }, [guardUnsaved, pickProjectBundle, loadProjectBundleBytes]);

  const importWaveformFile = useCallback(async (): Promise<boolean> => {
    const current = useProject.getState().project;
    if (!current) return false;
    const videoDuration = usePlayback.getState().duration;
    if (!videoFile || !Number.isFinite(videoDuration) || videoDuration <= 0) {
      alert(
        "Load a video first so waveform peaks can be matched to it.",
      );
      return false;
    }

    const handle = await pickFile(WAVEFORM_ACCEPT, "waveform peaks");
    if (!handle) return false;

    try {
      const file = await readHandleAsFile(handle);
      const parsed = await parseWaveformPeaksFile(file);
      const mismatch = formatWaveformDurationMismatch(
        parsed.meta.duration,
        videoDuration,
      );
      if (mismatch && !window.confirm(`${mismatch}\n\nImport anyway?`)) {
        return false;
      }

      useWaveform.getState().setPeaks(parsed, file.name, current.id);
      await useWaveform.getState().persistForProject(current.id);
      return true;
    } catch (err) {
      alert((err as Error).message);
      return false;
    }
  }, [videoFile]);

  const onSetupManual = useCallback(() => {
    closeSetup();
  }, [closeSetup]);

  const onSetupWhisperx = useCallback(async () => {
    setSetupBusy("Importing whisperx…");
    try {
      const handle = await pickFile(JSON_ACCEPT, "whisperx JSON");
      if (!handle) return;
      const text = await (await readHandleAsFile(handle)).text();
      const data = parseSubtitleJsonText(text);
      await activateProject(
        projectFromWhisperxData(data, videoFileName ?? "video"),
      );
      closeSetup();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSetupBusy(null);
    }
  }, [activateProject, videoFileName, closeSetup]);

  const onSetupImportProject = useCallback(async () => {
    setSetupBusy("Opening project…");
    try {
      const bytes = await pickProjectBundle();
      if (!bytes) return;
      await loadProjectBundleBytes(bytes);
      closeSetup();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSetupBusy(null);
    }
  }, [pickProjectBundle, loadProjectBundleBytes, closeSetup]);

  const doNewBlankProject = useCallback(async () => {
    if (!(await guardUnsaved())) return;

    if (fsSupported) {
      const handle = await pickFile(VIDEO_ACCEPT, "Video");
      if (!handle) return;
      videoHandle.current = handle;
      await cacheVideoHandle(handle);
      const file = await readHandleAsFile(handle);
      setVideoFromFile(file);
      await activateProject(createEmptyProject(file.name));
    } else if (videoFileName) {
      await activateProject(createEmptyProject(videoFileName));
    } else {
      closeProject();
      return;
    }

    setStarted(true);
  }, [
    guardUnsaved,
    fsSupported,
    videoFileName,
    setVideoFromFile,
    activateProject,
    closeProject,
  ]);

  const togglePreview = useCallback(() => {
    setPreviewEnabled((prev) => {
      const next = !prev;
      writePreviewEnabled(next);
      return next;
    });
  }, []);

  const toggleSpeakerFilter = useCallback((speakerId: string) => {
    setSpeakerFilter((prev) =>
      prev.includes(speakerId)
        ? prev.filter((id) => id !== speakerId)
        : [...prev, speakerId],
    );
  }, []);

  const toggleStatusFilter = useCallback((status: ReviewStatusFilter) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSpeakerFilter([]);
    setStatusFilter([]);
  }, []);

  const speakers = project?.speakers;

  useEffect(() => {
    if (!speakers) return;
    setSpeakerFilter((prev) => {
      const valid = prev.filter((id) => speakers.some((s) => s.id === id));
      return valid.length === prev.length ? prev : valid;
    });
  }, [speakers]);

  useEffect(() => {
    function onRolePickerOpen(e: Event) {
      const detail = (e as CustomEvent<{ cueId?: string } | undefined>).detail;
      const id = detail?.cueId ?? useProject.getState().selectedCueId;
      if (id) setRolePickerCueId(id);
    }
    window.addEventListener("subbit:role-picker-open", onRolePickerOpen);
    return () =>
      window.removeEventListener("subbit:role-picker-open", onRolePickerOpen);
  }, []);

  useEffect(() => {
    const onSave = () => void save();
    window.addEventListener("subbit:save", onSave);
    return () => window.removeEventListener("subbit:save", onSave);
  }, [save]);

  useEffect(() => {
    const onToggle = () => setHelpOpen((v) => !v);
    window.addEventListener("subbit:help-toggle", onToggle);
    return () => window.removeEventListener("subbit:help-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onToggle = () => togglePreview();
    window.addEventListener("subbit:preview-toggle", onToggle);
    return () => window.removeEventListener("subbit:preview-toggle", onToggle);
  }, [togglePreview]);

  useEffect(() => {
    if (!dirty || !started) return;
    const id = setTimeout(() => void save({ auto: true }), 3000);
    return () => clearTimeout(id);
  }, [dirty, started, save]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useShortcuts();

  const videoDuration = usePlayback((s) => s.duration);
  const showTimeline =
    Number.isFinite(videoDuration) && videoDuration > 0;

  const { status: videoIdentityStatus, message: videoMismatchMessage } =
    useVideoIdentity(videoFile);

  const showVideoMismatch =
    !videoMismatchDismissed &&
    (videoIdentityStatus === "mismatch" || videoIdentityStatus === "missing") &&
    !!videoMismatchMessage;

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
          canRestore={canRestore}
          busy={busy}
          onPickVideo={() => void pickVideo()}
          onVideoFile={onVideoFile}
          onRestore={() => void doRestore(false)}
        />
      </>
    );
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
        autosaveEnabled
        saving={saving}
        onSave={() => void save()}
        onExport={() => setExportOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        onImportProjectBundle={() => void doImportProjectBundle()}
        onExportProjectBundle={doExportProjectBundle}
        onNewBlankProject={() => void doNewBlankProject()}
        onCloseProject={() => void doCloseProject()}
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
        onSave={() => void resolveUnsaved("save")}
        onDiscard={() => void resolveUnsaved("discard")}
        onCancel={() => void resolveUnsaved("cancel")}
      />
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <RolePicker
        open={rolePickerCueId !== null}
        cueId={rolePickerCueId}
        project={project}
        onClose={() => setRolePickerCueId(null)}
      />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        project={project}
        onRestore={restoreProject}
      />
      <ProjectSetupDialog
        open={setupOpen}
        videoFile={videoFile}
        busy={setupBusy}
        onImportProject={() => void onSetupImportProject()}
        onImportWhisperx={() => void onSetupWhisperx()}
        onAnnotateManually={onSetupManual}
      />
      <div className="main">
        <div className="left">
          {videoUrl ? (
            <VideoPlayer
              src={videoUrl}
              project={project}
              previewEnabled={previewEnabled}
            />
          ) : (
            <div className="video-wrap empty">No video loaded</div>
          )}
          <SpeakerPanel project={project} />
        </div>
        <CueList
          project={project}
          speakerFilter={speakerFilter}
          statusFilter={statusFilter}
        />
      </div>
      {showTimeline && (
        <WaveformTimeline
          project={project}
          onImportWaveform={() => void importWaveformFile()}
        />
      )}
    </div>
  );
}
