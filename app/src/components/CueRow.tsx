import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Cue, Project } from "../types";
import { useProject } from "../store/project";
import { useLockReviewedStore } from "../store/lock-reviewed";
import { useAutosizeTextarea } from "../hooks/useAutosizeTextarea";
import { openRolePicker, NO_ROLE_LABEL } from "../lib/role-picker";
import { isReviewedCueLocked } from "../lib/cue-lock";
import { cueEndSeconds, cueStartSeconds } from "../lib/cue-timing";
import { isCueBeforeReferenceStart } from "../lib/program-start";
import { useShortcutLabel } from "../hooks/useShortcutLabel";
import { CueTimeField } from "./CueTimeField";
import { useTip } from "./Tooltip";
import { shotDisplayLabel } from "../lib/shot-display";
import type { FocusCueDetail } from "../lib/focus-cue";
import {
  buildHighlightChunks,
  segmentMatchKey,
  type FindHighlightState,
  INACTIVE_FIND_HIGHLIGHT,
} from "../lib/find-highlight";
import type { TextMatch } from "../lib/find-replace";
import { cueDisplayText } from "../lib/word-model/render";
import { cueHasNote } from "../lib/cue-filters";
import type { ToggleCueNoteDetail } from "../lib/focus-cue";
import {
  cueHasValidationIssues,
  formatCueValidationTooltip,
  validateCue,
} from "../lib/word-model/validation";

/**
 * Group bracket segment drawn in the gutter, computed against the *visible*
 * (filtered) list so it only ever connects adjacent visible group members.
 * "none" = no bracket (lone cue, or an isolated visible member of a group).
 */
export type BracketKind = "none" | "top" | "mid" | "bottom";

interface Props {
  cue: Cue;
  index: number;
  project: Project;
  selected: boolean;
  active: boolean;
  /** Display label for the gutter: "3" for a lone cue, "1a"/"1b"/… within a group. */
  runLabel: string;
  bracket: BracketKind;
  /** Show the join/unjoin chain to the previous cue (true predecessor is visible). */
  canToggleJoinPrev: boolean;
  findHighlight?: FindHighlightState;
  segmentMatchIndex?: Map<string, TextMatch[]>;
}

/** Closed chain — the two cues' In/Out are linked and move together. */
function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

/** Broken chain — the cues are independent; click to link them. */
function LinkBrokenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 17H7A5 5 0 0 1 7 7" />
      <path d="M15 7h2a5 5 0 0 1 4 8" />
      <line x1="8" y1="12" x2="12" y2="12" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function NoteIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
      <path d="M15 3v5h5" />
      {filled ? <path d="M8 13h8M8 17h5" /> : null}
    </svg>
  );
}

interface SegmentTextareaProps {
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  cueId: string;
  segIndex: number;
  value: string;
  readOnly?: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  findHighlight?: FindHighlightState;
  segmentMatches?: TextMatch[];
}

/**
 * Editable shot-range text. While focused, keeps a local draft so trailing
 * spaces survive until the next word is typed (the word model strips them on
 * store round-trip).
 *
 * Find highlights use a mirror layer; see docs/find-highlight-ui.md.
 */
