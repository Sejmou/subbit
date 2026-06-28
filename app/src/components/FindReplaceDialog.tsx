import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../types";
import { useProject } from "../store/project";
import {
  cueMatchesListFilters,
  hasActiveFilters,
  type ReviewStatusFilter,
} from "../lib/cue-filters";
import {
  buildReplaceAllUpdates,
  filterReplaceableMatches,
  findTextMatches,
  replaceMatchInText,
  type TextMatch,
} from "../lib/find-replace";
import { isReviewedCueLocked } from "../lib/cue-lock";
import {
  INACTIVE_FIND_HIGHLIGHT,
  type FindHighlightState,
} from "../lib/find-highlight";
import { setFindReplaceOpen } from "../lib/find-replace-dialog";
import { focusCueForEdit } from "../lib/focus-cue";
import { useShortcutLabel } from "../hooks/useShortcutLabel";

interface Props {
  open: boolean;
  onClose: () => void;
  onHighlightChange: (state: FindHighlightState) => void;
  project: Project;
  speakerFilter: string[];
  statusFilter: ReviewStatusFilter[];
}

function revealMatch(match: TextMatch, focus: boolean) {
  useProject.getState().selectCue(match.cueId);
  useProject.getState().selectSegment(match.segIndex);
  if (focus) {
    focusCueForEdit(match.cueId, {
      segIndex: match.segIndex,
      selStart: match.start,
      selEnd: match.end,
    });
  }
}

