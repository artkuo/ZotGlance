# M0 — scaffold the plugin

Set up this repo as a Zotero plugin by copying tooling from `../zotquicksearch` (read only — never modify it). See PLAN.md "Architecture" and "M0".

## Do
1. Copy from `../zotquicksearch`: `package.json`, `package-lock.json` (if present), `tsconfig.json`, `zotero-plugin.config.ts`, `eslint.config.mjs` (or whatever lint config it has), `.prettierignore` (if present), `.env.example`, `typings/`, `src/index.ts`, `src/addon.ts`, `src/hooks.ts`, `src/utils/`, `addon/bootstrap.js`, `addon/manifest.json`, `addon/prefs.js`, `addon/locale/`, `addon/content/icons/`, and `.github/` workflows if present.
   Do **not** copy `src/modules/quickSearch.ts`, `addon/content/quickSearch.xhtml`, the README, or anything else specific to quick search.
2. Rename everything to zotQL. In `package.json`:
   `name` "zotql", `version` "0.1.0", `description` "Quick Look card and better type-to-select for the Zotero items list",
   `config`: addonName "zotQL", addonID "zotql@artkuo.dev", addonRef "zotql", addonInstance "ZotQL", prefsPrefix "extensions.zotero.zotql";
   repository/bugs/homepage → `https://github.com/artkuo/zotQL`; `license` "AGPL-3.0-or-later".
   Rename the locale file to `zotql-addon.ftl` (and any other `zotquicksearch-*` names), and update every remaining `zotquicksearch`/`ZotQuickSearch`/`zqs` reference (grep to be sure; none may remain outside `node_modules`).
3. Strip the quick-search behaviour from `hooks.ts` and utils: on main-window load the plugin should only log `zotQL loaded` via `ztoolkit.log`. Leave empty hook bodies where features will go (comment `// M2: keyController`). No menu items, no keys.
4. Add a script `"test:unit": "node --test test/unit/"` to `package.json`, and an empty-safe placeholder test `test/unit/smoke.test.ts` that asserts `1 + 1 === 2` using `node:test` and `node:assert/strict`. Make sure `tsconfig.json` doesn't break on `test/unit` (excluding `test` from tsc is fine).
5. Add a `LICENSE` file with the AGPL-3.0 text (copy it from `../zotquicksearch` if it has one; otherwise from `node_modules` of any AGPL package or leave a TODO in your summary — do not fetch from the network if you can avoid it).
6. `npm install`.

## Checks that must pass
- `npm run build`
- `npm run test:unit`
- `grep -ri zotquicksearch --exclude-dir=node_modules --exclude-dir=.scaffold --exclude-dir=.git . ` finds only mentions in PLAN.md, AGENTS.md and tasks/.

## Don't
- Don't create `.env`, Zotero profiles, or touch anything outside this worktree except reading `../zotquicksearch`.
- Don't implement any zotQL features.
