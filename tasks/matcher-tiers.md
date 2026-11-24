# Tiered matching in `src/modules/matcher.ts`

Type-to-select should not need a space where letters meet digits: typing "jones2006" should find a row with Jones in the Creator column and 2006 in the Year column. PLAN.md, "Phase 2" → "Tiered matching", is the design. Read it.

The contract is `test/unit/matcherTiers.test.ts`. **Do not edit it** or `test/unit/matcher.test.ts`. Both must pass. Don't change the behaviour of the existing exports (`tokenize`, `wordsFrom`, `rowMatches`, `findMatch`).

## Add three exports

```ts
/** One token -> runs of letters and runs of digits; anything else separates and is dropped. */
export function splitLetterDigit(token: string): string[];

/**
 * Typed text -> tiers of tokens, strictest first.
 * tiers[0] = tokenize(text) (tier 1, "as typed").
 * tiers[1] = every tier-1 token passed through splitLetterDigit, flattened
 *            (tier 2), included only when it is non-empty and differs from tier 1.
 * No tokens -> [].
 */
export function tierTokens(text: string): string[][];

/**
 * Try each tier in order over the whole list with findMatch (same from,
 * direction, inclusive). Return the first tier that matches any row:
 * { index, tier } where tier is the index into tiers. None -> { index: -1, tier: -1 }.
 */
export function findTieredMatch(
  rowCount: number,
  getWords: (index: number) => readonly string[],
  tiers: readonly (readonly string[])[],
  from: number,
  direction: 1 | -1,
  inclusive: boolean,
): { index: number; tier: number };
```

Letters are Unicode letters (`\p{L}`), digits are Unicode numbers (`\p{N}`). Input to `splitLetterDigit` is already lowercase and folded (it comes from `tokenize`).

There is deliberately **no** "any split" tier (e.g. "kuowalk" → "kuo" + "walk"). Don't add one.

Keep the module pure: no Zotero, toolkit or DOM imports. Keep the doc comments short.

## Checks that must pass

- `npm run test:unit`
- `npm run build`
- `npm run lint:check` (run `npm run lint:fix` first if needed)
