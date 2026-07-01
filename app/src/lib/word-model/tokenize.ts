/** Tokenize text into maximal non-whitespace runs (Unicode `\S+`). */
export function tokenize(text: string): string[] {
  if (!text.trim()) return [];
  return text.match(/\S+/gu) ?? [];
}

/**
 * Parse editable shot-range text into tokens and line-break anchors.
 * Each `\n` becomes a break after the last word on that line.
 */
export function parseEditableText(text: string): {
  tokens: string[];
  lineBreakAfterWordIndices: number[];
} {
  if (!text.includes("\n")) {
    return { tokens: tokenize(text), lineBreakAfterWordIndices: [] };
  }

  const lines = text.split("\n");
  const tokens: string[] = [];
  const lineBreakAfterWordIndices: number[] = [];
  let lastWordIndex = -1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineTokens = tokenize(lines[lineIndex]);
    for (const token of lineTokens) {
      tokens.push(token);
      lastWordIndex++;
    }
    if (lineIndex < lines.length - 1 && lastWordIndex >= 0) {
      lineBreakAfterWordIndices.push(lastWordIndex);
    }
  }

  return { tokens, lineBreakAfterWordIndices };
}

/** Join tokens with a single space for display within a shot range. */
export function joinTokens(tokens: string[]): string {
  return tokens.join(" ");
}