/** Docked find/replace bar above the cue list — subtitles stay visible below. */
export function FindReplaceDialog({
  open,
  onClose,
  onHighlightChange,
  project,
  speakerFilter,
  statusFilter,
}: Props) {
  const replaceSegmentTexts = useProject((s) => s.replaceSegmentTexts);
  const panelRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);

  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchFilteredOnly, setSearchFilteredOnly] = useState(false);
  /** -1 = typed a query but haven't navigated with Enter yet. */
  const [matchIndex, setMatchIndex] = useState(-1);
  const findReplaceLabel = useShortcutLabel("find-replace");

  const filtersActive = hasActiveFilters(speakerFilter, statusFilter);

  const searchCues = useMemo(() => {
    if (!searchFilteredOnly || !filtersActive) return project.cues;
    return project.cues.filter((cue) =>
      cueMatchesListFilters(cue, speakerFilter, statusFilter),
    );
  }, [
    project.cues,
    searchFilteredOnly,
    filtersActive,
    speakerFilter,
    statusFilter,
  ]);

  const matches = useMemo(
    () => findTextMatches(searchCues, findText, { caseSensitive }),
    [searchCues, findText, caseSensitive],
  );

  const replaceableMatches = useMemo(
    () => filterReplaceableMatches(matches, searchCues),
    [matches, searchCues],
  );

  const lockedMatchCount = matches.length - replaceableMatches.length;

  useEffect(() => {
    setFindReplaceOpen(open);
    return () => setFindReplaceOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFindText("");
    setReplaceText("");
    setCaseSensitive(false);
    setSearchFilteredOnly(false);
    setMatchIndex(-1);
    const id = requestAnimationFrame(() => findRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setMatchIndex(-1);
  }, [findText, caseSensitive, searchFilteredOnly]);

  useEffect(() => {
    if (!open || !findText) {
      onHighlightChange(INACTIVE_FIND_HIGHLIGHT);
      return;
    }
    onHighlightChange({
      active: true,
      matches,
      currentMatch: matchIndex >= 0 ? (matches[matchIndex] ?? null) : null,
    });
  }, [open, findText, matches, matchIndex, onHighlightChange]);

  const statusLine = useMemo(() => {
    if (!findText.trim()) return "Enter text to find";
    if (matches.length === 0) return "No matches";
    const lockedNote =
      lockedMatchCount > 0
        ? ` · ${lockedMatchCount} in reviewed cues (replace skipped)`
        : "";
    if (matchIndex < 0) {
      return `${matches.length} match${matches.length === 1 ? "" : "es"}${lockedNote}`;
    }
    return `${matchIndex + 1} of ${matches.length}${lockedNote}`;
  }, [findText, matches.length, matchIndex, lockedMatchCount]);

  const goToIndex = useCallback(
    (index: number, focus = true) => {
      if (matches.length === 0) return;
      const wrapped =
        ((index % matches.length) + matches.length) % matches.length;
      setMatchIndex(wrapped);
      revealMatch(matches[wrapped], focus);
    },
    [matches],
  );

  const goRelative = useCallback(
    (delta: number, focus = true) => {
      if (matches.length === 0) return;
      if (matchIndex < 0) {
        goToIndex(delta > 0 ? 0 : matches.length - 1, focus);
        return;
      }
      goToIndex(matchIndex + delta, focus);
    },
    [matches.length, matchIndex, goToIndex],
  );

  const replaceAll = useCallback(() => {
    if (replaceableMatches.length === 0) return;
    replaceSegmentTexts(
      buildReplaceAllUpdates(project.cues, replaceableMatches, replaceText),
    );
    setMatchIndex(-1);
  }, [replaceableMatches, project.cues, replaceText, replaceSegmentTexts]);

  // Enter / Shift+Enter navigate; Escape closes from anywhere while open.
  useEffect(() => {
    if (!open) return;

    function shouldHandleEnter(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return true;
      if (el.tagName === "BUTTON") return false;
      if (
        el instanceof HTMLInputElement &&
        (el.type === "checkbox" || el.type === "radio")
      ) {
        return false;
      }
      return true;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Enter" || !shouldHandleEnter(e.target)) return;
      if (e.isComposing) return;
      if (matches.length === 0) return;

      const fromPanel = panelRef.current?.contains(e.target as Node) ?? false;

      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        replaceAll();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) goRelative(-1, !fromPanel);
      else goRelative(1, !fromPanel);

      if (fromPanel) {
        requestAnimationFrame(() => findRef.current?.focus());
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, matches.length, goRelative, replaceAll, onClose]);

  const goCurrent = useCallback(() => {
    goToIndex(matchIndex < 0 ? 0 : matchIndex, true);
  }, [goToIndex, matchIndex]);

  const replaceCurrent = useCallback(() => {
    const index = matchIndex < 0 ? 0 : matchIndex;
    const match = matches[index];
    if (!match) return;
    const cue = project.cues.find((c) => c.id === match.cueId);
    if (!cue || isReviewedCueLocked(cue)) {
      goRelative(1);
      return;
    }
    const text = replaceMatchInText(
      cue.segments[match.segIndex].text,
      match,
      replaceText,
    );
    replaceSegmentTexts([
      { cueId: match.cueId, segIndex: match.segIndex, text },
    ]);
    goRelative(1);
  }, [
    matches,
    matchIndex,
    project.cues,
    replaceText,
    replaceSegmentTexts,
    goRelative,
  ]);

  if (!open) return null;

  const canAct = findText.length > 0 && matches.length > 0;
  const canReplace = findText.length > 0 && replaceableMatches.length > 0;

  return (
    <div
      ref={panelRef}
      className="find-replace-panel"
      role="search"
      aria-label="Find and replace"
    >
      <div className="find-replace-head">
        <span className="find-replace-title">Find &amp; replace</span>
        <span className="find-replace-status">{statusLine}</span>
        <button
          type="button"
          className="find-replace-close"
          onClick={onClose}
          title="Close"
          aria-label="Close find and replace"
        >
          Close
        </button>
      </div>

      <div className="find-replace-fields">
        <label className="find-replace-field">
          Find
          <input
            ref={findRef}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="find-replace-field">
          Replace
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="find-replace-foot">
        <div className="find-replace-options">
          <label>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Match case
          </label>
          {filtersActive && (
            <label>
              <input
                type="checkbox"
                checked={searchFilteredOnly}
                onChange={(e) => setSearchFilteredOnly(e.target.checked)}
              />
              Filtered cues only
            </label>
          )}
        </div>
        <div className="find-replace-actions">
          <button
            type="button"
            disabled={!canAct}
            onClick={() => goRelative(-1, false)}
          >
            Previous
          </button>
          <button type="button" disabled={!canAct} onClick={goCurrent}>
            Go to
          </button>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => goRelative(1, false)}
          >
            Next
          </button>
          <button type="button" disabled={!canReplace} onClick={replaceCurrent}>
            Replace
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canReplace}
            onClick={replaceAll}
          >
            Replace all
          </button>
        </div>
        <p className="find-replace-hint">
          <kbd>Enter</kbd> next · <kbd>Shift+Enter</kbd> previous ·{" "}
          <kbd>Esc</kbd> or <kbd>{findReplaceLabel}</kbd> close
        </p>
      </div>
    </div>
  );
}
