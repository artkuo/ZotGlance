/**
 * Phase 2 type-to-select (PLAN.md "Phase 2"): jump to the next row whose
 * shown columns match what was typed, and show what was typed in a small
 * indicator. Nothing is filtered.
 *
 * Zotero-facing half; the matching itself is `matcher.ts` (pure).
 * `keyController.ts` calls `typed`, `findNext` and `end` for the effects of
 * the same names that `keyState.ts` returns.
 */
import {
  findMatch,
  findTieredMatch,
  rowMatches,
  tierTokens,
  wordsFrom,
} from "./matcher";
import { ensureStylesheet, HTML_NS } from "./quickLook";
import { getPref } from "../utils/prefs";

const PILL_ID = "zotql-typeselect";
const ITEMS_PANE_ID = "zotero-items-tree";
/** Columns whose cell text isn't worth matching (icons and counts). */
const SKIP_COLUMNS = new Set(["hasAttachment", "numNotes"]);
const CREATOR_COLUMN = "firstCreator";
/** "Fixed columns" setting: pref name -> the column's dataKey. */
const FIXED_COLUMNS = {
  matchTitle: "title",
  matchCreator: CREATOR_COLUMN,
  matchYear: "year",
  matchPublication: "publicationTitle",
  matchPublisher: "publisher",
  matchCitationKey: "citationKey",
} as const;

interface Search {
  text: string;
  tiers: string[][];
  tier: number; // the tier that found the current match; -1 if none
}

export class TypeSelect {
  private readonly win: _ZoteroTypes.MainWindow;
  private pill: HTMLElement | null = null;
  private hideTimer: number | undefined;
  private last: Search | null = null;
  /** Words per item id, for the column set in `columnKey`. */
  private words = new Map<number, string[]>();
  private columnKey = "";
  private notifierID: string | null = null;

  constructor(win: _ZoteroTypes.MainWindow) {
    this.win = win;
  }

  /** The typed text changed: jump to the first match from the focused row. */
  typed(text: string, timeoutMs: number): void {
    const iv = this.itemsView();
    if (!iv) return;
    const tiers = tierTokens(text);
    const from = this.focused(iv);
    const { index, tier } = findTieredMatch(
      iv.rowCount,
      this.wordGetter(iv),
      tiers,
      from,
      1,
      true,
    );
    this.last = { text, tiers, tier };
    if (index >= 0 && index !== from) this.select(iv, index);
    this.show(text, index, tier, tiers, timeoutMs);
  }

  /** ⌘G / ⇧⌘G: the next or previous match, using the same tier as before. */
  findNext(text: string, direction: 1 | -1, timeoutMs: number): void {
    const iv = this.itemsView();
    if (!iv || !text.trim()) return;
    const getWords = this.wordGetter(iv);
    const from = this.focused(iv);
    let index = -1;
    let tier = -1;
    let tiers: string[][];
    if (this.last?.text === text && this.last.tier >= 0) {
      tiers = this.last.tiers;
      tier = this.last.tier;
      index = findMatch(
        iv.rowCount,
        getWords,
        tiers[tier],
        from,
        direction,
        false,
      );
    } else {
      tiers = tierTokens(text);
    }
    if (index < 0) {
      ({ index, tier } = findTieredMatch(
        iv.rowCount,
        getWords,
        tiers,
        from,
        direction,
        false,
      ));
    }
    this.last = { text, tiers, tier };
    if (index >= 0 && index !== from) this.select(iv, index);
    this.show(text, index, tier, tiers, timeoutMs);
  }

  /** Typing ended: hide the indicator. */
  end(): void {
    this.win.clearTimeout(this.hideTimer);
    if (this.pill) this.pill.hidden = true;
  }

  destroy(): void {
    this.end();
    this.pill?.remove();
    this.pill = null;
    if (this.notifierID) Zotero.Notifier.unregisterObserver(this.notifierID);
    this.notifierID = null;
    this.words.clear();
  }

  // --- rows and words -------------------------------------------------------

  private itemsView(): any {
    const iv = (this.win.ZoteroPane as any)?.itemsView;
    return iv?.rowCount > 0 && iv.selection ? iv : null;
  }

  private focused(iv: any): number {
    const f = iv.selection.focused;
    return f >= 0 && f < iv.rowCount ? f : 0;
  }

  /** The columns to match; clears the word cache when they change. */
  private columns(iv: any): string[] {
    let cols: string[] = [];
    if (getPref("typeSelectColumns") === "fixed") {
      cols = (Object.keys(FIXED_COLUMNS) as (keyof typeof FIXED_COLUMNS)[])
        .filter((pref) => getPref(pref))
        .map((pref) => FIXED_COLUMNS[pref]);
    }
    if (cols.length === 0) cols = this.shownColumns(iv);
    const key = cols.join(",");
    if (key !== this.columnKey) {
      this.columnKey = key;
      this.words.clear();
    }
    return cols;
  }

