# Handoff: delegation setup + M0 done (from a side session, 2026-11-23)

Work done in a forked side session after PLAN.md was finalised. Everything below is committed on `main` (the branch was renamed from `master`).

## What changed

- **M0 scaffold done and merged.** Command Code built it from `tasks/m0-scaffold.md`, copying tooling from `../zotquicksearch` and renaming it to zotQL (`zotql@artkuo.dev`, addonRef `zotql`, prefs `extensions.zotero.zotql`, AGPL-3.0). `onMainWindowLoad` only logs `zotQL loaded`, with `// M2: keyController` placeholders. Claude reviewed it.
- **`src/modules/matcher.ts` done** (part of M4's logic). It passes the contract tests in `test/unit/matcher.test.ts`. It's pure: `tokenize`, `wordsFrom`, `rowMatches`, `findMatch`. `tasks/matcher.md` no longer needs running.
- Checks all pass: `npm run build`, `npm run test:unit` (Node's built-in runner, 16 tests, no Zotero needed) and `npm run lint:check`.
- `AGENTS.md` holds the shared rules for every agent. `CLAUDE.md` imports it.

## Delegation workflow (Claude orchestrates; Command Code writes code)

- `scripts/delegate.sh <task> [base] [model]` runs `commandcode -p` on `tasks/<task>.md` in the worktree `../zotQL-worktrees/<task>` on branch `task/<task>`. It then runs the build and unit tests and commits on that branch. It prints only a short report; the full log goes to `.delegate-logs/` (git-ignored).
- The user runs it as `DELEGATE_PERMISSION=yolo scripts/delegate.sh <task>`. They also added a permission rule in `.claude/settings.local.json` (git-ignored) that allows exactly that command prefix.
- Gotcha: in headless mode, Command Code needs **both** `--tools-all` and the literal `--yolo` flag. `--permission-mode yolo` is ignored. The script handles this.
- Pattern: Claude writes the task spec and contract tests, delegates, reviews only the summary, the diff stat and the key files, then fast-forward merges and removes the worktree.
- Delegate: well-specified, testable work (pure modules, CSS, settings pane, README, release workflow). Keep with Claude: anything touching Zotero internals (M1, `keyController`, focus handling, debugging in Zotero) and final review.
- Default model is Command Code's default (DeepSeek V4.1 Flash). Override with the third argument.
- `.commandcode/` is Command Code's local taste data and is git-ignored. Don't let it copy `~/.claude`.

## Next steps

1. **Finish M0's dev loop (Claude):** create a separate Zotero dev profile, `zotql-dev`, using a test library, never the real `/Users/artkuo/Zotero`. Write `.env` from `.env.example` (Zotero binary `/Applications/Zotero.app/Contents/MacOS/zotero`), and check that `npm start` hot-reloads and logs `zotQL loaded`.
2. **M1 test build (Claude):** confirm the four assumptions in PLAN.md and record the results in `NOTES.md`.
3. Then M2 onwards. Delegate `keyState.ts` and `itemCard.ts` by writing contract tests first, the same way as the matcher.

## Update 2026-11-23 (main session): steps 1–2 done

- **Dev loop works:** a separate profile and data folder in `~/Zotero-dev/zotql`, on port 23129. Hot reload has been tested. `.env`'s kill command targets only the dev profile, because the scaffold default would `kill -9` the real Zotero. Tested: the real Zotero survived.
- **Dev eval bridge** (approved by the user): `scripts/zq-eval.sh` runs JS in the dev Zotero. The test library is seeded by `scripts/dev/seed.js`, which created 38 rows.
- **M1:** all four assumptions are confirmed. Details and the M2 implications are in `NOTES.md`. Still to check by hand: a real ⌥Space keypress (`e.key` is `" "`), and how the card looks on screen. The dev window was hidden during the tests, which pauses animation frames.

### Next steps now

1. **Delegate `keyState.ts`.** Write `test/unit/keyState.test.ts` as the contract (the key table in PLAN.md, covering phase 1 rows plus the type-to-select timer edges) and `tasks/keyState.md`, then run `scripts/delegate.sh keyState`.
2. **Delegate the mapping part of `itemCard.ts`** the same way. Use plain-object fixtures that mirror `scripts/dev/seed.js`, with no Zotero import.
3. **Claude, in parallel:** write `keyController.ts` (listener on `#item-tree-main-default`, focus check) and `quickLook.ts` (fixed overlay centred on `#zotero-layout-switcher`, `itemsView.onSelect`), then wire them in `hooks.ts` and check them in the dev instance with the window visible.
