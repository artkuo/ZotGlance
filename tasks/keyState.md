# Implement `src/modules/keyState.ts`

The pure state machine behind the key table in PLAN.md ("Key handling"). `keyController.ts`, written separately, calls it on every `keydown` while the items list has focus and carries out the effects it returns. The contract is `test/unit/keyState.test.ts`. **Do not edit that test file.** Make it pass.

This module must not import Zotero, the toolkit or DOM globals. It runs under `node --test`.

## API

```ts
export interface KeyInput {
  key: string; // KeyboardEvent.key
  code: string; // KeyboardEvent.code
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface KeyOptions {
  typeSelect: boolean; // phase 2 type-to-select on (false = leave typing to Zotero)
  timeoutMs: number; // typing ends this long after the last typed key (default 1500)
  cmdY: boolean; // ⌘Y toggles the card
}

export interface KeyContext {
  /** Zotero's own type-to-select is mid-word (only used when typeSelect is false). */
  builtinTyping?: boolean;
}

export interface KeyState {
  cardOpen: boolean;
  typed: string; // current typed text ("" when not typing)
  typedAt: number; // time of the last typed key, ms
  lastQuery: string; // last non-empty typed text, kept after typing ends (for ⌘G)
}

export type Effect =
  | { type: "openCard" }
  | { type: "closeCard" }
  | { type: "typed"; text: string } // typed text changed: show indicator, jump to first match from the focused row (inclusive)
  | { type: "endTyping" } // hide indicator
  | { type: "findNext"; text: string; direction: 1 | -1 } // jump to next/prev match (exclusive of focused row)
  | { type: "openAttachment" } // open the card item's first attachment
  | { type: "scrollCard"; direction: 1 | -1 }; // page the card's abstract

export interface KeyResult {
  state: KeyState;
  handled: boolean; // true -> controller calls preventDefault() + stopPropagation()
  effects: Effect[]; // in order
}

export const DEFAULT_OPTIONS: KeyOptions; // { typeSelect: true, timeoutMs: 1500, cmdY: true }
export const INITIAL_STATE: KeyState; // { cardOpen: false, typed: "", typedAt: 0, lastQuery: "" }

/** Typing is active when typed !== "" and now - typedAt < timeoutMs. */
export function isTyping(
  state: KeyState,
  now: number,
  options: KeyOptions,
): boolean;

export function reduceKey(
  state: KeyState,
  input: KeyInput,
  now: number,
  options: KeyOptions,
  context?: KeyContext,
): KeyResult;
```

`reduceKey` must not mutate `state`. It returns a new object whenever anything changes.

## Behaviour

"Typing" means `isTyping(state, now, options)`. If typed text has timed out, treat it as not typing. The returned state then has `typed: ""`, but `lastQuery` is kept. **Ending typing** means: set `typed` to `""`, keep `lastQuery`, and add the `endTyping` effect, but only if typing was active. Stale text that timed out ends silently.

Rules, checked in this order (the first match wins):

1. **Modifier-only keys** (`key` is `Shift`, `Alt`, `Meta`, `Control`, `CapsLock` or `OS`): not handled, no effects, state unchanged. They must not end typing.
2. **⌥Space** (`code === "Space"` and `altKey`; ignore `key`, which is `" "` on macOS): end typing, then toggle the card (`openCard` if closed, `closeCard` if open). Handled.
3. **⇧Space** (`code === "Space"`, `shiftKey`, no alt/meta/ctrl): if typing, it's a text space, as in rule 4. Otherwise, if the card is open: `scrollCard` with direction 1, handled. Otherwise not handled.
4. **Space** (`code === "Space"`, no alt/meta/ctrl):
   - If `typeSelect` and typing: append `" "` to `typed`, update `typedAt` and `lastQuery`, and add a `typed` effect. Handled.
   - If not `typeSelect` and `context.builtinTyping`: not handled, so Zotero adds the space to its own typed text.
   - Otherwise: toggle the card. Handled.
5. **⌘Y** (`metaKey`, `key.toLowerCase() === "y"`, no ctrl/alt): if `!options.cmdY`, not handled. Otherwise end typing and toggle the card. Handled.
6. **⌘G / ⇧⌘G** (`metaKey`, `key.toLowerCase() === "g"`): only if `typeSelect` and `lastQuery !== ""`. Restart typing with `typed = lastQuery` and `typedAt = now`, and add `{ type: "findNext", text: lastQuery, direction: shiftKey ? -1 : 1 }`. Handled. Otherwise not handled.
7. **⌘↓** (`metaKey`, `key === "ArrowDown"`): if the card is open, end typing, then `openAttachment` and `closeCard`, and set `cardOpen` false. Handled. Otherwise not handled.
8. **Escape:** if typing, end typing, handled (the card stays open). Else if the card is open, `closeCard`, handled. Else not handled.
9. **Enter:** if typing, end typing; if the card is closed, also `openCard`. Handled. Otherwise not handled; Zotero opens the item.
10. **PageDown / PageUp** while the card is open: `scrollCard` with 1 or -1. Handled. This doesn't end typing. When the card is closed, apply rule 13.
11. **Backspace** while typing: remove the last character. If text is left, update `typedAt` and add a `typed` effect. If it becomes empty, end typing. Handled either way. When not typing, apply rule 13.
12. **A printable character** (`key.length === 1`, no meta/ctrl/alt; shift is allowed) when `typeSelect`:
    - If typing, append `key`. Otherwise start fresh with `typed = key`.
    - Set `typedAt = now` and `lastQuery = typed`, and add `{ type: "typed", text: typed }`. Handled.
    - When `typeSelect` is false, apply rule 13, so Zotero's own type-to-select runs.
13. **Anything else:** end typing if typing. Not handled (arrows, +, −, Tab and so on still reach Zotero). The card state is unchanged; the card follows the selection on its own.

`openCard` sets `cardOpen` to true and `closeCard` sets it to false. Never add `openCard` when the card is already open, or `closeCard` when it's already closed.

Add a short doc comment at the top of the file: it is pure, why it is pure (unit-tested under `node --test`), and that PLAN.md's key table is the specification.

## Checks that must pass

- `npm run test:unit`
- `npm run build`
- `npm run lint:check` (run `npm run lint:fix` first if needed)