  /** The items list's visible columns. */
  private shownColumns(iv: any): string[] {
    let cols: string[] = [];
    try {
      cols = (iv._getColumns?.() ?? [])
        .filter((c: any) => !c.hidden && !SKIP_COLUMNS.has(c.dataKey))
        .map((c: any) => c.dataKey as string);
    } catch {
      // Fall back to Zotero's defaults.
    }
    return cols.length > 0 ? cols : ["title", CREATOR_COLUMN];
  }

  /** Row index -> words, for the columns shown now. */
  private wordGetter(iv: any): (index: number) => string[] {
    const cols = this.columns(iv);
    return (index) => this.wordsOf(iv, cols, index);
  }

  private wordsOf(iv: any, cols: string[], index: number): string[] {
    const row = iv.getRow(index);
    if (!row) return [];
    const cached = this.words.get(row.id);
    if (cached) return cached;
    this.watchItems();
    const words: string[] = [];
    for (const col of cols) {
      if (col === CREATOR_COLUMN) {
        const surnames = this.surnames(row.ref);
        if (surnames.length > 0) {
          for (const name of surnames) words.push(...wordsFrom(name));
          continue;
        }
      }
      let text: unknown;
      try {
        text = iv.getCellText(index, col);
      } catch {
        continue;
      }
      if (text !== undefined && text !== null && text !== "") {
        words.push(...wordsFrom(String(text)));
      }
    }
    this.words.set(row.id, words);
    return words;
  }

  /** Every creator's surname (the Creator column shows only the first). */
  private surnames(ref: any): string[] {
    try {
      const creators = ref?.getCreators?.() ?? [];
      return creators
        .map((c: any) => c.lastName || c.name || "")
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Drop cached words when items change (titles, creators, dates...). */
  private watchItems(): void {
    if (this.notifierID) return;
    this.notifierID = Zotero.Notifier.registerObserver(
      {
        notify: (_event: string, _type: string, ids: (string | number)[]) => {
          for (const id of ids) this.words.delete(Number(id));
        },
      },
      ["item"],
      "zotql-typeselect",
    );
  }

  /** Move the selection the way Zotero's own type-to-select does. */
  private select(iv: any, index: number): void {
    const tree = iv.tree;
    if (tree?.onSelection) {
      tree.scrollToRow(index);
      tree.onSelection(index);
    } else {
      iv.selection.select(index);
      iv.ensureRowIsVisible?.(index);
    }
  }

  // --- indicator ------------------------------------------------------------

  private show(
    text: string,
    index: number,
    tier: number,
    tiers: string[][],
    timeoutMs: number,
  ): void {
    const pill = this.ensurePill();
    const query = pill.firstChild as HTMLElement;
    const count = pill.lastChild as HTMLElement;
    query.textContent = `${text}▌`;
    if (index < 0) {
      count.textContent = "no match";
    } else {
      const { total, position } = this.count(tiers[tier], index);
      count.textContent = total > 1 ? `${position} of ${total}` : "1 match";
    }
    pill.classList.toggle("nomatch", index < 0);
    this.place(pill);
    pill.hidden = false;
    this.win.clearTimeout(this.hideTimer);
    this.hideTimer = this.win.setTimeout(() => this.end(), timeoutMs);
  }

  /** How many rows match, and where `index` falls among them. */
  private count(
    tokens: string[],
    index: number,
  ): { total: number; position: number } {
    const iv = this.itemsView();
    let total = 0;
    let position = 0;
    if (!iv) return { total, position };
    const getWords = this.wordGetter(iv);
    for (let i = 0; i < iv.rowCount; i++) {
      if (rowMatches(tokens, getWords(i))) {
        total++;
        if (i <= index) position = total;
      }
    }
    return { total, position };
  }

  private ensurePill(): HTMLElement {
    if (this.pill?.isConnected) return this.pill;
    const doc = this.win.document;
    ensureStylesheet(doc);
    const pill = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    pill.id = PILL_ID;
    pill.hidden = true;
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    for (const cls of ["zotql-ts-query", "zotql-ts-count"]) {
      const span = doc.createElementNS(HTML_NS, "span") as HTMLElement;
      span.className = cls;
      pill.appendChild(span);
    }
    doc.documentElement!.appendChild(pill);
    this.pill = pill;
    return pill;
  }

  /** Bottom centre of the items list. */
  private place(pill: HTMLElement): void {
    const anchor = this.win.document.getElementById(ITEMS_PANE_ID);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    pill.style.left = `${Math.round(r.left + r.width / 2)}px`;
    pill.style.top = `${Math.round(r.bottom - 44)}px`;
  }
}
