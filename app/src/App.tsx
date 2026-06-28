import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { useProject } from "./store/project";
import { buildExport, type ExportRequest } from "./lib/export-format";
import {
  parseSubtitleJsonText,
  projectFromWhisperxData,
} from "./lib/load-subtitles";
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
  downloadBlob,
  downloadText,
  isFileHandleStaleError,
  isFsAccessSupported,
  pickFile,
  pickFileAsFile,
  readHandleAsFile,
  serializeProject,
  type FsFileHandle,
} from "./lib/project-io";
import {
  cacheVideoHandleForProject,
  canRestoreLastSession,
  resolveVideoForProject,
} from "./lib/video-handle";
import {
  getActiveProjectId,
  listStoredProjectSummaries,
  loadStoredProject,
  saveStoredProject,
  setActiveProjectId,
  deleteStoredProject,
  type StoredProjectSummary,
} from "./lib/project-storage";
import { addVersion } from "./lib/history";
import { createEmptyProject } from "./lib/create-empty-project";
import {
  resolveProjectName,
  suggestedExportFilename,
  suggestedProjectBundleFilename,
} from "./lib/project-meta";
import { useShortcuts } from "./hooks/useShortcuts";
import { useKeyboardLayoutStore } from "./store/keyboard-layout";
import { useLockReviewedStore } from "./store/lock-reviewed";
import { useReferenceStartNoticeStore } from "./store/reference-start-notice";
import { LoadScreen } from "./components/LoadScreen";
import { LinkVideoDialog } from "./components/LinkVideoDialog";
import { ProjectSetupDialog } from "./components/ProjectSetupDialog";
import { VideoPlayer } from "./components/VideoPlayer";
import { CueList } from "./components/CueList";
import { SpeakerPanel } from "./components/SpeakerPanel";
import { Toolbar } from "./components/Toolbar";
import { ExportDialog } from "./components/ExportDialog";
import { RolePicker } from "./components/RolePicker";
import { HelpOverlay } from "./components/HelpOverlay";
import { HistoryPanel } from "./components/HistoryPanel";
import { FindReplaceDialog } from "./components/FindReplaceDialog";
import {
  INACTIVE_FIND_HIGHLIGHT,
  type FindHighlightState,
} from "./lib/find-highlight";
import { UnsavedDialog } from "./components/UnsavedDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { NoticeDialog } from "./components/NoticeDialog";
import { VideoMismatchBanner } from "./components/VideoMismatchBanner";
import { WaveformTimeline } from "./components/WaveformTimeline";
import { WaveformPeaksHelpDialog } from "./components/WaveformPeaksHelpDialog";
import { useVideoIdentity } from "./hooks/useVideoIdentity";
import { useWaveform } from "./store/waveform";
import {
  formatWaveformDurationMismatch,
  parseWaveformPeaksFile,
} from "./lib/waveform-peaks";
import { usePlayback } from "./store/playback";
import type { ReviewStatusFilter } from "./lib/cue-filters";
import type { Project, VideoIdentity } from "./types";
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
const VIDEO_PICKER_LABEL = "Video (.mp4, .m4v, .mov)";
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
  const syncVideoNameFromFile = useProject((s) => s.syncVideoNameFromFile);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMismatchDismissed, setVideoMismatchDismissed] = useState(false);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findHighlight, setFindHighlight] = useState<FindHighlightState>(
    INACTIVE_FIND_HIGHLIGHT,
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(readPreviewEnabled);
  const lockReviewedCues = useLockReviewedStore((s) => s.enabled);
  const toggleLockReviewed = useLockReviewedStore((s) => s.toggle);
  const invalidCueCount = useReferenceStartNoticeStore(
    (s) => s.invalidCueCount,
  );
  const dismissReferenceStartNotice = useReferenceStartNoticeStore(
    (s) => s.dismiss,
  );
  const [speakerFilter, setSpeakerFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter[]>([]);
  const [rolePickerCueId, setRolePickerCueId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupBusy, setSetupBusy] = useState<string | null>(null);
  const [storedProjects, setStoredProjects] = useState<StoredProjectSummary[]>(
    [],
  );
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProjectIdForList, setActiveProjectIdForList] = useState<
    string | undefined
  >();
  const [deleteTarget, setDeleteTarget] = useState<StoredProjectSummary | null>(
    null,
  );
  const [pendingVideoPick, setPendingVideoPick] = useState<{
    projectName: string;
    videoName: string;
    video?: VideoIdentity;
  } | null>(null);
  const [waveformHelpOpen, setWaveformHelpOpen] = useState(false);
  const [timelineWidthPx, setTimelineWidthPx] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );

  const videoHandle = useRef<FsFileHandle | null>(null);
  const pendingOpenProjectId = useRef<string | null>(null);
  const unsavedResolver = useRef<((proceed: boolean) => void) | null>(null);
  const fsSupported = isFsAccessSupported();

  const clearPendingVideoPick = useCallback(() => {
    pendingOpenProjectId.current = null;
    setPendingVideoPick(null);
  }, []);

  const armPendingVideoPick = useCallback(
    (pick: {
      projectId: string;
      projectName: string;
      videoName: string;
      video?: VideoIdentity;
    }) => {
      pendingOpenProjectId.current = pick.projectId;
      setPendingVideoPick({
        projectName: pick.projectName,
        videoName: pick.videoName,
        video: pick.video,
      });
    },
    [],
  );

  const setVideoFromFile = useCallback((file: File) => {
    setVideoFile(file);
    setVideoMismatchDismissed(false);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setVideoFileName(file.name);
  }, []);

  const pickVideoFile = useCallback(
    () => pickFile(VIDEO_ACCEPT, VIDEO_PICKER_LABEL),
    [],
  );

  const applyVideoForProject = useCallback(
    (file: File, handle: FsFileHandle) => {
      videoHandle.current = handle;
      setVideoFromFile(file);
      syncVideoNameFromFile(file.name);
    },
    [setVideoFromFile, syncVideoNameFromFile],
  );

  const closeSetup = useCallback(() => {
    setSetupOpen(false);
    setSetupBusy(null);
  }, []);

  const refreshStoredProjects = useCallback(async () => {
    const [list, activeId] = await Promise.all([
      listStoredProjectSummaries(),
      getActiveProjectId(),
    ]);
    setStoredProjects(list);
    setActiveProjectIdForList(activeId);
    setProjectsLoading(false);
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
        if (videoFile && Number.isFinite(videoDuration) && videoDuration > 0) {
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
    const file = await pickFileAsFile(ZIP_ACCEPT, "Subbit project bundle");
    if (!file) return null;
    return new Uint8Array(await file.arrayBuffer());
  }, []);

  /** New-user path: video first, empty project, then setup dialog. */
  const beginNewSessionWithVideo = useCallback(
    async (file: File, handle?: FsFileHandle) => {
      clearPendingVideoPick();
      const next = createEmptyProject(file.name);
      if (handle) {
        await cacheVideoHandleForProject(next.id, handle);
        videoHandle.current = handle;
      }
      setVideoFromFile(file);
      await activateProject(next);
      setSetupOpen(true);
      setStarted(true);
    },
    [clearPendingVideoPick, setVideoFromFile, activateProject],
  );

  const pickVideo = useCallback(async () => {
    const handle = await pickVideoFile();
    if (!handle) return;
    try {
      await beginNewSessionWithVideo(await readHandleAsFile(handle), handle);
    } catch (err) {
      if (isFileHandleStaleError(err)) {
        alert("That video file could not be opened. Try choosing it again.");
        return;
      }
      throw err;
    }
  }, [beginNewSessionWithVideo, pickVideoFile]);

  const finishOpeningPendingProject = useCallback(
    async (file: File, handle?: FsFileHandle): Promise<boolean> => {
      const pendingId = pendingOpenProjectId.current;
      if (!pendingId) return false;

      setBusy("Opening project…");
      try {
        const stored = await loadStoredProject(pendingId);
        if (!stored) {
          clearPendingVideoPick();
          return false;
        }
        if (handle) {
          await cacheVideoHandleForProject(pendingId, handle);
          applyVideoForProject(file, handle);
        } else {
          setVideoFromFile(file);
          syncVideoNameFromFile(file.name);
        }
        await setActiveProjectId(pendingId);
        await activateProject(stored);
        clearPendingVideoPick();
        setStarted(true);
        return true;
      } finally {
        setBusy(null);
      }
    },
    [
      activateProject,
      applyVideoForProject,
      clearPendingVideoPick,
      setVideoFromFile,
      syncVideoNameFromFile,
    ],
  );

  const onVideoFile = useCallback(
    async (file: File) => {
      if (pendingOpenProjectId.current) {
        await finishOpeningPendingProject(file);
        return;
      }
      await beginNewSessionWithVideo(file);
    },
    [beginNewSessionWithVideo, finishOpeningPendingProject],
  );

  const linkVideoForPendingProject = useCallback(async () => {
    if (!pendingOpenProjectId.current) return;
    const handle = await pickVideoFile();
    if (!handle) return;
    try {
      await finishOpeningPendingProject(await readHandleAsFile(handle), handle);
    } catch (err) {
      if (isFileHandleStaleError(err)) {
        alert("That video file could not be opened. Try choosing it again.");
        return;
      }
      throw err;
    }
  }, [finishOpeningPendingProject, pickVideoFile]);

  const openStoredProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      const stored = await loadStoredProject(projectId);
      if (!stored) {
        alert("Could not load that project.");
        await refreshStoredProjects();
        return false;
      }

      const resolved = await resolveVideoForProject(stored, {
        fsSupported,
        sessionHandle: videoHandle.current,
        requestPermission: true,
      });

      if (!resolved) {
        armPendingVideoPick({
          projectId,
          projectName: stored.name,
          videoName: stored.videoName,
          video: stored.video,
        });
        return false;
      }

      setBusy("Opening project…");
      try {
        await setActiveProjectId(projectId);
        await cacheVideoHandleForProject(projectId, resolved.handle);
        applyVideoForProject(resolved.file, resolved.handle);
        await activateProject(stored);
        setStarted(true);
        return true;
      } finally {
        setBusy(null);
      }
    },
    [
      activateProject,
      applyVideoForProject,
      armPendingVideoPick,
      refreshStoredProjects,
    ],
  );

  const confirmDeleteProject = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy("Deleting…");
    try {
      const removed = await deleteStoredProject(deleteTarget.id);
      if (!removed) {
        alert("Could not delete that project.");
        return;
      }
      if (deleteTarget.id === activeProjectIdForList) {
        setCanRestore(false);
        setActiveProjectIdForList(undefined);
      }
      setDeleteTarget(null);
      await refreshStoredProjects();
    } finally {
      setBusy(null);
    }
  }, [deleteTarget, activeProjectIdForList, refreshStoredProjects]);

  const doRestore = useCallback(
    async (silent: boolean): Promise<boolean> => {
      const projectId = await getActiveProjectId();
      if (!projectId) return false;

      const stored = await loadStoredProject(projectId);
      if (!stored) return false;

      const resolved = await resolveVideoForProject(stored, {
        fsSupported: true,
        sessionHandle: videoHandle.current,
        requestPermission: !silent,
      });
      if (!resolved) {
        if (!silent) {
          armPendingVideoPick({
            projectId,
            projectName: stored.name,
            videoName: stored.videoName,
            video: stored.video,
          });
        }
        return false;
      }

      setBusy("Reopening...");
      try {
        applyVideoForProject(resolved.file, resolved.handle);
        await activateProject(stored);
        setStarted(true);
        return true;
      } finally {
        setBusy(null);
      }
    },
    [activateProject, applyVideoForProject, armPendingVideoPick],
  );

  useEffect(() => {
    void useKeyboardLayoutStore.getState().hydrate();
  }, []);

  useEffect(() => {
    void (async () => {
      setProjectsLoading(true);
      await refreshStoredProjects();
      try {
        if (fsSupported && (await doRestore(true))) return;
      } catch (err) {
        console.error("Auto-restore failed", err);
      }
      const projectId = await getActiveProjectId();
      if (projectId && (await loadStoredProject(projectId))) {
        try {
          setCanRestore(await canRestoreLastSession(projectId));
        } catch (err) {
          console.error("Restore check failed", err);
          setCanRestore(false);
        }
      }
    })();
  }, [fsSupported, doRestore, refreshStoredProjects]);

  useEffect(() => {
    if (!started) void refreshStoredProjects();
  }, [started, refreshStoredProjects]);

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
    const waveform = peaks ? waveformInputToBundleFile(peaks.input) : undefined;
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
    videoHandle.current = null;
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
      alert("Load a video first so waveform peaks can be matched to it.");
      return false;
    }

    const file = await pickFileAsFile(WAVEFORM_ACCEPT, "waveform peaks");
    if (!file) return false;

    try {
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

  const onSetupManual = useCallback(
    async (projectName: string) => {
      const video = videoFileName ?? "video";
      useProject
        .getState()
        .setProjectName(resolveProjectName(projectName, video));
      await save({ auto: true });
      closeSetup();
    },
    [closeSetup, save, videoFileName],
  );

  const onSetupWhisperx = useCallback(
    async (projectName: string) => {
      setSetupBusy("Importing whisperx…");
      try {
        const file = await pickFileAsFile(JSON_ACCEPT, "whisperx JSON");
        if (!file) return;
        const video = videoFileName ?? "video";
        const text = await file.text();
        const data = parseSubtitleJsonText(text);
        const imported = projectFromWhisperxData(data, video);
        await activateProject({
          ...imported,
          name: resolveProjectName(projectName, video),
        });
        closeSetup();
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setSetupBusy(null);
      }
    },
    [activateProject, videoFileName, closeSetup],
  );

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
      const handle = await pickVideoFile();
      if (!handle) return;
      try {
        const file = await readHandleAsFile(handle);
        const next = createEmptyProject(file.name);
        await cacheVideoHandleForProject(next.id, handle);
        videoHandle.current = handle;
        setVideoFromFile(file);
        await activateProject(next);
      } catch (err) {
        if (isFileHandleStaleError(err)) {
          alert("That video file could not be opened. Try choosing it again.");
          return;
        }
        throw err;
      }
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
    const onToggle = () => setFindReplaceOpen((open) => !open);
    window.addEventListener("subbit:find-replace-toggle", onToggle);
    return () =>
      window.removeEventListener("subbit:find-replace-toggle", onToggle);
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
  const showTimeline = Number.isFinite(videoDuration) && videoDuration > 0;
  const hasWaveformPeaks = useWaveform((s) => s.peaks !== null);
  const waveformSourceName = useWaveform((s) => s.sourceName);
  const waveformImportEnabled =
    !!videoFile && Number.isFinite(videoDuration) && videoDuration > 0;

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
          storedProjects={storedProjects}
          projectsLoading={projectsLoading}
          activeProjectId={activeProjectIdForList}
          onPickVideo={() => void pickVideo()}
          onVideoFile={(file) => void onVideoFile(file)}
          onRestore={() => void doRestore(false)}
          onOpenProject={(id) => void openStoredProject(id)}
          onDeleteProject={setDeleteTarget}
        />
        <LinkVideoDialog
          open={pendingVideoPick !== null}
          fsSupported={fsSupported}
          projectName={pendingVideoPick?.projectName ?? ""}
          videoName={pendingVideoPick?.videoName ?? ""}
          video={pendingVideoPick?.video}
          busy={busy}
          onVideoFile={(file) => void onVideoFile(file)}
          onPickVideo={() => void linkVideoForPendingProject()}
          onCancel={clearPendingVideoPick}
        />
        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete project?"
          message={
            deleteTarget
              ? `“${deleteTarget.name}” will be removed from this browser, including its saved history. This can’t be undone.`
              : ""
          }
          confirmLabel={busy === "Deleting…" ? "Deleting…" : "Delete"}
          danger
          busy={busy === "Deleting…"}
          onConfirm={() => void confirmDeleteProject()}
          onCancel={() => setDeleteTarget(null)}
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
        findReplaceOpen={findReplaceOpen}
        onToggleFindReplace={() => setFindReplaceOpen((open) => !open)}
        onImportProjectBundle={() => void doImportProjectBundle()}
        onExportProjectBundle={doExportProjectBundle}
        onNewBlankProject={() => void doNewBlankProject()}
        onCloseProject={() => void doCloseProject()}
        hasWaveformPeaks={hasWaveformPeaks}
        onShowWaveformPeaks={() => setWaveformHelpOpen(true)}
        previewEnabled={previewEnabled}
        onTogglePreview={togglePreview}
        lockReviewedCues={lockReviewedCues}
        onToggleLockReviewed={toggleLockReviewed}
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
      <NoticeDialog
        open={invalidCueCount !== null}
        title="Cues before subtitle start"
        message={
          invalidCueCount !== null
            ? `${invalidCueCount} cue${invalidCueCount === 1 ? "" : "s"} start before the new subtitle start position and ${invalidCueCount === 1 ? "is" : "are"} marked invalid. Move their In times to subtitle start or later, or clear subtitle start.`
            : ""
        }
        onClose={dismissReferenceStartNotice}
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
        onImportWhisperx={(name) => void onSetupWhisperx(name)}
        onAnnotateManually={(name) => void onSetupManual(name)}
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
        <div className="cue-column">
          <FindReplaceDialog
            open={findReplaceOpen}
            onClose={() => setFindReplaceOpen(false)}
            onHighlightChange={setFindHighlight}
            project={project}
            speakerFilter={speakerFilter}
            statusFilter={statusFilter}
          />
          <CueList
            project={project}
            speakerFilter={speakerFilter}
            statusFilter={statusFilter}
            findHighlight={findHighlight}
          />
        </div>
      </div>
      {showTimeline && (
        <WaveformTimeline
          project={project}
          onShowWaveformPeaks={() => setWaveformHelpOpen(true)}
          onTimelineWidthChange={setTimelineWidthPx}
        />
      )}
      <WaveformPeaksHelpDialog
        open={waveformHelpOpen}
        onClose={() => setWaveformHelpOpen(false)}
        onImport={() => void importWaveformFile()}
        importEnabled={waveformImportEnabled}
        timelineWidthPx={timelineWidthPx}
        videoDurationSeconds={videoDuration}
        sourceName={waveformSourceName}
        hasRealPeaks={hasWaveformPeaks}
        videoName={project.videoName ?? videoFileName}
      />
    </div>
  );
}
