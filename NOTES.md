# zotQL — implementation notes

Findings from running code against Zotero 10.0.9 in the dev profile. PLAN.md is the design; this file records what the real app does.

## Dev setup (M0)

- `npm start` opens a **separate** Zotero using profile `~/Zotero-dev/zotql/profile`, data folder `~/Zotero-dev/zotql/data` and HTTP port 23129. Your real Zotero, profile and library (port 23119) are untouched. All the paths are in `.env`, which is git-ignored.
- **Kill-command hazard.** On macOS, zotero-plugin-scaffold's default exit handler runs `kill -9 $(ps -x | grep zotero)`, which force-kills the real Zotero too. `.env` sets `ZOTERO_PLUGIN_KILL_COMMAND` to `pkill -f` on the dev profile path only. Tested: stopping `npm start` left the real Zotero running.
- **Hot reload** works: saving a file in `src/` rebuilds the plugin and reloads it in the dev instance.
- **Dev eval bridge** (`src/modules/devBridge.ts`, `scripts/zq-eval.sh`): a POST endpoint, `/zotql/dev/eval`, that runs a JavaScript async function body inside the dev Zotero, with `Zotero`, `win` and `addon` in scope, and returns the result as JSON.
  - It's registered only in development builds, and only if the dev profile has the `extensions.zotero.zotql.devToken` pref, which the config writes from `.env`.
  - Requests without the token get 403, and Zotero itself drops requests that look like they come from a browser.
  - It's a no-op in production builds. The user approved it on 2026-11-23.
- **Test library:** `scripts/zq-eval.sh < scripts/dev/seed.js` creates the “zotQL fixtures” collection with 38 rows. It's safe to run more than once. It includes:
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

- Without zotQL, Space while not typing calls `tree.onSelection(focused, false, true)`, which toggles the selection.
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