function SegmentTextarea({
  inputRef,
  cueId,
  segIndex,
  value,
  readOnly = false,
  onFocus,
  onChange,
  findHighlight = INACTIVE_FIND_HIGHLIGHT,
  segmentMatches = [],
}: SegmentTextareaProps) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  /** Shared container for the highlight overlay stack (see docs/find-highlight-ui.md). */
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = inputRef ?? localRef;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const displayValue = editing ? draft : value;

  const showHighlights = findHighlight.active && segmentMatches.length > 0;

  const currentMatch =
    findHighlight.currentMatch?.cueId === cueId &&
    findHighlight.currentMatch.segIndex === segIndex
      ? findHighlight.currentMatch
      : null;

  const chunks = useMemo(() => {
    if (!showHighlights) return null;
    return buildHighlightChunks(displayValue, segmentMatches, currentMatch);
  }, [showHighlights, displayValue, segmentMatches, currentMatch]);

  useAutosizeTextarea(ref, displayValue, showHighlights ? wrapRef : undefined);

  const textarea = (
    <textarea
      ref={ref}
      className={
        showHighlights
          ? "seg-text seg-text-layer seg-text--overlay"
          : "seg-text"
      }
      data-cue-id={cueId}
      data-seg-index={segIndex}
      rows={1}
      value={displayValue}
      readOnly={readOnly}
      onFocus={() => {
        setDraft(value);
        setEditing(true);
        onFocus();
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        onChange(next);
      }}
    />
  );

  if (!showHighlights || !chunks) return textarea;

  return (
    <div ref={wrapRef} className="segment-text-wrap">
      <div className="seg-text-mirror seg-text-layer" aria-hidden="true">
        {chunks.map((chunk, i) =>
          chunk.kind === "plain" ? (
            <span key={i}>{chunk.text}</span>
          ) : (
            <mark
              key={i}
              className={
                chunk.kind === "current"
                  ? "find-match find-match--current"
                  : "find-match"
              }
            >
              {chunk.text}
            </mark>
          ),
        )}
      </div>
      {textarea}
    </div>
  );
}

