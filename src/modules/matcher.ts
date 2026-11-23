export function tokenize(text: string): string[] {
  const normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.trim().split(/\s+/).filter(Boolean);
}

export function wordsFrom(text: string): string[] {
  const normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const matches = normalized.match(/[\p{L}\p{N}]+/gu);
  return matches ?? [];
}

export function rowMatches(tokens: string[], words: string[]): boolean {
  if (tokens.length === 0) return false;
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

export function findMatch(
  rowCount: number,
  getWords: (i: number) => string[],
  tokens: string[],
  from: number,
  direction: 1 | -1,
  inclusive: boolean,
): number {
  if (rowCount <= 0 || tokens.length === 0) return -1;
  let start = from;
  if (start < 0) start = 0;
  if (start >= rowCount) start = 0;
  const steps = rowCount;
  for (let step = inclusive ? 0 : 1; step <= steps; step++) {
    const idx = (((start + direction * step) % rowCount) + rowCount) % rowCount;
    if (rowMatches(tokens, getWords(idx))) return idx;
  }
  return -1;
}
