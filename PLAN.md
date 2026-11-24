# ZotGlance — plan

A Zotero plugin that changes how the **items list behaves when it has keyboard focus**. It is not a search tool. It adds no search box or results window and doesn't touch Zotero's search bar. It only changes what keys do while you're in the list:

1.  **Quick Look card.** Press Space on the highlighted item to get a floating card centred over the panes. It shows the title, authors, journal, year and DOI, then the abstract in readable type, then clickable attachment icons and the first line of each child note. The card follows ↑/↓ and closes on Space, Esc or a click outside.
2.  **Better type-to-select** (phase 2). This replaces Zotero's built-in “type letters to jump to a row” in the list. Today that only matches the sorted column. The new version jumps to the next row where any matched column (by default the ones currently shown, usually title, creator and year; you can choose others in settings) matches what you typed, whatever the sort. The list itself is not filtered. A small indicator shows what you've typed, and while it's visible Space is a text space.

Target: **Zotero 10.0.9** (installed), macOS first. The plugin will be open source (AGPL-3.0) on GitHub and submitted to Zotero's plugin list. The design follows the claude.ai chat this came from.

---

## What Zotero does today (checked in the 10.0.9 source)

From `chrome/content/zotero/components/virtualized-table.js` and `itemTree.js` in the app's `omni.ja`:

- **Space already has a meaning.** With no type-to-select in progress, Space calls `onSelection(focused, false, true)`. That toggles selection of the focused row, like ⌘-click. Few people use it, so the plugin can take Space over, but it has to `preventDefault()` and `stopPropagation()` in the **capture phase**. Otherwise the tree also toggles the selection.
- **While type-to-select is in progress, Space is part of the typed text.** Printable keys go to `_handleTyping`, which builds `_typingString` and clears it after `TYPING_TIMEOUT = 1000` ms.
- **The built-in type-to-select matches only the sort column.** It uses `getRowString(i)`, which is `getCellText(i, getSortField())`, and does a prefix match starting at the focused row. That's why it seemed to do nothing in your date-sorted list.
- `itemTree.handleKeyDown` reserves `+`, `-` and ←/→ for expanding and collapsing rows. Leave those alone.

So the plugin attaches one capture-phase `keydown` listener to the items tree. Zotero's React handler runs after it, so the plugin decides first what each key does.

## Other plugins installed in your profile that use keys

These are separate plugins. ZotGlance doesn't depend on them or integrate with them. They're listed only to make sure the keys don't clash.

| Plugin                 | Keys                                                           | Conflict?                                                                         |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| zotquicksearch (yours) | ⌘⇧F, global                                                    | No                                                                                |
| Zotero Spotlight       | capture-phase window `keydown`, configurable; guide is `mod-j` | Probably none. Check its resolved defaults in M1                                  |
| Better BibTeX          | none relevant                                                  | No. If its Citation Key column is shown, phase 2 matches it like any other column |

No attachment Quick Look plugin (zotLook, etc.) is installed, so nothing else takes Space.

---

## Architecture

ZotGlance is a standalone plugin with no code or runtime link to zotquicksearch. `../zotquicksearch` is used only as a **build template**, because it already has a working setup: zotero-plugin-template, zotero-plugin-scaffold, TypeScript, esbuild and zotero-plugin-toolkit. Copy its `package.json` scripts, `zotero-plugin.config.ts`, `tsconfig`, lint config and the `src/{addon,hooks,index}.ts` bootstrap, then rename the IDs:

```
addonName:     ZotGlance
addonID:       zotglance@artkuo.dev
addonRef:      zotglance
addonInstance: ZotGlance
prefsPrefix:   extensions.zotero.zotglance
```

