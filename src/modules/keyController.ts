/**
 * The one capture-phase keydown listener (PLAN.md "Key handling";
 * NOTES.md "M1 results" 1).
 *
 * Zotero-facing half of the key handling. `keyState.ts` (pure) decides what
 * each key means; this file feeds it real events, only while the items list
 * has focus, and carries out the effects it returns.
 */
import {
  DEFAULT_OPTIONS,
  INITIAL_STATE,
  reduceKey,
  type Effect,
  type KeyOptions,
  type KeyState,
} from "./keyState";
import { QuickLook } from "./quickLook";
import { getPref } from "../utils/prefs";

/** The focusable element of the main items tree (Zotero 10). */
export const ITEMS_TREE_ID = "item-tree-main-default";

export class KeyController {
  readonly quickLook: QuickLook;
  private readonly win: _ZoteroTypes.MainWindow;
  private state: KeyState = INITIAL_STATE;
  private readonly onKeyDown = (e: KeyboardEvent) => this.handle(e);

  constructor(win: _ZoteroTypes.MainWindow) {
    this.win = win;
    this.quickLook = new QuickLook(win);
    // The card can also close on its own (click outside, tab change, ...).
    this.quickLook.onClosed = () => {
      this.state = { ...this.state, cardOpen: false };
    };
  }

  attach(): void {
    // On the window, capture phase: runs before Zotero's React handlers
    // and survives the items tree being re-rendered.
    this.win.addEventListener("keydown", this.onKeyDown, true);
  }

  detach(): void {
    this.win.removeEventListener("keydown", this.onKeyDown, true);
    this.quickLook.destroy();
  }

  private options(): KeyOptions {
    const timeout = Number(getPref("typeSelectTimeoutMs"));
    return {
      typeSelect: getPref("typeSelect") ?? DEFAULT_OPTIONS.typeSelect,
      timeoutMs: timeout > 0 ? timeout : DEFAULT_OPTIONS.timeoutMs,
      cmdY: getPref("cmdY") ?? DEFAULT_OPTIONS.cmdY,
    };
  }

  private handle(e: KeyboardEvent): void {
    const target = e.target as Element | null;
    if (!target || target.id !== ITEMS_TREE_ID) return;
    if (this.win.document.activeElement !== target) return;

    // Holding Space or ⌘Y must not make the card flicker.
    if (e.repeat && (e.code === "Space" || (e.metaKey && e.key === "y"))) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const tree = (this.win.ZoteroPane?.itemsView as any)?.tree;
    const result = reduceKey(
      this.state,
      {
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
      },
      Date.now(),
      this.options(),
      { builtinTyping: (tree?._typingString?.length ?? 0) > 0 },
    );
    this.state = result.state;
    if (result.handled) {
      e.preventDefault();
      e.stopPropagation();
    }
    for (const effect of result.effects) this.run(effect);
  }

  private run(effect: Effect): void {
    switch (effect.type) {
      case "openCard":
        if (!this.quickLook.open()) {
          // Nothing selected to show: keep the state honest.
          this.state = { ...this.state, cardOpen: false };
        }
        break;
      case "closeCard":
        this.quickLook.close();
        break;
      case "openAttachment":
        this.quickLook.openFirstAttachment();
        break;
      case "scrollCard":
        this.quickLook.scroll(effect.direction);
        break;
      case "typed":
      case "endTyping":
      case "findNext":
        // Phase 2 (M4): typeSelect.ts. Unreachable while typeSelect is off.
        break;
    }
  }
}
