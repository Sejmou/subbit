import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { findActiveCueIndex } from "../lib/active-cue";
import { findOverlappingCueIds } from "../lib/cue-overlap";
import {
  hasActiveFilters,
  listFilteredCueEntries,
  type ReviewStatusFilter,
} from "../lib/cue-filters";
import { useShortcutLabel } from "../hooks/useShortcutLabel";
import { focusCueForEdit, type FocusCueDetail } from "../lib/focus-cue";
import {
  indexMatchesBySegment,
  type FindHighlightState,
  INACTIVE_FIND_HIGHLIGHT,
} from "../lib/find-highlight";
import { CueRow, type BracketKind } from "./CueRow";

/** 0 → "a", 1 → "b", … 26 → "aa" (spreadsheet-style). */
function runLetter(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface Props {
  project: Project;
  speakerFilter?: string[];
  statusFilter?: ReviewStatusFilter[];
  shotFilter?: string[];
  findHighlight?: FindHighlightState;
}

export function CueList({
  project,
  speakerFilter = [],
  statusFilter = [],
  shotFilter = [],
  findHighlight = INACTIVE_FIND_HIGHLIGHT,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedCueId = useProject((s) => s.selectedCueId);
  const insertCueAtPlayhead = useProject((s) => s.insertCueAtPlayhead);
  const currentTime = usePlayback((s) => s.currentTime);
  const insertCueLabel = useShortcutLabel("insert-cue");
  const [activeIndex, setActiveIndex] = useState(-1);
  const isEmpty = project.cues.length === 0;

  const entries = useMemo(
    () =>
      listFilteredCueEntries(
        project.cues,
        speakerFilter,
        statusFilter,
        shotFilter,
      ),
    [project.cues, speakerFilter, statusFilter, shotFilter],
  );

  const filterActive = hasActiveFilters(
    speakerFilter,
    statusFilter,
    shotFilter,
  );
  const filteredEmpty = filterActive && entries.length === 0;

  const segmentMatchIndex = useMemo(
    () => indexMatchesBySegment(findHighlight.matches),
    [findHighlight.matches],
  );

  const overlappingCueIds = useMemo(
    () => findOverlappingCueIds(project.cues),
    [project.cues],
  );

  // Group labels: a group is a head cue plus cues joined to it. Lone cue → "3";
  // joined cues → "1a"/"1b"/… Labels are derived from the FULL cue list, so
  // they stay stable no matter how the list is filtered.
  const runLabels = useMemo(() => {
    const map = new Map<string, string>();
    const cues = project.cues;
    let groupNumber = 0;
    let letterIndex = 0;
    for (let i = 0; i < cues.length; i++) {
      const isHead = i === 0 || !cues[i].joinedToPrev;
      if (isHead) {
        groupNumber++;
        letterIndex = 0;
      } else {
        letterIndex++;
      }
      const grouped = isHead ? (cues[i + 1]?.joinedToPrev ?? false) : true;
      map.set(
        cues[i].id,
        grouped
          ? `${groupNumber}${runLetter(letterIndex)}`
          : String(groupNumber),
      );
    }
    return map;
  }, [project.cues]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
    // Key the measurement cache by cue id, not list index: moving a cue
    // reorders project.cues (normalizeCueOrder), so an index-keyed cache would
    // keep a stale row height when a different cue lands at that index.
    getItemKey: (index) => entries[index].cue.id,
  });

  // Track the active cue from the playhead without re-rendering every frame.
  useEffect(() => {
    if (isEmpty) return;
    let last = -1;
    return usePlayback.subscribe((state) => {
      const idx = findActiveCueIndex(project.cues, state.currentTime);
      if (idx !== last) {
        last = idx;
        setActiveIndex(idx);
      }
    });
  }, [project.cues, isEmpty]);

  // Keep the selected cue visible during keyboard navigation.
  useEffect(() => {
    if (isEmpty || filteredEmpty) return;
    const idx = entries.findIndex(({ cue }) => cue.id === selectedCueId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedCueId, entries, virtualizer, isEmpty, filteredEmpty]);

  // Scroll (optional align) then focus — used by timeline double-click, shortcuts, etc.
  useEffect(() => {
    if (isEmpty || filteredEmpty) return;

    function onFocusCue(e: Event) {
      const detail = (e as CustomEvent<FocusCueDetail>).detail;
      const idx = entries.findIndex(({ cue }) => cue.id === detail.cueId);
      if (idx < 0) return;

      virtualizer.scrollToIndex(idx, { align: detail.scroll });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("subbit:edit", { detail }));
        });
      });
    }

    window.addEventListener("subbit:focus-cue", onFocusCue);
    return () => window.removeEventListener("subbit:focus-cue", onFocusCue);
  }, [entries, virtualizer, isEmpty, filteredEmpty]);

  if (isEmpty) {
    return (
      <div className="cue-list cue-list--empty">
        <p>No subtitles yet.</p>
        <p className="hint">
          Press <kbd>{insertCueLabel}</kbd> to add a cue at the playhead.
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const id = insertCueAtPlayhead(currentTime);
            if (id) focusCueForEdit(id);
          }}
        >
          Add cue at playhead
        </button>
      </div>
    );
  }

  if (filteredEmpty) {
    return (
      <div className="cue-list cue-list--empty">
        <p>No cues match the current filters.</p>
        <p className="hint">
          Use the Filters menu in the toolbar or click Reset to show all cues.
        </p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div className="cue-list" ref={parentRef}>
      {filterActive && (
        <div className="cue-list-filter-bar">
          Showing {entries.length} of {project.cues.length} cues
        </div>
      )}
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {items.map((item) => {
          const { cue, index } = entries[item.index];
          const label = runLabels.get(cue.id) ?? String(index + 1);
          // Bracket segment from the VISIBLE neighbours: connect only to a
          // group member that is both adjacent in the full list and on screen.
          const prev = entries[item.index - 1];
          const next = entries[item.index + 1];
          // The join toggle only makes sense when the row directly above is the
          // TRUE predecessor (adjacent in the full list, not hidden by a filter).
          const adjacentPrevVisible = !!prev && prev.index === index - 1;
          const joinAbove = adjacentPrevVisible && !!cue.joinedToPrev;
          const joinBelow =
            !!next && next.index === index + 1 && !!next.cue.joinedToPrev;
          const bracket: BracketKind =
            joinAbove && joinBelow
              ? "mid"
              : joinBelow
                ? "top"
                : joinAbove
                  ? "bottom"
                  : "none";
          return (
            <div
              key={cue.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
              }}
            >
              <CueRow
                cue={cue}
                index={index}
                project={project}
                selected={cue.id === selectedCueId}
                active={index === activeIndex}
                runLabel={label}
                bracket={bracket}
                canToggleJoinPrev={adjacentPrevVisible}
                overlapping={overlappingCueIds.has(cue.id)}
                findHighlight={findHighlight}
                segmentMatchIndex={segmentMatchIndex}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
