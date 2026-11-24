/**
 * The Quick Look card: a fixed-position overlay inside the main window
 * (PLAN.md "The card"; NOTES.md "M1 results" 3).
 *
 * Zotero-facing half of the card. `itemCard.ts` (pure) turns plain item data
 * into a CardModel; this file reads a Zotero.Item into that data, renders the
 * model, keeps it in sync with the selection, and closes it when the context
 * goes away (click outside, collection or tab change, window blur).
 */
import {
  buildCard,
  htmlToParagraphs,
  type AttachmentData,
  type CardModel,
  type ItemData,
} from "./itemCard";

export const HTML_NS = "http://www.w3.org/1999/xhtml";
const ROOT_ID = "zotql-card";
const STYLE_ID = "zotql-card-style";
const FADE_MS = 120;

const FIELDS = [
  "title",
  "publicationTitle",
  "bookTitle",
  "publisher",
  "university",
  "repository",
  "proceedingsTitle",
  "conferenceName",
  "institution",
  "websiteTitle",
  "date",
  "volume",
  "issue",
  "pages",
  "DOI",
  "url",
  "abstractNote",
  "extra",
];

const LINK_MODES: AttachmentData["linkMode"][] = [
  "imported_file",
  "imported_url",
  "linked_file",
  "linked_url",
  "embedded_image",
];

