import type { Cue } from "../../types";
import { MAX_CPS, MIN_PARSE_S } from "./constants";
import { cueReadableCharCount } from "./render";
import { epsilon } from "./timing";

export type CueValidationIssue =
  | { kind: "cue_cps_high"; cps: number; minDuration: number }
  | { kind: "word_outside_cue"; wordIndex: number }
  | { kind: "word_overlap"; wordIndex: number };

/**
 * Issue kinds detected by {@link detectCueValidationIssues} but hidden from the
 * cue-row badge until v2 (see `app/docs/word-model.md` — Validation TODO).
 */
export const SUPPRESSED_VALIDATION_ISSUES = new Set<CueValidationIssue["kind"]>(
  ["word_overlap"],
);

/** Minimum cue duration needed to read all tokens at a comfortable rate. */
export function requiredCueDuration(charCount: number): number {
  if (charCount <= 0) return 0;
  return Math.max(MIN_PARSE_S, charCount / MAX_CPS);
}

/** Run all validation checks (including suppressed kinds). */
export function detectCueValidationIssues(cue: Cue): CueValidationIssue[] {
  const issues: CueValidationIssue[] = [];
  const eps = epsilon();
  const cueSeconds = cue.end - cue.start;
  const charCount = cueReadableCharCount(cue);

  if (charCount > 0 && cueSeconds > 0) {
    const minDuration = requiredCueDuration(charCount);
    if (cueSeconds < minDuration - 1e-9) {
      issues.push({
        kind: "cue_cps_high",
        cps: charCount / cueSeconds,
        minDuration,
      });
    }
  }

  for (let i = 0; i < cue.words.length; i++) {
    const w = cue.words[i];
    if (w.start < cue.start - eps || w.end > cue.end + eps) {
      issues.push({ kind: "word_outside_cue", wordIndex: i });
    }
    if (i > 0 && cue.words[i - 1].end > w.start + eps) {
      issues.push({ kind: "word_overlap", wordIndex: i });
    }
  }

  return issues;
}

/** Issues shown in the UI (excludes {@link SUPPRESSED_VALIDATION_ISSUES}). */
export function validateCue(cue: Cue): CueValidationIssue[] {
  return detectCueValidationIssues(cue).filter(
    (issue) => !SUPPRESSED_VALIDATION_ISSUES.has(issue.kind),
  );
}

export function formatCueValidationTooltip(
  issues: CueValidationIssue[],
): string {
  if (issues.length === 0) return "";
  const lines: string[] = [];
  for (const issue of issues) {
    switch (issue.kind) {
      case "cue_cps_high":
        lines.push(
          `Cue may be too short to read (${issue.cps.toFixed(1)} characters per second, need ≤ ${MAX_CPS} characters per second — lengthen In/Out to at least ${issue.minDuration.toFixed(2)}s or shorten text).`,
        );
        break;
      case "word_outside_cue":
        lines.push(`Word timing outside cue In/Out.`);
        break;
      case "word_overlap":
        lines.push(`Word timings overlap.`);
        break;
    }
  }
  return lines.join("\n");
}

export function cueHasValidationIssues(cue: Cue): boolean {
  return validateCue(cue).length > 0;
}

/** @deprecated use validateCue — kept for tests referencing MIN_PARSE_S */
export { MIN_PARSE_S, MAX_CPS };
