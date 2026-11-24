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

## Update 2026-11-23 (later): M2 done

- Contracts → Command Code → review → merge worked for both tasks.
  - `keyState`: 25/25 tests. One fix on merge: Backspace now updates `lastQuery`.
  - `itemCard`: 16/16 tests. One fix on merge: `&amp;` is now decoded last.
  - Command Code's worktrees have no `node_modules`, so it can't run build or lint itself; `delegate.sh` runs them afterwards. Run `npm run lint:fix` after merging, because Prettier formatting isn't applied inside the worktree.
- `keyController.ts`, `quickLook.ts` and `quicklook.css` are written and checked in the dev instance. See NOTES.md "M2 results".

### Next steps now

1. **M3 polish (Claude):**
   - Fix the M3 notes in NOTES.md: show a highlighted note even past `MAX_NOTES`, note order, card size.
   - Check the fade and a real ⌥Space keypress in a visible window.
   - Decide focus edge cases (PLAN.md, "Risks").
2. **M4:** `matcher.ts` is already done, except tier 2 (letter/digit split, PLAN.md “Tiered matching”, decided 2026-11-23). Write its contract tests and a `tasks/matcher-tiers.md`, then delegate it.
   - Write `typeSelect.ts` (Claude): the indicator, the index cache over shown columns using `_getColumns()` and `getCellText`, with every creator surname for the Creator column.
   - Wire the `typed`, `endTyping` and `findNext` effects in `keyController`, and turn the `typeSelect` pref on by default.
   - The indicator's CSS could be delegated.

## Update 2026-11-23 (night): delegate installs first

`delegate.sh` now runs `npm install` in the worktree before starting Command Code, so the agent can run build and lint itself. npm's output goes to `.delegate-logs/<task>.install.log`, and the script stops with an error if the install fails. Before this, the install ran only after the agent had finished, and its output was discarded.

## Update 2026-11-23 (evening): M3 done

See NOTES.md "M3 results". The delegated highlighted-note change merged cleanly (60/60 tests). That worktree's `npm install` didn't run, so `delegate.sh` reported a build failure. That only reflects the worktree; the build passes on main.

### Next steps now

1. **You, by hand:** a physical ⌥Space keypress, and how the fade feels in your real Zotero. Install a dev build, or run `npm start` and use the dev window.
2. **M4, type-to-select:**
   - Delegate tier 2 of the matcher: write its contract tests and `tasks/matcher-tiers.md`.
   - Claude writes `typeSelect.ts`: the indicator, and the index over shown columns using `_getColumns()` and `getCellText`, with every creator surname.
   - Wire the `typed`, `endTyping` and `findNext` effects in `keyController`, then turn the `typeSelect` pref on.

## Update 2026-11-23 (night): M4 done

- Tier 2 of the matcher was delegated against `test/unit/matcherTiers.test.ts`. With `delegate.sh` now installing first, Command Code ran build, tests and lint itself, and the merge was clean (73/73).
- `typeSelect.ts` (Claude): the indicator, the word index over shown columns with every creator surname, and ⌘G. The `typed`, `endTyping` and `findNext` effects are wired in `keyController`, and the `typeSelect` pref is on by default. See NOTES.md "M4 results".

### Next steps now

1. **You, by hand:** ⌥Space and the fade (from M3), and type-to-select in a real-sized library, to check the first-keystroke delay.
2. **M5:** settings pane (type-to-select on/off, matched columns, timeout, ⌘Y), README, release workflow, plugin-list submission. Mostly delegable.

## Update 2026-11-23 (late): settings pane, resizable card

The user tested M4 in their real Zotero ("works very well") and asked for abstract font and size settings and a resizable card. Done: see NOTES.md "Settings pane and resizable card". The pane also has ⌘Y, type-to-select on/off and the typing timeout.

### Next steps now

1. **M5, the rest:** a choice of matched columns (currently always the shown columns), icons (the manifest points at missing files), README, release workflow, plugin-list submission.
2. **You, by hand:** ⌥Space, the fade, and first-keystroke speed in a large library.

## Update 2026-11-23 (late night): M5 code done

- Matched-columns setting, icon, README with screenshots (`docs/`), manifest versions, CI unit-test job. LICENSE (AGPL-3.0) and the release workflow were already in place from M0. See NOTES.md "M5".
- The git history was scanned: there are no secrets, `.env` was never committed, and there's no personal email.

### Next steps now (need the user's go-ahead: outward-facing)

1. Create the public GitHub repo `artkuo/zotQL` and push `main`.
2. Tag `v0.1.0` and push the tag. The release workflow builds and publishes `zot-ql.xpi` and `update.json`.
3. The user installs the release `.xpi` in their real Zotero.
4. Submit to Zotero's plugin list (zotero.org/support/plugins): check the current submission instructions first.

## Update 2026-11-24: public on GitHub

- Before publishing: the `?` help card was added, and `+`/`-` now reach Zotero again. See NOTES.md.
- https://github.com/artkuo/zotQL is public (AGPL-3.0, detected by GitHub). `main` is pushed, and the first CI run passed: lint, unit, build.

### Next steps now

1. **Release (needs the user's OK):** `npm run release` bumps the version, tags and pushes. The tag triggers `release.yml`, which publishes `zot-ql.xpi` and `update.json`. Start at v0.1.0.
2. The user installs the release `.xpi` in their real Zotero.
3. Submit to Zotero's plugin list (zotero.org/support/plugins). Check the current instructions first.
