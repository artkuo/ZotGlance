/**
 * Pure key-handling state machine for the zotQL items list (PLAN.md, "Key
 * handling"). It is pure — no Zotero, toolkit or DOM imports — so the logic
 * can be unit-tested under `node --test` (`test/unit/keyState.test.ts`).
 * `keyController.ts` calls it on every `keydown` and carries out the effects
 * it returns. PLAN.md's key table is the specification.
 */

export interface KeyInput {
  key: string; // KeyboardEvent.key
  code: string; // KeyboardEvent.code
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface KeyOptions {
  typeSelect: boolean; // phase 2 type-to-select on (false = leave typing to Zotero)
  timeoutMs: number; // typing ends this long after the last typed key (default 1500)
  cmdY: boolean; // ⌘Y toggles the card
}

export interface KeyContext {
  /** Zotero's own type-to-select is mid-word (only used when typeSelect is false). */
  builtinTyping?: boolean;
}

export interface KeyState {
  cardOpen: boolean;
  typed: string; // current typed text ("" when not typing)
  typedAt: number; // time of the last typed key, ms
  lastQuery: string; // last non-empty typed text, kept after typing ends (for ⌘G)
}

export type Effect =
  | { type: "openCard" }
  | { type: "closeCard" }
  | { type: "typed"; text: string } // typed text changed: show indicator, jump to first match from the focused row (inclusive)
  | { type: "endTyping" } // hide indicator
  | { type: "findNext"; text: string; direction: 1 | -1 } // jump to next/prev match (exclusive of focused row)
  | { type: "openAttachment" } // open the card item's first attachment
  | { type: "scrollCard"; direction: 1 | -1 }; // page the card's abstract

export interface KeyResult {
  state: KeyState;
  handled: boolean; // true -> controller calls preventDefault() + stopPropagation()
  effects: Effect[]; // in order
}

export const DEFAULT_OPTIONS: KeyOptions = {
  typeSelect: true,
  timeoutMs: 1500,
  cmdY: true,
};

export const INITIAL_STATE: KeyState = {
  cardOpen: false,
  typed: "",
  typedAt: 0,
  lastQuery: "",
};

const MODIFIER_KEYS = new Set(["Shift", "Alt", "Meta", "Control", "CapsLock", "OS"]);

/** Typing is active when typed !== "" and now - typedAt < timeoutMs. */
export function isTyping(
  state: KeyState,
  now: number,
  options: KeyOptions,
): boolean {
  return state.typed !== "" && now - state.typedAt < options.timeoutMs;
}

function openCard(state: KeyState, effects: Effect[]): KeyState {
  if (state.cardOpen) return state;
  effects.push({ type: "openCard" });
  return { ...state, cardOpen: true };
}

function closeCard(state: KeyState, effects: Effect[]): KeyState {
  if (!state.cardOpen) return state;
  effects.push({ type: "closeCard" });
  return { ...state, cardOpen: false };
}

function toggleCard(state: KeyState, effects: Effect[]): KeyState {
  return state.cardOpen ? closeCard(state, effects) : openCard(state, effects);
}

function endTyping(state: KeyState, active: boolean, effects: Effect[]): KeyState {
  if (state.typed === "") return state;
  const next = { ...state, typed: "", typedAt: 0 };
  if (active) effects.push({ type: "endTyping" });
  return next;
}

export function reduceKey(
  state: KeyState,
  input: KeyInput,
  now: number,
  options: KeyOptions,
  context?: KeyContext,
): KeyResult {
  const active = isTyping(state, now, options);
  const effects: Effect[] = [];
  let next: KeyState = state;
  let handled = false;

  const isSpace = input.code === "Space";

  // 1. Modifier-only keys.
  if (MODIFIER_KEYS.has(input.key)) {
    return { state, handled: false, effects: [] };
  }

  // 2. ⌥Space: end typing, then toggle the card.
  if (isSpace && input.altKey) {
    next = endTyping(next, active, effects);
    next = toggleCard(next, effects);
    return { state: next, handled: true, effects };
  }

  // 3. ⇧Space: if typing it's a text space (rule 4). Otherwise if card open,
  // scroll the card. Otherwise not handled.
  if (
    isSpace &&
    input.shiftKey &&
    !input.altKey &&
    !input.metaKey &&
    !input.ctrlKey
  ) {
    if (!active && next.cardOpen) {
      effects.push({ type: "scrollCard", direction: 1 });
      return { state: next, handled: true, effects };
    }
    // fall through to rule 4 when typing, or rule 13 when card closed
    if (!active) {
      next = endTyping(next, active, effects);
      return { state: next, handled: false, effects };
    }
  }

  // 4. Space (no alt/meta/ctrl).
  if (isSpace && !input.altKey && !input.metaKey && !input.ctrlKey) {
    if (options.typeSelect && active) {
      const text = next.typed + " ";
      next = { ...next, typed: text, typedAt: now, lastQuery: text };
      effects.push({ type: "typed", text });
      return { state: next, handled: true, effects };
    }
    if (!options.typeSelect && context?.builtinTyping) {
      return { state: next, handled: false, effects: [] };
    }
    next = endTyping(next, active, effects);
    next = toggleCard(next, effects);
    return { state: next, handled: true, effects };
  }

  // 5. ⌘Y.
  if (input.metaKey && input.key.toLowerCase() === "y" && !input.ctrlKey && !input.altKey) {
    if (!options.cmdY) {
      return { state, handled: false, effects: [] };
    }
    next = endTyping(next, active, effects);
    next = toggleCard(next, effects);
    return { state: next, handled: true, effects };
  }

  // 6. ⌘G / ⇧⌘G.
  if (input.metaKey && input.key.toLowerCase() === "g") {
    if (options.typeSelect && next.lastQuery !== "") {
      const text = next.lastQuery;
      next = { ...next, typed: text, typedAt: now };
      effects.push({
        type: "findNext",
        text,
        direction: input.shiftKey ? -1 : 1,
      });
      return { state: next, handled: true, effects };
    }
    return { state, handled: false, effects: [] };
  }

  // 7. ⌘↓ when card open.
  if (input.metaKey && input.key === "ArrowDown") {
    if (next.cardOpen) {
      next = endTyping(next, active, effects);
      effects.push({ type: "openAttachment" });
      next = closeCard(next, effects);
      return { state: next, handled: true, effects };
    }
    return { state, handled: false, effects: [] };
  }

  // 8. Escape.
  if (input.key === "Escape") {
    if (active) {
      next = endTyping(next, true, effects);
      return { state: next, handled: true, effects };
    }
    if (next.cardOpen) {
      next = closeCard(next, effects);
      return { state: next, handled: true, effects };
    }
    return { state, handled: false, effects: [] };
  }

  // 9. Enter.
  if (input.key === "Enter") {
    if (active) {
      next = endTyping(next, true, effects);
      if (!next.cardOpen) {
        next = openCard(next, effects);
      }
      return { state: next, handled: true, effects };
    }
    return { state, handled: false, effects: [] };
  }

  // 10. PageDown / PageUp while card open.
  if (next.cardOpen && (input.key === "PageDown" || input.key === "PageUp")) {
    effects.push({
      type: "scrollCard",
      direction: input.key === "PageDown" ? 1 : -1,
    });
    return { state: next, handled: true, effects };
  }

  // 11. Backspace while typing.
  if (input.key === "Backspace" && active) {
    const text = next.typed.slice(0, -1);
    if (text.length > 0) {
      next = { ...next, typed: text, typedAt: now };
      effects.push({ type: "typed", text });
    } else {
      next = endTyping(next, true, effects);
    }
    return { state: next, handled: true, effects };
  }

  // 12. Printable character when typeSelect.
  if (
    options.typeSelect &&
    input.key.length === 1 &&
    !input.metaKey &&
    !input.ctrlKey &&
    !input.altKey
  ) {
    const text = active ? next.typed + input.key : input.key;
    next = { ...next, typed: text, typedAt: now, lastQuery: text };
    effects.push({ type: "typed", text });
    return { state: next, handled: true, effects };
  }

  // 13. Anything else: end typing if typing. Not handled.
  if (active) {
    next = endTyping(next, true, effects);
  } else if (next.typed !== "") {
    // Stale timed-out typed text: clear silently, keep lastQuery.
    next = { ...next, typed: "", typedAt: 0 };
  }
  return { state: next, handled: false, effects };
}