# Always show the highlighted note in `buildCard` (`src/modules/itemCard.ts`)

When the user's selected row is a child note, the card shows the parent with that note highlighted (`item.highlightId`). Today, if that note is the 4th non-empty note or later, it's hidden behind "+N more". Change `buildCard` so the highlighted note is always visible.

The contract is the "M3: a highlighted note is always shown" tests at the end of `test/unit/itemCard.test.ts`. **Do not edit that test file.** All tests in it must pass, the earlier ones included.

## Rule

- Notes with an empty first line are skipped, exactly as now.
- If `highlightId` is the id of a non-empty note that isn't among the first `MAX_NOTES` non-empty notes:
  - Show the first `MAX_NOTES - 1` non-empty notes, then the highlighted note.
  - `moreNotes` stays `(number of non-empty notes) - MAX_NOTES`.
- Otherwise nothing changes: a highlighted note that's already shown, an empty one, or an id that isn't a note.

Change only `src/modules/itemCard.ts`. Keep it pure.

## Checks that must pass

- `npm run test:unit`
- `npm run build`
- `npm run lint:check` (run `npm run lint:fix` first if needed)