export class QuickLook {
  private readonly win: _ZoteroTypes.MainWindow;
  private readonly doc: Document;
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private model: CardModel | null = null;
  private openState = false;
  private renderQueued = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private notifierID: string | null = null;
  private itemsView: any = null;
  private readonly onSelect = () => this.queueRender();
  private readonly onCollectionSelect = () => this.close();
  private readonly onWindowMouseDown = (e: MouseEvent) => {
    const target = e.target as Element;
    if (this.root?.contains(target)) return;
    // Like Finder: clicking another row in the list keeps the card open
    // and it follows the new selection.
    if (target.closest?.("#zotero-items-tree")) return;
    this.close();
  };
  private readonly onWindowBlur = (e: Event) => {
    if (e.target === this.win) this.close();
  };
  /**
   * Keyboard focus moving anywhere but the items list or the card (Tab into
   * the item pane, ⌘F to the search bar, ...) closes the card: otherwise it
   * would stay up while Esc and Space no longer reach it.
   */
  private readonly onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element;
    if (!(target instanceof this.win.Element)) return;
    if (this.root?.contains(target)) return;
    if (target.closest?.("#zotero-items-tree")) return;
    this.close();
  };
  private readonly onResize = () => this.place();

  /** Called whenever the card closes for a reason other than a key. */
  onClosed: (() => void) | null = null;

  constructor(win: _ZoteroTypes.MainWindow) {
    this.win = win;
    this.doc = win.document;
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Open on the items list's focused row. Returns false if nothing to show. */
  open(): boolean {
    const item = this.currentItem();
    if (!item) return false;
    this.ensureDom();
    this.openState = true;
    this.subscribe();
    this.render(item);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.root!.hidden = false;
    this.place();
    // Next frame so the opacity transition runs.
    this.win.setTimeout(() => this.root?.classList.add("open"), 0);
    return true;
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unsubscribe();
    const root = this.root;
    if (root) {
      root.classList.remove("open");
      this.hideTimer = setTimeout(() => {
        if (!this.openState) root.hidden = true;
      }, FADE_MS);
    }
    this.onClosed?.();
  }

  /** Page the card's scrolling body. */
  scroll(direction: 1 | -1): void {
    const body = this.body;
    if (!body) return;
    body.scrollBy({ top: direction * body.clientHeight * 0.9 });
  }

  /** Open the shown item's first attachment (PDFs first), if any. */
  openFirstAttachment(): void {
    const first = this.model?.attachments[0];
    if (first) void this.win.ZoteroPane.viewAttachment(first.id);
  }

  destroy(): void {
    this.close();
    this.root?.remove();
    this.doc.getElementById(STYLE_ID)?.remove();
    this.root = null;
    this.body = null;
  }

  // --- selection and context ------------------------------------------------

  private currentItem(): Zotero.Item | null {
    const iv = this.win.ZoteroPane?.itemsView as any;
    if (!iv?.selection) return null;
    const index =
      iv.selection.count > 0 && iv.selection.isSelected(iv.selection.focused)
        ? iv.selection.focused
        : [...iv.selection.selected][0];
    if (index === undefined || index < 0) return null;
    const ref = iv.getRow(index)?.ref;
    return ref instanceof Zotero.Item ? ref : null;
  }

  private subscribe(): void {
    const zp = this.win.ZoteroPane as any;
    this.itemsView = zp.itemsView;
    this.itemsView?.onSelect?.addListener(this.onSelect);
    zp.collectionsView?.onSelect?.addListener(this.onCollectionSelect);
    this.win.addEventListener("mousedown", this.onWindowMouseDown, true);
    this.win.addEventListener("blur", this.onWindowBlur);
    this.win.addEventListener("focusin", this.onFocusIn, true);
    this.win.addEventListener("resize", this.onResize);
    this.notifierID = Zotero.Notifier.registerObserver(
      {
        notify: (event: string, type: string) => {
          if (type === "tab" && event === "select") this.close();
          else if (type === "item") this.queueRender();
        },
      },
      ["tab", "item"],
      "zotql-card",
    );
  }

  private unsubscribe(): void {
    const zp = this.win.ZoteroPane as any;
    this.itemsView?.onSelect?.removeListener(this.onSelect);
    this.itemsView = null;
    zp.collectionsView?.onSelect?.removeListener(this.onCollectionSelect);
    this.win.removeEventListener("mousedown", this.onWindowMouseDown, true);
    this.win.removeEventListener("blur", this.onWindowBlur);
    this.win.removeEventListener("focusin", this.onFocusIn, true);
    this.win.removeEventListener("resize", this.onResize);
    if (this.notifierID) Zotero.Notifier.unregisterObserver(this.notifierID);
    this.notifierID = null;
  }

  private queueRender(): void {
    if (this.renderQueued || !this.openState) return;
    this.renderQueued = true;
    // setTimeout, not rAF: a hidden window gets no animation frames.
    this.win.setTimeout(() => {
      this.renderQueued = false;
      if (!this.openState) return;
      // A different items view means a different collection: close.
      if ((this.win.ZoteroPane as any).itemsView !== this.itemsView) {
        this.close();
        return;
      }
      const item = this.currentItem();
      // Selection gone (item deleted, list emptied): nothing to show.
      if (item) this.render(item);
      else this.close();
    }, 0);
  }

  // --- data -----------------------------------------------------------------

  private toItemData(item: Zotero.Item): ItemData {
    // Child rows show their parent, with the child highlighted.
    let highlightId: number | undefined;
    let main = item;
    if ((item.isNote() || item.isAttachment()) && item.parentItem) {
      highlightId = item.id;
      main = item.parentItem;
    }
    const label = safe(() =>
      Zotero.ItemTypes.getLocalizedString(main.itemType),
    );

    if (main.isNote()) {
      const html = main.getNote();
      const title = main.getNoteTitle();
      const paras = htmlToParagraphs(html);
      if (paras[0] === title) paras.shift();
      return {
        id: main.id,
        itemType: "note",
        itemTypeLabel: label || "Note",
        fields: { title, abstractNote: paras.join("\n") },
        creators: [],
        attachments: [],
        notes: [],
      };
    }

    const fields: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = safe(() => String(main.getField(f as any, false, true) ?? ""));
      if (v) fields[f] = v;
    }

    const attachmentItems = main.isAttachment()
      ? [main]
      : Zotero.Items.get(main.getAttachments());
    const attachments: AttachmentData[] = attachmentItems.map((a) => ({
      id: a.id,
      title: safe(() => String(a.getField("title"))),
      contentType: a.attachmentContentType || "",
      linkMode: LINK_MODES[a.attachmentLinkMode] ?? "imported_file",
    }));

    const notes = main.isRegularItem()
      ? Zotero.Items.get(main.getNotes()).map((n) => ({
          id: n.id,
          html: n.getNote(),
        }))
      : [];

    const creators = main.getCreators().map((c: any) => ({
      creatorType: safe(() => Zotero.CreatorTypes.getName(c.creatorTypeID)),
      ...(c.fieldMode === 1
        ? { name: c.lastName }
        : { firstName: c.firstName, lastName: c.lastName }),
    }));

    let citationKey = safe(() => String(main.getField("citationKey" as any)));
    if (!citationKey) {
      citationKey = safe(
        () =>
          (Zotero as any).BetterBibTeX?.KeyManager?.get(main.id)?.citationKey ??
          "",
      );
    }

    return {
      id: main.id,
      itemType: main.itemType,
      itemTypeLabel: label,
      fields,
      creators,
      attachments,
      notes,
      citationKey,
      highlightId,
    };
  }

  // --- DOM ------------------------------------------------------------------

  private ensureDom(): void {
    if (this.root?.isConnected) return;
    const doc = this.doc;
    ensureStylesheet(doc);
    const root = this.el("div", "zotql-card");
    root.id = ROOT_ID;
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Quick Look");
    // Keep keyboard focus in the items list when the card is clicked.
    root.addEventListener("mousedown", (e) => e.preventDefault());
    this.body = this.el("div", "zotql-body");
    root.appendChild(this.body);
    doc.documentElement!.appendChild(root);
    this.root = root;
  }

  private place(): void {
    const root = this.root;
    if (!root) return;
    const anchor =
      this.doc.getElementById("zotero-layout-switcher") ??
      this.doc.documentElement!;
    const r = anchor.getBoundingClientRect();
    const width = Math.max(280, Math.min(640, r.width - 32));
    const maxHeight = Math.max(
      200,
      Math.min(r.height - 48, this.win.innerHeight * 0.7),
    );
    root.style.left = `${Math.round(r.left + (r.width - width) / 2)}px`;
    root.style.top = `${Math.round(r.top + 24)}px`;
    root.style.width = `${Math.round(width)}px`;
    root.style.maxHeight = `${Math.round(maxHeight)}px`;
  }

  private render(item: Zotero.Item): void {
    const model = buildCard(this.toItemData(item));
    const sameItem = this.model?.id === model.id;
    this.model = model;
    const body = this.body!;
    body.replaceChildren();

    const title = this.el("h1", "zotql-title");
    title.textContent = model.title;
    body.appendChild(title);

    if (model.authors.shown.length) {
      const p = this.el("p", "zotql-authors");
      p.textContent =
        model.authors.shown.join("; ") +
        (model.authors.hiddenCount
          ? `; … +${model.authors.hiddenCount} more`
          : "");
      body.appendChild(p);
    }

    if (model.venue || model.meta.length) {
      const p = this.el("p", "zotql-meta");
      if (model.venue) {
        const v = this.el("i", "zotql-venue");
        v.textContent = model.venue;
        p.appendChild(v);
      }
      if (model.meta.length) {
        p.appendChild(
          this.doc.createTextNode(
            (model.venue ? " · " : "") + model.meta.join(" · "),
          ),
        );
      }
      body.appendChild(p);
    }

    if (model.doiUrl || model.url) {
      const p = this.el("p", "zotql-links");
      if (model.doiUrl)
        p.appendChild(this.link(`doi:${model.doi}`, model.doiUrl));
      if (model.url && model.url !== model.doiUrl) {
        if (model.doiUrl) p.appendChild(this.doc.createTextNode(" · "));
        p.appendChild(this.link(shortUrl(model.url), model.url));
      }
      body.appendChild(p);
    }

    if (model.attachments.length) {
      const row = this.el("div", "zotql-attachments");
      for (const a of model.attachments) {
        const b = this.el("button", `zotql-att zotql-att-${a.kind}`);
        b.title = a.title;
        b.setAttribute("aria-label", `Open ${a.title}`);
        if (a.id === model.highlightId) b.classList.add("highlight");
        const icon = this.el("span", "zotql-att-icon");
        icon.textContent = KIND_LABEL[a.kind];
        const label = this.el("span", "zotql-att-label");
        label.textContent = a.title;
        b.append(icon, label);
        b.addEventListener("click", () => {
          void this.win.ZoteroPane.viewAttachment(a.id);
          this.close();
        });
        row.appendChild(b);
      }
      body.appendChild(row);
    }

    const abs = this.el("div", "zotql-abstract");
    if (model.abstract.length) {
      for (const para of model.abstract) {
        const p = this.el("p");
        p.textContent = para;
        abs.appendChild(p);
      }
    } else {
      abs.classList.add("empty");
      abs.textContent = "No abstract";
    }
    body.appendChild(abs);

    if (model.notes.length) {
      const ul = this.el("ul", "zotql-notes");
      for (const n of model.notes) {
        const li = this.el("li");
        li.textContent = n.firstLine;
        if (n.id === model.highlightId) li.classList.add("highlight");
        ul.appendChild(li);
      }
      if (model.moreNotes) {
        const li = this.el("li", "zotql-more");
        li.textContent = `+${model.moreNotes} more`;
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }

    const footer = this.el("p", "zotql-footer");
    footer.textContent = model.footer.join(" · ");
    body.appendChild(footer);

    if (!sameItem) body.scrollTop = 0;
  }

  private link(text: string, href: string): HTMLElement {
    const a = this.el("a", "zotql-link");
    a.textContent = text;
    a.setAttribute("href", href);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      Zotero.launchURL(href);
    });
    return a;
  }

  private el(tag: string, className?: string): HTMLElement {
    const e = this.doc.createElementNS(HTML_NS, tag) as HTMLElement;
    if (className) e.className = className;
    return e;
  }
}

/** Add zotQL's stylesheet (card and type-to-select indicator) once. */
export function ensureStylesheet(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const link = doc.createElementNS(HTML_NS, "link") as HTMLLinkElement;
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  // The query defeats Zotero's chrome cache, so a plugin reload or update
  // picks up the new stylesheet.
  link.href = `chrome://${addon.data.config.addonRef}/content/quicklook.css?${Date.now()}`;
  doc.documentElement!.appendChild(link);
}

const KIND_LABEL: Record<CardModel["attachments"][number]["kind"], string> = {
  pdf: "PDF",
  epub: "EPUB",
  snapshot: "HTML",
  link: "↗",
  file: "FILE",
};

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function safe(fn: () => string): string {
  try {
    return fn() || "";
  } catch {
    return "";
  }
}