```
src/
  index.ts, addon.ts, hooks.ts     # template lifecycle: onStartup / onMainWindowLoad / onMainWindowUnload / onShutdown
  modules/
    keyController.ts   # the one capture-phase keydown listener + focus checks; calls the state machine
    keyState.ts        # PURE state machine: (state, keyEvent, now) -> {state, action}. Unit tested.
    quickLook.ts       # card DOM: create/show/hide/update, fade, positioning
    itemCard.ts        # Zotero.Item -> view model (title, creators, venue, year, DOI, abstract)
    typeSelect.ts      # phase 2: type-to-select indicator + jump to matching row
    matcher.ts         # PURE: tokenise typed text, prefix-match words, next/prev matching row. Unit tested.
  utils/prefs.ts, ztoolkit.ts
addon/
  content/quicklook.css
  prefs.js, locale/en-US/*.ftl, (phase 3) preferences.xhtml
test/
  keyState.test.ts, matcher.test.ts, itemCard.test.ts
```

Keeping the key handling (`keyState.ts`) and matching (`matcher.ts`) as pure functions means the hard logic can be tested without driving Zotero.

### Key handling

The listener is attached in capture phase to the main window's items tree (`#zotero-items-tree` or the tree's `.virtualized-table`). It acts only when `document.activeElement` is inside the items tree. The search bar, item pane, notes, reader tabs and collection tree are left alone.

| Key             | Card closed, not typing             | Card open                                                           | Type-to-select active (phase 2) |
| --------------- | ----------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Space           | open card                           | close card                                                          | add a space to the typed text   |
| ⌘Y              | open card                           | close card                                                          | end typing, open card           |
| ⌥Space          | open card                           | close card                                                          | end typing, open card (force)   |
| Esc             | pass through                        | close card                                                          | end typing                      |
| ↑ / ↓           | pass through                        | pass through, card follows                                          | end typing, pass through        |
| Return          | pass through (opens item)           | pass through                                                        | end typing, open card           |
| ⌘↓              | pass through                        | open the first attachment (PDF first) in the reader, close the card | —                               |
| ⌘G / ⇧⌘G        | —                                   | —                                                                   | next / previous match           |
| letters, digits | built-in (phase 1) / ours (phase 2) | same, card follows                                                  | add to the typed text           |
| \+ − ← →        | pass through                        | pass through                                                        | end typing, pass through        |

⌥Space: check both `e.code === "Space"` and `e.altKey`, because on macOS `e.key` comes through as a non-breaking space (`" "`).

### The card

**Recommendation: an HTML overlay inside the main window, not a XUL `<panel>` or a separate window.** An overlay can't take focus, so the items list keeps the keyboard. The window manager never sees it, so OmniWM won't tile it. It's ordinary DOM and CSS. The cost is that it can't extend past the Zotero window, which is fine.

- **Position:** centred over the items pane plus item pane, about 640 px wide and up to 70% of the window height. The abstract scrolls inside the card.
- **Content, top to bottom:**
  - Title (large).
  - Authors as `Last, F.`, with “et al.” after about 8 (expandable).
  - _Journal_ · Year · Vol(Issue) · pages, then DOI and URL as links.
  - The abstract in a serif face (Charter or Iowan Old Style), about 16 px with a 1.5 line height and 65–70 characters per line.
  - **Attachment row:** one clickable icon per attachment, with PDFs first, and a type-specific icon for PDF, EPUB, HTML snapshot or link. Clicking one opens it in Zotero's reader (or the default handler) and closes the card. ⌘↓ opens the first one. An item with a PDF therefore shows a PDF icon, which is the “has PDF” indicator. No icons means no attachments.
  - **Child notes:** the first line of each child note, with HTML stripped, up to three notes, then “+N more”.
  - Item type and citation key in a muted footer.
  - Tags and collections are **not** shown.
- **Follows the selection:** subscribe to the items view's selection change (check the exact hook in M1: `ZoteroPane.itemsView.onSelect`, or the `select` event of `ZoteroPane.itemSelected`). Re-render on change, with the update debounced to one animation frame.
- **Special rows:**
  - An attachment row shows its parent item's card, with that attachment's icon highlighted. If zotLook is installed later, this is where the two would be made to co-exist.
  - A child-note row shows the parent's card with that note highlighted.
  - A standalone note shows the note text. A standalone attachment shows its filename and icon.
  - If several items are selected, the card shows the focused row.
