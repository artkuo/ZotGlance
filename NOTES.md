# ZotGlance — implementation notes

Findings from running code against Zotero 10.0.9 in the dev profile: what the real app does.

## Dev setup (M0)

- `npm start` opens a **separate** Zotero using profile `~/Zotero-dev/zotglance/profile`, data folder `~/Zotero-dev/zotglance/data` and HTTP port 23129. Your real Zotero, profile and library (port 23119) are untouched. All the paths are in `.env`, which is git-ignored.
- **Kill-command hazard.** On macOS, zotero-plugin-scaffold's default exit handler runs `kill -9 $(ps -x | grep zotero)`, which force-kills the real Zotero too. `.env` sets `ZOTERO_PLUGIN_KILL_COMMAND` to `pkill -f` on the dev profile path only. Tested: stopping `npm start` left the real Zotero running.
- **Hot reload** works: saving a file in `src/` rebuilds the plugin and reloads it in the dev instance.
- **Dev eval bridge** (`src/modules/devBridge.ts`, `scripts/zq-eval.sh`): a POST endpoint, `/zotglance/dev/eval`, that runs a JavaScript async function body inside the dev Zotero, with `Zotero`, `win` and `addon` in scope, and returns the result as JSON.
  - It's registered only in development builds, and only if the dev profile has the `extensions.zotero.zotglance.devToken` pref, which the config writes from `.env`.
  - Requests without the token get 403, and Zotero itself drops requests that look like they come from a browser.
  - It's a no-op in production builds. The user approved it on 2026-11-23.
- **Test library:** `scripts/zq-eval.sh < scripts/dev/seed.js` creates the “ZotGlance fixtures” collection with 38 rows. It's safe to run more than once. It includes:
  - a journal article with 4 child notes, a PDF and a link attachment
  - a 40-author article, a book, a thesis and a preprint
  - an item with no abstract, and one with an HTML abstract and a long title
  - a standalone note
  - 30 filler articles with varied surnames and years, for type-to-select

## Testing gotcha: hidden window means no animation frames

If the dev window is hidden behind other windows (`document.hidden === true`), `requestAnimationFrame` never fires. The items tree's `onSelection` is wrapped in `oncePerAnimationFrame`, so keyboard selection changes **don't happen** until the window is visible.

When the window can't be brought to the front, check behaviour at a lower level instead:

- Wrap `itemsView.tree.onSelection` to record its calls.
- Read `itemsView.tree._typingString`, which updates immediately.
- Drive programmatic changes through `itemsView.selectItems()` or `selection.select()`.

To send trusted key events, use `nsITextInputProcessor` (`beginInputTransactionForTests(win)`) with the tree focused. The helper is `scripts/dev/keyhelpers.js`.

## M1 results

| #   | Assumption                                                                                                                   | Result                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | A capture-phase keydown listener sees Space before Zotero, and `preventDefault` + `stopPropagation` stop the built-in toggle | ✅ Confirmed                                                          |
| 2   | Selection-change hook                                                                                                        | ✅ `ZoteroPane.itemsView.onSelect.addListener(fn)` / `removeListener` |
| 3   | An in-window overlay sits above the panes without taking focus                                                               | ✅ Confirmed. OmniWM can't affect it because it isn't a window        |
| 4   | Spotlight doesn't use Space or ⌘Y                                                                                            | ✅ Confirmed                                                          |

### Details

**Items tree DOM and API (Zotero 10.0.9)**

