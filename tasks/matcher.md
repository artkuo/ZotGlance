# Implement `src/modules/matcher.ts`

The pure matching logic for phase 2 type-to-select (PLAN.md, "Phase 2"). The contract is `test/unit/matcher.test.ts`. **Do not edit that test file.** Make it pass.

## API (exported, all pure, no Zotero/DOM imports)

```ts
/** Typed text -> lowercase, diacritic-folded tokens, split on whitespace. */
export function tokenize(text: string): string[];

/** A column's display text -> lowercase, diacritic-folded words.
 *  Split on anything that is not a Unicode letter or digit. */
export function wordsFrom(text: string): string[];

/** True when tokens is non-empty and every token is a prefix of at least
 *  one word. Order doesn't matter; one word may satisfy several tokens. */
export function rowMatches(
  tokens: readonly string[],
  words: readonly string[],
): boolean;

/** Index of the next row matching tokens, or -1.
 *  Starts at `from` (clamped/treated as 0 if out of range) and moves by
 *  `direction` (1 or -1), wrapping. `inclusive` decides whether `from`
 *  itself is checked first; when exclusive, `from` is checked last (so a
 *  single match is still found). Each row is checked at most once. */
export function findMatch(
  rowCount: number,
  getWords: (index: number) => readonly string[],
  tokens: readonly string[],
  from: number,
  direction: 1 | -1,
  inclusive: boolean,
): number;
```

Diacritic folding: `normalize("NFD")` and remove combining marks (`\p{M}`). Use Unicode property escapes (`\p{L}`, `\p{N}`) with the `u` flag.

Add a short doc comment at the top of the file saying it is pure and why (it's unit-tested under `node --test`).

## Checks that must pass

- `npm run test:unit`
- `npm run build`
- `npm run lint:check` (run `npm run lint:fix` first if needed)