- **Close:** Space, Esc, ⌘Y, a click outside, switching collection, opening a reader tab, or the window losing focus. Fade in and out over about 120 ms, like Quick Look.
- **While open:** PgUp/PgDn (and ⇧Space, since Space is taken) scroll the abstract. ⌘C copies the formatted citation (optional, M3).
- Follow the light/dark appearance using Zotero's CSS variables.
- **Data:** `item.getField('title' | 'publicationTitle' | 'date' | 'volume' | 'issue' | 'pages' | 'DOI' | 'url' | 'abstractNote')`, `item.getCreators()`, `Zotero.Date.strToDate(date).year`, and `item.getField('citationKey')`, with a fallback to Better BibTeX's key if it's empty. Attachments come from `item.getAttachments()` → `Zotero.Items.get(id)` (`attachmentContentType`, `attachmentLinkMode`) and open via `ZoteroPane.viewAttachment(id)`. Notes come from `item.getNotes()` → `note.getNoteTitle()`. Map other item types (books, theses, preprints) to their venue fields: `bookTitle`, `publisher`, `university`, `repository`.

### Phase 2 — type-to-select on any field

- **Which columns are matched:** by default the columns currently shown in the items list, read from the items tree's visible column list. A setting can replace that with a fixed set of columns.
  - Columns are matched by their **displayed text** (`itemsView.getCellText(i, column)`), split into words. So Year matches “2010” and Citation Key matches if that column is shown.
  - **Creator is the exception.** The column shows “Kuo et al.”, which would hide co-authors, so Creator matches every author's surname from `item.getCreators()`.

- On the first keystroke, build an index of the **visible rows only**: `itemsView.rowCount` and `itemsView.getRow(i).ref`. For each row store a lowercase word list from the matched columns. Cache it per view. Invalidate the cache when the items view refreshes or `Zotero.Notifier` reports item changes. Measure the build time on your largest collection. If it's too slow, index lazily from the focused row.

- **Matching:** split the typed text on spaces. Every token must be a **prefix of some word** in the row, so “kuo 2010” matches both. Move the selection to the next matching row below the focused one, wrapping at the end. Nothing is hidden or filtered.

- **Tiered matching, so a space isn't required where letters meet digits.** Search the whole list with tier 1; fall back to tier 2 only if tier 1 matches no row. Stricter tiers win, so a looser reading never takes the jump from an exact one.
  1.  **As typed:** tokens split on spaces only. “h2o” still matches the title word “H2O”.
  2.  **Letter/digit split:** each token is also split where a letter meets a digit. “jones2006” becomes “jones” + “2006”, matching Jones in Creator and 2006 in Year. “kuo2010walk” becomes “kuo” + “2010” + “walk”.
  - No general “any split” tier (“kuowalk” → “kuo” + “walk”). It was considered and left out because short pieces match almost every row. Revisit only if real use asks for it.
  - ⌘G and ⇧⌘G use the same tier that found the current match, so cycling stays consistent.

- **Indicator:** a small pill at the bottom of the items pane reading `kuo 20▌`, plus a match count if it's cheap to compute. It hides 1.5 s after the last keystroke (a pref), or at once on Esc, Return or an arrow key.

- Stop letters reaching the built-in `_handleTyping`, so the old and new type-to-select never run together. Ideally the plugin calls `stopPropagation()` on every printable key while the items tree has focus.

- **Failure case to accept:** you type “smith”, pause past the timeout, then press Space meaning “smith j”, and the card opens instead. The visible indicator and the longer 1.5 s timeout make this rare, and pressing Space again closes the card.

### Prefs (phase 3, in a Settings pane)

Phase 2 type-to-select on/off (fall back to the built-in one), which columns to match (“shown columns”, the default, or a fixed list), indicator timeout, card width, abstract font and size, whether attachments show the parent's card, and ⌘Y on/off.

---

## Milestones

**M0 — scaffold and dev loop (about 1 session)**

- Copy the zotquicksearch tooling into this repo, rename the IDs and `npm install`.
- Create a separate **dev profile** (`/Applications/Zotero.app/Contents/MacOS/zotero -P`, profile “zotglance-dev”), pointed at a copy of your data directory or a small test library so development never touches your real library. Put the paths in `.env`, which is git-ignored.
- Get `npm start` hot reload working: scaffold serves the build into the dev profile and reloads on save.
- First commit on `main` (the repo has no commits yet and is on `master`; rename the branch).

