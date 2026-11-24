/**
 * The "?" help card: ZotGlance's keys, in the Quick Look card's style.
 *
 * Opened and closed by keyController for the openHelp/closeHelp effects of
 * keyState.ts. It also closes itself on a click, on the window losing
 * focus, or on focus leaving the items list, and then calls `onClosed`.
 */
import { ensureStylesheet, HTML_NS } from "./quickLook";
import { getPref } from "../utils/prefs";

const ROOT_ID = "zotglance-help";
const FADE_MS = 120;

type Row = [keys: string, does: string];

export class HelpCard {
  private readonly win: _ZoteroTypes.MainWindow;
  private root: HTMLElement | null = null;
  private openState = false;
  private hideTimer: number | undefined;
  private readonly onMouseDown = () => this.close();
  private readonly onBlur = (e: Event) => {
    if (e.target === this.win) this.close();
  };
  private readonly onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element;
    if (!(target instanceof this.win.Element)) return;
    if (target.closest?.("#zotero-items-tree")) return;
    this.close();
  };

  /** Called whenever the card closes for a reason other than a key. */
  onClosed: (() => void) | null = null;

  constructor(win: _ZoteroTypes.MainWindow) {
    this.win = win;
  }

  open(): void {
    const root = this.ensureDom();
    this.render(root);
    this.win.clearTimeout(this.hideTimer);
    root.hidden = false;
    this.place(root);
    if (!this.openState) {
      this.openState = true;
      this.win.addEventListener("mousedown", this.onMouseDown, true);
      this.win.addEventListener("blur", this.onBlur, true);
      this.win.addEventListener("focusin", this.onFocusIn, true);
    }
    this.win.setTimeout(() => root.classList.add("open"), 0);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.win.removeEventListener("mousedown", this.onMouseDown, true);
    this.win.removeEventListener("blur", this.onBlur, true);
    this.win.removeEventListener("focusin", this.onFocusIn, true);
    const root = this.root;
    if (root) {
      root.classList.remove("open");
      this.hideTimer = this.win.setTimeout(() => {
        if (!this.openState) root.hidden = true;
      }, FADE_MS);
    }
    this.onClosed?.();
  }

  destroy(): void {
    this.close();
    this.root?.remove();
    this.root = null;
  }

  private ensureDom(): HTMLElement {
    if (this.root?.isConnected) return this.root;
    const doc = this.win.document;
    ensureStylesheet(doc);
    const root = this.el("div");
    root.id = ROOT_ID;
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "ZotGlance keys");
    doc.documentElement!.appendChild(root);
    this.root = root;
    return root;
  }

  private render(root: HTMLElement): void {
    const cmdY = getPref("cmdY") !== false;
    const typeSelect = getPref("typeSelect") !== false;
    root.replaceChildren();
    const title = this.el("h1", "zotglance-title");
    title.textContent = "ZotGlance keys";
    root.appendChild(title);
    // One grid for every section, so the key column lines up throughout.
    const grid = this.el("div", "zotglance-help-rows");
    root.appendChild(grid);

    this.section(grid, "At a Glance card", [
      ["Space", "open or close the card"],
      [cmdY ? "⌥Space  ⌘Y" : "⌥Space", "open or close it, even while typing"],
      ["↑  ↓", "move through the list; the card follows"],
      ["⌘↓", "open the first attachment (PDF first)"],
      ["PgDn  PgUp  ⇧Space", "scroll the card"],
      ["Esc", "close the card"],
    ]);
    if (typeSelect) {
      this.section(grid, "Type to select", [
        ["letters, digits", "jump to the first match in any column"],
        ["Space", "while typing: a space between words"],
        ["⌘G  ⇧⌘G", "next or previous match"],
        ["Delete", "remove the last character"],
        ["Return", "stop typing and open the card"],
        ["Esc", "stop typing"],
      ]);
    }
    this.section(grid, "Zotero", [
      ["+  −", "expand or collapse all rows"],
      ["⌘⇧L", "go to the collections pane"],
      ["⌘⇧K", "go to the search box"],
      ["Tab  ⇧Tab", "move between panes"],
    ]);

    const footer = this.el("p", "zotglance-footer");
    footer.textContent =
      "Press ? or Esc to close. Settings → ZotGlance changes fonts, columns and more.";
    root.appendChild(footer);
  }

  private section(grid: HTMLElement, heading: string, rows: Row[]): void {
    const h = this.el("h2", "zotglance-help-heading");
    h.textContent = heading;
    grid.appendChild(h);
    for (const [keys, does] of rows) {
      const k = this.el("span", "zotglance-help-keys");
      for (const part of keys.split("  ")) {
        const kbd = this.el("kbd");
        kbd.textContent = part;
        k.appendChild(kbd);
      }
      const d = this.el("span", "zotglance-help-does");
      d.textContent = does;
      grid.append(k, d);
    }
  }

  /** Centred over the panes, like the Quick Look card. */
  private place(root: HTMLElement): void {
    const anchor =
      this.win.document.getElementById("zotero-layout-switcher") ??
      this.win.document.documentElement!;
    const r = anchor.getBoundingClientRect();
    const width = Math.max(300, Math.min(520, r.width - 32));
    const top = r.top + 24;
    root.style.left = `${Math.round(r.left + (r.width - width) / 2)}px`;
    root.style.top = `${Math.round(top)}px`;
    root.style.width = `${Math.round(width)}px`;
    // May extend past the panes to the window's bottom edge.
    root.style.maxHeight = `${Math.round(Math.max(200, this.win.innerHeight - top - 16))}px`;
  }

  private el(tag: string, className?: string): HTMLElement {
    const e = this.win.document.createElementNS(HTML_NS, tag) as HTMLElement;
    if (className) e.className = className;
    return e;
  }
}