function CueRowImpl({
  cue,
  index,
  project,
  selected,
  active,
  runLabel,
  bracket,
  canToggleJoinPrev,
  findHighlight = INACTIVE_FIND_HIGHLIGHT,
  segmentMatchIndex,
}: Props) {
  const firstTextarea = useRef<HTMLTextAreaElement>(null);
  const noteTextarea = useRef<HTMLTextAreaElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const {
    selectCue,
    selectSegment,
    setSegmentText,
    setSegmentShot,
    setCueNote,
    toggleReviewed,
    toggleJoinedToPrev,
    deleteCue,
  } = useProject();
  const cycleShotLabel = useShortcutLabel("cycle-shot");
  const deleteCueLabel = useShortcutLabel("delete-cue");
  const assignRoleLabel = useShortcutLabel("assign-role");
  const toggleReviewedLabel = useShortcutLabel("toggle-reviewed");
  const toggleNoteLabel = useShortcutLabel("toggle-note");
  const tip = useTip();
  useLockReviewedStore((s) => s.enabled);
  const locked = isReviewedCueLocked(cue);
  const hasNote = cueHasNote(cue);
  const noteValue = cue.note ?? "";
  useAutosizeTextarea(noteTextarea, noteValue);
  // Joining moves timing on both cues, so it needs the predecessor unlocked too.
  const prevCue = index > 0 ? project.cues[index - 1] : undefined;
  const joinLocked = locked || (!!prevCue && isReviewedCueLocked(prevCue));
  const joined = !!cue.joinedToPrev;

  // Focus this row's text when navigation mode requests editing.
  useEffect(() => {
    function onEdit(e: Event) {
      const raw = (e as CustomEvent<string | FocusCueDetail>).detail;
      const detail: FocusCueDetail =
        typeof raw === "string" ? { cueId: raw, scroll: "auto" } : raw;
      if (detail.cueId !== cue.id) return;
      if (locked) return;

      const segIndex = detail.segIndex ?? 0;
      const el =
        document.querySelector<HTMLTextAreaElement>(
          `textarea[data-cue-id="${cue.id}"][data-seg-index="${segIndex}"]`,
        ) ?? firstTextarea.current;
      el?.focus();
      if (detail.selStart != null && detail.selEnd != null) {
        el?.setSelectionRange(detail.selStart, detail.selEnd);
      }
    }
    window.addEventListener("subbit:edit", onEdit);
    return () => window.removeEventListener("subbit:edit", onEdit);
  }, [cue.id, locked]);

  useEffect(() => {
    function onToggleNote(e: Event) {
      const detail = (e as CustomEvent<ToggleCueNoteDetail>).detail;
      if (detail.cueId !== cue.id) return;
      setNoteOpen((open) => {
        const next = detail.open ?? !open;
        if (next && detail.focus) {
          requestAnimationFrame(() => noteTextarea.current?.focus());
        }
        return next;
      });
    }
    window.addEventListener("subbit:toggle-note", onToggleNote);
    return () => window.removeEventListener("subbit:toggle-note", onToggleNote);
  }, [cue.id]);

  useEffect(() => {
    if (!selected) {
      setNoteOpen(false);
      return;
    }
    if (hasNote) setNoteOpen(true);
  }, [selected, cue.id, hasNote]);

  const speaker = project.speakers.find((s) => s.id === cue.speakerId);
  const invalid = isCueBeforeReferenceStart(cue, project);
  const validationIssues = useMemo(() => validateCue(cue), [cue]);
  const validationTip = formatCueValidationTooltip(validationIssues);
  const cls = [
    "cue-row",
    selected && "selected",
    active && "active",
    cue.reviewed && "reviewed",
    locked && "reviewed-locked",
    invalid && "cue-invalid",
    hasNote && "cue-row--has-note",
    bracket !== "none" && `cue-row--bracket-${bracket}`,
    (bracket === "top" || bracket === "mid") && "cue-row--join-below",
  ]
    .filter(Boolean)
    .join(" ");

  const notePreview = noteValue.trim().split(/\r?\n/, 1)[0] ?? "";

  return (
    <div className="cue-row-wrap">
      <div
        className={cls}
        onMouseDown={() => selectCue(cue.id)}
        style={{ borderLeftColor: speaker?.color ?? "transparent" }}
      >
        {canToggleJoinPrev && (
          <span
            className="tooltip-wrap cue-join-toggle-wrap"
            {...tip(
              joinLocked
                ? "Reviewed (locked) — uncheck to change joining"
                : joined
                  ? "Unjoin from previous cue — In and Out stop staying in sync"
                  : "Join with previous cue — the boundary snaps between the two nearest words and their In/Out then move together",
            )}
          >
            <button
              type="button"
              className={`cue-join-toggle${joined ? " joined" : ""}`}
              aria-pressed={joined}
              aria-label={
                joined ? "Unjoin from previous cue" : "Join with previous cue"
              }
              disabled={joinLocked}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (joinLocked) return;
                toggleJoinedToPrev(cue.id);
              }}
            >
              {joined ? <LinkIcon /> : <LinkBrokenIcon />}
            </button>
          </span>
        )}
        <div className="cue-gutter">
          <span className="cue-no">{runLabel}</span>
          {invalid && (
            <span
              className="cue-invalid-badge"
              aria-label="Invalid: In is before subtitle start"
              {...tip(
                "In is before subtitle start — move In to subtitle start or later",
              )}
            >
              !
            </span>
          )}
          {!invalid && cueHasValidationIssues(cue) && (
            <span
              className="cue-validation-badge"
              aria-label="Timing validation warning"
              {...tip(validationTip)}
            >
              ⚠
            </span>
          )}
          <span
            className="tooltip-wrap cue-note-toggle-wrap"
            {...tip(
              locked
                ? hasNote
                  ? `Note: ${notePreview} (reviewed — locked)`
                  : "Reviewed (locked) — uncheck to add a note"
                : hasNote
                  ? `Note: ${notePreview} (${toggleNoteLabel})`
                  : `Add cue note (${toggleNoteLabel})`,
            )}
          >
            <button
              type="button"
              className={`cue-note-toggle${hasNote ? " has-note" : ""}${noteOpen ? " open" : ""}`}
              aria-pressed={noteOpen}
              aria-label={hasNote ? "Edit cue note" : "Add cue note"}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                selectCue(cue.id);
                setNoteOpen((open) => {
                  const next = !open;
                  if (next)
                    requestAnimationFrame(() => noteTextarea.current?.focus());
                  return next;
                });
              }}
            >
              <NoteIcon filled={hasNote} />
            </button>
          </span>
          <input
            type="checkbox"
            checked={!!cue.reviewed}
            disabled={invalid}
            onChange={() => toggleReviewed(cue.id)}
            {...tip(
              invalid
                ? "Fix In time before marking reviewed"
                : locked
                  ? "Reviewed (locked) — uncheck to edit"
                  : `Reviewed (${toggleReviewedLabel})`,
            )}
          />
        </div>

        <div className="cue-times">
          <CueTimeField
            cueId={cue.id}
            fileSeconds={cueStartSeconds(cue)}
            project={project}
            kind="in"
            locked={locked}
          />
          <CueTimeField
            cueId={cue.id}
            fileSeconds={cueEndSeconds(cue)}
            project={project}
            kind="out"
            locked={locked}
          />
        </div>

        <span
          className="tooltip-wrap"
          {...tip(
            locked
              ? "Reviewed (locked) — uncheck to assign role"
              : `Assign role (${assignRoleLabel})`,
          )}
        >
          <button
            type="button"
            className="cue-meta-select speaker-select role-trigger"
            disabled={locked}
            onClick={(e) => {
              if (locked) return;
              e.stopPropagation();
              selectCue(cue.id);
              openRolePicker(cue.id);
            }}
          >
            <span
              className="role-trigger-label"
              style={speaker?.color ? { color: speaker.color } : undefined}
            >
              {speaker?.name?.trim() || NO_ROLE_LABEL}
            </span>
          </button>
        </span>

        <div className="cue-segments">
          <div className="segment">
            <span
              className="tooltip-wrap"
              {...tip(
                locked
                  ? "Reviewed (locked) — uncheck to change shot"
                  : `Cycle shot type (${cycleShotLabel})`,
              )}
            >
              <select
                className="cue-meta-select shot-select"
                value={cue.shot}
                disabled={locked}
                onChange={(e) => setSegmentShot(cue.id, 0, e.target.value)}
              >
                {!project.shots.some((s) => s.id === cue.shot) && (
                  <option value={cue.shot}>{cue.shot}</option>
                )}
                {project.shots.map((sh) => (
                  <option key={sh.id} value={sh.id} title={sh.id}>
                    {shotDisplayLabel(sh.id, sh.label)}
                  </option>
                ))}
              </select>
            </span>
            <SegmentTextarea
              inputRef={firstTextarea}
              cueId={cue.id}
              segIndex={0}
              value={cueDisplayText(cue)}
              readOnly={locked}
              findHighlight={findHighlight}
              segmentMatches={
                segmentMatchIndex?.get(segmentMatchKey(cue.id, 0)) ?? []
              }
              onFocus={() => {
                selectCue(cue.id);
                selectSegment(0);
              }}
              onChange={(text) => setSegmentText(cue.id, 0, text)}
            />
          </div>
        </div>

        <span
          className="tooltip-wrap"
          {...tip(
            locked
              ? "Reviewed (locked) — uncheck to delete"
              : `Delete cue (${deleteCueLabel})`,
          )}
        >
          <button
            type="button"
            className="cue-delete-btn"
            aria-label={`Delete cue ${index + 1}`}
            disabled={locked}
            onClick={(e) => {
              if (locked) return;
              e.stopPropagation();
              deleteCue(cue.id);
            }}
          >
            <TrashIcon />
          </button>
        </span>
      </div>

      {noteOpen && (
        <div className="cue-note-row">
          <label className="cue-note-label" htmlFor={`cue-note-${cue.id}`}>
            Note
          </label>
          <textarea
            ref={noteTextarea}
            id={`cue-note-${cue.id}`}
            className="cue-note-text"
            rows={1}
            value={noteValue}
            readOnly={locked}
            placeholder="Editorial note (not exported)"
            onMouseDown={(e) => e.stopPropagation()}
            onFocus={() => selectCue(cue.id)}
            onBlur={(e) => {
              if (!e.target.value.trim()) setNoteOpen(false);
            }}
            onChange={(e) => setCueNote(cue.id, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

export const CueRow = memo(CueRowImpl);
