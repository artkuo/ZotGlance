/**
 * Pure matching logic for phase 2 type-to-select (PLAN.md, "Phase 2").
 *
 * No Zotero, toolkit or DOM imports, so it runs under `node --test`
 * (test/unit/matcher.test.ts is the contract).
 */

/** Lowercase and strip diacritics: "Müller" -> "muller". */
function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Typed text -> lowercase, diacritic-folded tokens, split on whitespace. */
export function tokenize(text: string): string[] {
  return fold(text).split(/\s+/).filter(Boolean);
}

/** A column's display text -> words of Unicode letters and digits. */
export function wordsFrom(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** True when tokens is non-empty and every token prefixes some word. */
export function rowMatches(
  tokens: readonly string[],
  words: readonly string[],
): boolean {
  if (tokens.length === 0) return false;
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

/**
 * Index of the next row matching tokens, or -1. Starts at `from` (treated as
 * 0 when out of range) and moves by `direction`, wrapping. When exclusive,
 * `from` is checked last, so a single match is still found. Each row is
 * checked at most once.
 */
export function findMatch(
  rowCount: number,
  getWords: (index: number) => readonly string[],
  tokens: readonly string[],
  from: number,
  direction: 1 | -1,
  inclusive: boolean,
): number {
  if (rowCount <= 0 || tokens.length === 0) return -1;
  const start = from >= 0 && from < rowCount ? from : 0;
  for (
    let step = inclusive ? 0 : 1;
    step < rowCount + (inclusive ? 0 : 1);
    step++
  ) {
    const index =
      (((start + direction * step) % rowCount) + rowCount) % rowCount;
    if (rowMatches(tokens, getWords(index))) return index;
  }
  return -1;
}
