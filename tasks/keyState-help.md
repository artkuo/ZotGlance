# "?" help card and punctuation keys in `src/modules/keyState.ts`

Two changes to the pure key state machine. The contract is `test/unit/keyHelp.test.ts`, plus the updated "defaults" test in `test/unit/keyState.test.ts`. **Do not edit either test file.** All tests in `test/unit/` must pass.

## 1. Help card

- Add `helpOpen: boolean` to `KeyState` (`false` in `INITIAL_STATE`).
- Add two effects: `{ type: "openHelp" }` and `{ type: "closeHelp" }`.
- **While help is open** (checked right after the modifier-only rule, so Shift etc. leave it open):
  - `?`, Esc, or Space with or without ⇧/⌥ (`code === "Space"`) → `closeHelp`, handled, nothing else.
  - Any other key → emit `closeHelp`, set `helpOpen: false`, then handle the key exactly as if help had been closed. Its effects follow `closeHelp`.
- **`?` opens help** (`key === "?"`, no ⌘/⌃/⌥; ⇧ is fine) when not typing:
  - With typeSelect on: "not typing" means `!isTyping(...)`. Stale timed-out text is cleared silently (`typed: ""`, `typedAt: 0`, keep `lastQuery`), as rule 13 does today.
  - With typeSelect off: when `context.builtinTyping` is not true. If it is true, `?` is not handled (Zotero's own typing gets it).
  - If the card is open, emit `closeCard` first. Then `openHelp`, and set `helpOpen: true`. Handled.
- While typing (typeSelect on and active), `?` is typed text, as now.

## 2. Punctuation when not typing

With typeSelect on and not typing, a printable key (`key.length === 1`, no ⌘/⌃/⌥) that isn't a letter or digit (`!/[\p{L}\p{N}]/u.test(key)`) no longer starts typing:

- `+` and `-` → not handled, no effects, so Zotero gets them (expand all / collapse all). Clear stale typed text silently.
- `?` → help (above).
- Any other → handled (swallowed), no effects. Clear stale typed text silently.

Space keeps its own rules, which come earlier. While typing, every printable key is still typed text. With typeSelect off, nothing changes except `?`.

Update the rule comments in `keyState.ts` to match. Keep the module pure.

## Checks that must pass

- `npm run test:unit`
- `npm run build` (the build will report `keyController.ts` not handling the new effects only if its `switch` is exhaustive; if so, add `case "openHelp": case "closeHelp": break;` there with a `// help card: orchestrator` comment and nothing else)
- `npm run lint:check` (run `npm run lint:fix` first if needed)
