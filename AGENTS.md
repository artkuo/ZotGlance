# ZotGlance — instructions for coding agents

Read by every agent working here (Claude Code via CLAUDE.md, Command Code and others directly).

## Project

A Zotero 10 plugin that changes how the items list behaves when it has keyboard focus: Space opens a Quick Look card, and type-to-select matches any shown column. **PLAN.md is the design; follow it.** It is not a search tool.

## Stack

zotero-plugin-template layout: TypeScript, esbuild via zotero-plugin-scaffold, zotero-plugin-toolkit. `../zotquicksearch` is the template to copy tooling from. **Never modify `../zotquicksearch`**, only read it.

## Commands

- `npm run build`: bundle + `tsc --noEmit`. Must pass.
- `npm run test:unit`: pure-logic tests in `test/unit/*.test.ts`, run by Node's built-in test runner (`node --test`, Node 24 strips TS types). No Zotero needed.
- `npm run lint:check`: prettier + eslint.
- `npm start`: hot-reload into the dev profile (needs `.env`; humans/Claude only). It never touches the real Zotero library.
- `scripts/zq-eval.sh '<js>'`: run JS in the running dev Zotero and get JSON back (humans/Claude only). `scripts/dev/seed.js` seeds the test library and `scripts/dev/keyhelpers.js` sends trusted key events. See NOTES.md.
- NOTES.md records how Zotero 10 actually behaves (DOM ids, APIs, gotchas). Read it before touching Zotero internals.

## Rules

- Pure modules (`src/modules/matcher.ts`, `keyState.ts`, `itemCard.ts`'s mapping logic) must not import Zotero, toolkit or DOM globals, so they run under `node --test`. Use relative imports with the `.ts` extension in tests.
- Don't edit files in `test/unit/` that you were given as a contract. If you believe a contract test is wrong, stop and say so in your summary instead.
- Do only what your task asks. If a check fails because of a contract test for a _different_ task (e.g. `matcher.test.ts` during scaffolding), report it in your summary instead of implementing that other task.
- Keep dependencies minimal; ask (in the summary) before adding any runtime dependency.
- Prettier style: 2 spaces, LF, print width 80.
- Never commit `.env`, profiles, or anything from the user's Zotero data directory.
- Finish every task by printing a short summary: files changed, decisions made, anything unresolved.