**M1 — spike: confirm the four assumptions before building UI**

1.  A capture-phase listener on the items tree sees Space before the React handler, and `preventDefault` plus `stopPropagation` stop the built-in selection toggle.
2.  The right selection-changed hook in Zotero 10.
3.  An absolutely positioned overlay in the main window sits above the items and item panes, doesn't take focus, and is ignored by OmniWM.
4.  Spotlight's resolved default shortcuts use neither Space nor ⌘Y.

The result is a throwaway “Space logs the focused item title” build. Record what you find in `NOTES.md`.

**M2 — Quick Look MVP**

- `keyState` handles Space, ⌘Y, ⌥Space and Esc, with unit tests.
- `itemCard` builds the view model, with unit tests on fixture items (journal article, book, thesis, preprint, item with no abstract, 40-author paper).
- `quickLook` adds the overlay, card layout and CSS, and closes on Space, Esc or a click outside.
- **Done when:** Space opens a readable card on any regular item, Space closes it, focus never leaves the list, and the existing Space selection toggle no longer fires.

**M3 — make it feel like Quick Look**

- The card follows ↑/↓, fades in and out, and closes when the collection or tab changes or the window loses focus.
- Attachment icons (click and ⌘↓), the child-note first lines, and attachment and note rows all behave as described above. The abstract scrolls with PgUp/PgDn and ⇧Space.
- Tune the typography (dark mode, long titles, missing fields, abstracts that are actually HTML).
- **Done when:** you can browse a collection with ↓ and read each abstract without touching the mouse.

**M4 — type-to-select on any field**

- `matcher` and its tests: tokenising, prefix matching, wrap-around, next and previous (done). Add tier 2: a pure `splitLetterDigit(tokens)` and a tiered `findMatch` that reports which tier matched, with contract tests first, then delegate.
- `typeSelect`: indicator, timer and index cache. Add the type-to-select rows of the key table to `keyState`, with tests covering timer edges such as Space at 1.49 s and 1.51 s.
- Profile the index build on your largest collection.
- **Done when:** in a date-sorted collection, typing “kuo 2010” or “kuo2010” jumps to the right paper, ⌘G cycles through matches, and Space works as both a text space and Quick Look, as the table describes.

**M5 — settings, packaging, release**

- Settings pane and Fluent strings. A README with a GIF.
- Public GitHub repo (`artkuo/ZotGlance`) under AGPL-3.0, with a LICENSE file. Set up the template's GitHub Actions release workflow so `npm run release` builds the `.xpi` and `update.json`, and tagged releases publish them.
- Install it into your real profile from the release `.xpi`.
- Submit it to Zotero's plugin list, following the current instructions on zotero.org/support/plugins. Before submitting, check that the minimum and maximum Zotero versions in the manifest are honest and that there is an English README with screenshots.

---

## Risks

- **Zotero internals change.** `itemsView`, the selection API and the items tree DOM IDs are not public API. Keep every reference to them in `keyController.ts` and `quickLook.ts`, and re-check them when Zotero updates.
- **Large libraries in phase 2.** Building the index on keypress could lag on tens of thousands of rows. Mitigate by caching per view and indexing lazily.
- **Focus edge cases:** the items tree losing focus while the card is open, and modal dialogs. Close the card on `blur` of the tree, or keep it open on a click inside the card (decide in M3).
- **Other plugins that later grab Space** (zotLook, for example). Not installed now. If you add one, attachment rows could pass through to it, behind a pref.

## Decisions (from your answers)

- **Attachments:** the card shows one clickable icon per attachment, with PDFs first. The PDF icon doubles as the “has PDF” indicator. An attachment row shows its parent's card with that icon highlighted. Co-existing with zotLook may need adjusting later.
- **Card position:** centred over the panes.
- **Extra content:** the first line of each child note (up to three). No tags, no collections.
- **Phase 2 columns:** the shown columns by default, or a fixed list chosen in settings. Creator matches every author's surname.
- **Publishing:** open source under AGPL-3.0, on GitHub, and submitted to Zotero's plugin list.