- `#zotero-items-tree` is a wrapper div. The focusable element is `#item-tree-main-default` (`.virtualized-table`, `tabindex=0`), and keydown events target it, so the listener goes there in capture phase. The `eventPhase` is AT_TARGET.
- Zotero's React handlers are `onKeyDown` (bubble phase) on the React root, so a capture listener on the tree element runs first.
- `ZoteroPane.itemsView`:
  - Rows: `rowCount`, `getRow(i).ref` (a `Zotero.Item`).
  - Selection: `selection.{focused, selected, count, select(i)}`, `selectItems([ids])`.
  - Sorting and columns: `getSortField()`, `_getColumns()` (filter on `!c.hidden` for the shown columns; by default that's title, firstCreator and hasAttachment).
  - The inner virtualized table is `itemsView.tree`, which holds `_typingString`.
- No `<key>` element in the main window uses ⌘Y or Space.

**1. Space**

- Without ZotGlance, Space while not typing calls `tree.onSelection(focused, false, true)`, which toggles the selection.
- With a capture listener calling `preventDefault()` + `stopPropagation()`, nothing reaches Zotero: no `onSelection` call and no change to `_typingString`. The same holds for ⌥Space and ⌘Y.
- While built-in typing is in progress, Space is appended to `_typingString` (“on m”), and the string clears after 1 s.
- Eating Space mid-typing just drops the space (“o” stays “o”). Phase 2 replaces the built-in typing anyway, so it must stop all printable keys, as PLAN.md says.

**⌥Space caveat:** the test keys were synthesized with `key: " "` and `altKey: true`. A real macOS keyboard gives `key: " "`. Match on `e.code === "Space"` plus `e.altKey`, never on `e.key`. Check this with a real keypress in M2.

**2. Selection hook**

- `itemsView.onSelect` fired for both `selectItems()` and `selection.select()`.
- Keyboard moves go `selection.select` → `onSelectionChange` → `_onSelectionChangeDebounced` → the same listeners. Keyboard changes are debounced, the same as for the item pane, which is fine.
- There's no DOM `select` event on the tree, so don't use one.

**3. Overlay**

- A `position: fixed` div appended to the main window's `documentElement` (the XUL `<window>`), with a z-index, sits on top of the panes: `elementFromPoint` returns it.
- `document.activeElement` stays on `#item-tree-main-default` after inserting it. Keys still reach the tree, and a `mousedown` on the overlay with `preventDefault()` doesn't move focus.
- Geometry: `#zotero-layout-switcher` covers the items pane plus the item pane, so centre the card on that. `#zotero-items-pane` is the list only, and `#zotero-item-pane` is the right-hand pane. In stacked layout the item pane sits below the list; re-check positioning in M3.
- Not yet checked visually: shadow, rounding and fade on screen. The window was hidden during the spike, so do this in M2.

**4. Spotlight** (from `../zotero-spotlight/src`): its shortcut choices are ⌘P, ⇧⌘P, ⌘K, ⌘O, ⌘J and ⌘/, or off. Spotlight isn't installed in the dev profile.

## Implications for M2

- `keyController`:
  - Attach a capture-phase `keydown` listener to `#item-tree-main-default`, and re-attach it if the tree is re-rendered: watch `itemsView` changes or `onMainWindowLoad`.
  - Act only when `doc.activeElement` is that element.
- `quickLook`:
  - A fixed div on `documentElement`, centred on `#zotero-layout-switcher`.
  - `mousedown` → `preventDefault()` so the list keeps focus.
  - Subscribe through `itemsView.onSelect`.
  - `itemsView` is replaced when you switch collection or library, so re-subscribe, or close the card, on collection change.

## M2 results (2026-11-23)

Built with `keyState.ts` and `itemCard.ts` (both delegated to Command Code against contract tests), plus `keyController.ts`, `quickLook.ts` and `addon/content/quicklook.css` (written by Claude). Checked in the dev instance with trusted key events, and with a window snapshot, since the window was hidden.

**Working**

- Space opens and closes the card, and focus stays on the list.
- The card follows the selection through `itemsView.onSelect`.
- An attachment or note row shows its parent with that child highlighted.
- Standalone notes, books and the 40-author item ("+32 more") all render correctly.
- Esc, ⌥Space and ⌘Y open and close the card as specified.
- A click outside the card closes it; a click in the items list doesn't.
- ⌘↓ opens the PDF in a reader tab and closes the card.
- After a hot reload there is still exactly one card and one listener.

**How it works**

- The key listener is on the **window**, in capture phase, filtered to `target.id === "item-tree-main-default"` and the active element. It runs before React and survives the tree being re-rendered.
- **Window snapshots:** `win.browsingContext.currentWindowGlobal.drawSnapshot(DOMRect, 2, "white")` works even while the window is hidden. Draw the result to a canvas, then save it with `IOUtils.write`.

**For M3**

- `getNotes()` returns child notes in alphabetical order by title, not the order they were created. The card lists them in that order.
- If the highlighted note row is the 4th note or later, it falls behind "+N more", so it doesn't appear on the card. Show the highlighted note even when it's past `MAX_NOTES`.
- The card covers most of the items list at the default 1000×600 window size. Check the size at larger windows, and in the stacked layout.
- The fade and the real ⌥Space key (`" "`) still need checking by hand, in a visible window.

## M3 results (2026-11-23)

**Done and checked in the dev instance**

- **Keyboard browsing:** with the card open, ↓/↑ moves the selection and the card follows every row. Tested with a real keyboard path; the window was visible this time.
- **Scrolling:** PgDn, ⇧Space and PgUp page the abstract, and a new item starts at the top.
- **Focus rule** (decided for PLAN.md "Risks"): the card closes when keyboard focus moves anywhere except the items list or the card (Tab into the item pane, the search bar), and when the selection disappears.
  - Clicking the card keeps focus in the list.
  - Deleting the shown item: Zotero selects the next row and the card follows it.
  - Gotcha: in a background window, Firefox moves focus without firing focus events until the window is active. Test the handler by dispatching `focusin` directly.
- **Highlighted note:** if it's past the first three, it replaces the last slot. Delegated against contract tests.
- **Note order:** the card follows `getNotes()`, which is alphabetical by title. That's the same order the items tree shows child notes, so it was left as is.
- **Layout and appearance:**
  - Stacked layout: the card centres over the list plus the item pane.
  - Dark mode works through Zotero's theme variables; tested with `ui.systemUsesDarkTheme = 1`.
  - Long titles wrap, and HTML abstracts render as plain text.
- **Abstract typography:** `1rem` (the list's size; follows Zotero's font-size setting) at 1.4 line height. A 300-word abstract fits without scrolling at 1705×1083 (`scripts/dev/abstract300.js`).
- **Reduce motion:** this Mac has it on. Under it, the card keeps a 120ms fade and drops the zoom.
- **Stylesheet:** the link has a `?timestamp` query, because Zotero's chrome cache otherwise serves the old CSS after a hot reload.

**Still to check by hand:** a physical ⌥Space keypress (`e.key` is `" "`; the code matches on `e.code`), and how the fade feels in real use.

## M4 results (2026-11-23)

**Done and checked in the dev instance** (trusted key events, window visible)

- **Shown columns:** read with `itemsView._getColumns().filter(c => !c.hidden)`; the `dataKey`s are `title`, `firstCreator`, `year`, ... Cell text comes from `itemsView.getCellText(row, dataKey)`, which reads Zotero's own row cache (`_rowCache`, keyed by item id). `hasAttachment` and `numNotes` are skipped. To show or hide a column in tests: `iv.tree._columns.toggleHidden(index)`.
- **Creator:** matches every creator's `lastName` (or `name` for single-field names). Typing "smith" found an article whose Smith is the 3rd author, and "donelan" one whose Donelan is the 2nd.
- **Tier 2:** with Year shown, "kuo2010" finds Kuo's 2010 article (tier 1 matches nothing). Delegated against `test/unit/matcherTiers.test.ts`.
- **Moving the selection:** the same calls as Zotero's own type-to-select, `tree.scrollToRow(i)` then `tree.onSelection(i)`. The card follows.
- **Built-in typing is off:** `tree._typingString` stays empty while typing.
- **Indicator:** a pill at the bottom centre of `#zotero-items-tree` with the typed text, a caret and "2 of 5" / "1 match" / "no match" (red). It hides 1.5 s after the last key (`typeSelectTimeoutMs`) or at once on Esc.
- **Space:** while typing, Space goes into the typed text, with the card open or closed. After the timeout it toggles the card again.
- **⌘G / ⇧⌘G:** next and previous match, with the counter updated. They reuse the tier that found the current match.
- **Word cache:** keyed by item id, so sorting and switching collections keep it. It's cleared when the shown columns change, and item notifier events drop the changed items.
- **Speed:** 39 rows took 1.8 ms cold and 0.3 ms warm (about 45 µs per row cold, mostly Zotero's `_getRowData`). At that rate, 10,000 rows would take about 0.5 s on the first keystroke. Measure in a real library before release, and index lazily from the focused row if it's slow (PLAN.md).

## Settings pane and resizable card (2026-11-23)

- **Settings pane:** `addon/content/preferences.xhtml`, registered with `Zotero.PreferencePanes.register` in `onStartup`. The scaffold prefixes `preference="..."` with `extensions.zotero.zotglance.` and `data-l10n-id`s with `zotglance-`. The FTL file `preferences.ftl` becomes `zotglance-preferences.ftl`, so the XHTML links `__addonRef__-preferences.ftl`.
- **Prefs from the pane are strings:** Zotero's binding writes `elem.value`, so menulist-backed prefs (`abstractSize`, `typeSelectTimeoutMs`) are string prefs, and the code reads them with `Number()`.
- **Inline handlers work:** the Reset Card Size button calls `Zotero.ZotGlance.hooks.onPrefsEvent('resetCardSize')` from `oncommand`.
- **Abstract font and size:** `--zotglance-abstract-font` and `--zotglance-abstract-size` are set on the card each time it opens. The abstract no longer has `max-width: 75ch`, so widening the card widens the text.
- **Resizing:** the card has CSS `resize: both`.
  - Gotcha: `preventDefault()` on mousedown stops Firefox's resize grip, so the card's mousedown handler skips it within 16 px of the bottom-right corner, then refocuses the items list on mouseup.
  - On mousedown the height is pinned and the cap raised to the full pane, so a drag can go past the automatic 70% cap without a jump.
  - On mouseup a changed size is saved in `cardWidth`/`cardHeight` (px; 0 = automatic). It's clamped to the pane on every open, and stays centred.
  - Tested with `windowUtils.sendMouseEvent` drags: 640×493 → 760×643, kept after reopening.
- **Icon:** the settings sidebar needs `image` in `PreferencePanes.register`, or it shows a placeholder. The M0 scaffold had copied zotquicksearch's icons; M5 replaced them with ZotGlance's own (a card over a space bar), drawn on a canvas in the dev Zotero.

## M5 (2026-11-23)

- **Matched columns:** `typeSelectColumns` is `"shown"` (default) or `"fixed"`. "fixed" uses the `match*` bool prefs: title, creator, year, publication, publisher, citation key. `getCellText` works for hidden columns, because `_getRowData` computes every column from `getColumns()`, hidden or not. Checked: with Year hidden, "kuo2010" doesn't match with shown columns, and does with fixed.
- **Pane script:** the pane's `onload` calls `hooks.onPrefsEvent('load', { window })`, which greys out the fixed-column checkboxes unless "these columns" is chosen (radiogroup `command` and `syncfrompreference`).
- **Manifest:** `strict_min_version` is `10.0` and `strict_max_version` `10.*`, since the plugin is tested only on 10.0.9 and uses Zotero 10 internals. Raise the maximum after testing each new major version.
- **CI:** lint, build and unit tests. Zotero's own `npm run test` is left out because it needs a Zotero binary.
- **README screenshots** in `docs/` come from the dev library. The dev window must be visible (front, not occluded) or snapshots are stale and selection changes wait for rAF. `win.document.hidden` tells you which.

## "?" help card and punctuation keys (2026-11-23)

- **Bug fixed:** with type-to-select on, `+` and `-` were typed text, so Zotero's expand-all and collapse-all stopped working. That contradicted PLAN.md's key table, and the original contract test encoded it.
  - Now, when not typing, a printable key that isn't a letter or digit doesn't start typing: `?` opens help, `+`/`-` go to Zotero, and anything else is swallowed. Typed words can only ever match letters and digits, so punctuation typed first was useless anyway.
  - While typing, every printable key is still typed text. `-` is useful there, since tier 2 splits "co-author".
  - Checked in dev: `+` took the fixtures from 39 to 48 rows and `-` back to 39; `.` shows no indicator, and Zotero's `_typingString` stays empty.
- **Help card** (`helpCard.ts`): opened by `?` when not typing (it replaces the Quick Look card if that's open).
  - `?`, Esc and Space close it and do nothing else. Any other key closes it and then does its normal job (↓ moves the selection).
  - A click, window blur, or focus leaving the list also closes it.
  - It may extend below the panes to the window's bottom edge, so the whole list fits at 1280×800.
  - The keyState change was delegated against `test/unit/keyHelp.test.ts` (87/87).
