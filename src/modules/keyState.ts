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
  helpOpen: boolean;
  typed: string; // current typed text ("" when not typing)
  typedAt: number; // time of the last typed key, ms
  lastQuery: string; // last non-empty typed text, kept after typing ends (for ⌘G)
}

export type Effect =
  | { type: "openCard" }
  | { type: "closeCard" }
  | { type: "openHelp" }
  | { type: "closeHelp" }
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
  helpOpen: false,
  typed: "",
  typedAt: 0,
  lastQuery: "",
};

const MODIFIER_KEYS = new Set([
  "Shift",
  "Alt",
  "Meta",
  "Control",
  "CapsLock",
  "OS",
]);

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

function openHelp(state: KeyState, effects: Effect[]): KeyState {
  if (state.helpOpen) return state;
  effects.push({ type: "openHelp" });
  return { ...state, helpOpen: true };
}

function closeHelp(state: KeyState, effects: Effect[]): KeyState {
  if (!state.helpOpen) return state;
  effects.push({ type: "closeHelp" });
  return { ...state, helpOpen: false };
}

function endTyping(
  state: KeyState,
  active: boolean,
  effects: Effect[],
): KeyState {
  if (state.typed === "") return state;
  const next = { ...state, typed: "", typedAt: 0 };
  if (active) effects.push({ type: "endTyping" });
  return next;
}

function clearStaleTyped(state: KeyState): KeyState {
  if (state.typed === "") return state;
  return { ...state, typed: "", typedAt: 0 };
}

const PRINTABLE_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

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

  const isSpace = input.code === "Space";
  const isQuestion = input.key === "?";

  // 1. Modifier-only keys.
  if (MODIFIER_KEYS.has(input.key)) {
    return { state, handled: false, effects: [] };
  }

  // 2. While help is open: ?, Esc, Space (any ⌥/⇧) close help and do nothing
  // else. Any other key closes help, then is handled as if help had been closed.
  if (next.helpOpen) {
    if (isQuestion || input.key === "Escape" || isSpace) {
      next = closeHelp(next, effects);
      return { state: next, handled: true, effects };
    }
    next = closeHelp(next, effects);
    // fall through with help closed; its effects precede the key's effects
  }

  // 3. ⌥Space: end typing, then toggle the card.
  if (isSpace && input.altKey) {
    next = endTyping(next, active, effects);
    next = toggleCard(next, effects);
    return { state: next, handled: true, effects };
  }

  // 4. ⇧Space: if typing it's a text space (rule 5). Otherwise if card open,
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
    // fall through to rule 5 when typing, or rule 14 when card closed
    if (!active) {
      next = endTyping(next, active, effects);
      return { state: next, handled: false, effects };
    }
  }

  // 5. Space (no alt/meta/ctrl).
  if (isSpace && !input.altKey && !input.metaKey && !input.ctrlKey) {
    if (options.typeSelect && active) {
      const text = next.typed + " ";
      next = { ...next, typed: text, typedAt: now, lastQuery: text };
      effects.push({ type: "typed", text });
      return { state: next, handled: true, effects };
    }
    if (!options.typeSelect && context?.builtinTyping) {
      return { state: next, handled: false, effects };
    }
    next = endTyping(next, active, effects);
    next = toggleCard(next, effects);
    return { state: next, handled: true, effects };
  }

  // 6. ⌘Y.
  if (
    input.metaKey &&
    input.key.toLowerCase() === "y" &&
    !input.ctrlKey &&
    !input.altKey
  ) {
    if (!options.cmdY) {
      return { state: next, handled: false, effects };
    }
    next = endTyping(next, active, effects);
    next = toggleCard(next, effects);
    return { state: next, handled: true, effects };
  }

  // 7. ⌘G / ⇧⌘G.
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
    return { state: next, handled: false, effects };
  }

  // 8. ⌘↓ when card open.
  if (input.metaKey && input.key === "ArrowDown") {
    if (next.cardOpen) {
      next = endTyping(next, active, effects);
      effects.push({ type: "openAttachment" });
      next = closeCard(next, effects);
      return { state: next, handled: true, effects };
    }
    return { state: next, handled: false, effects };
  }

  // 9. Escape.
  if (input.key === "Escape") {
    if (active) {
      next = endTyping(next, true, effects);
      return { state: next, handled: true, effects };
    }
    if (next.cardOpen) {
      next = closeCard(next, effects);
      return { state: next, handled: true, effects };
    }
    return { state: next, handled: false, effects };
  }

  // 10. Enter.
  if (input.key === "Enter") {
    if (active) {
      next = endTyping(next, true, effects);
      if (!next.cardOpen) {
        next = openCard(next, effects);
      }
      return { state: next, handled: true, effects };
    }
    return { state: next, handled: false, effects };
  }

  // 11. PageDown / PageUp while card open.
  if (next.cardOpen && (input.key === "PageDown" || input.key === "PageUp")) {
    effects.push({
      type: "scrollCard",
      direction: input.key === "PageDown" ? 1 : -1,
    });
    return { state: next, handled: true, effects };
  }

  // 12. Backspace while typing.
  if (input.key === "Backspace" && active) {
    const text = next.typed.slice(0, -1);
    if (text.length > 0) {
      next = { ...next, typed: text, typedAt: now, lastQuery: text };
      effects.push({ type: "typed", text });
    } else {
      next = endTyping(next, true, effects);
    }
    return { state: next, handled: true, effects };
  }

  // 13. Printable character (length === 1, no ⌘/⌃/⌥).
  if (
    input.key.length === 1 &&
    !input.metaKey &&
    !input.ctrlKey &&
    !input.altKey
  ) {
    if (options.typeSelect) {
      if (active) {
        const text = next.typed + input.key;
        next = { ...next, typed: text, typedAt: now, lastQuery: text };
        effects.push({ type: "typed", text });
        return { state: next, handled: true, effects };
      }

      // Not typing: ? opens help, +/- pass to Zotero, other punctuation is
      // swallowed, letters/digits start typing.
      if (isQuestion) {
        next = clearStaleTyped(next);
        if (next.cardOpen) next = closeCard(next, effects);
        next = openHelp(next, effects);
        return { state: next, handled: true, effects };
      }
      if (PRINTABLE_LETTER_OR_DIGIT.test(input.key)) {
        const text = input.key;
        next = { ...next, typed: text, typedAt: now, lastQuery: text };
        effects.push({ type: "typed", text });
        return { state: next, handled: true, effects };
      }
      if (input.key === "+" || input.key === "-") {
        next = clearStaleTyped(next);
        return { state: next, handled: false, effects };
      }
      next = clearStaleTyped(next);
      return { state: next, handled: true, effects };
    }

    // typeSelect off: only ? opens help (unless Zotero's own typing is mid-word).
    if (isQuestion) {
      if (context?.builtinTyping) {
        return { state: next, handled: false, effects };
      }
      if (next.cardOpen) next = closeCard(next, effects);
      next = openHelp(next, effects);
      return { state: next, handled: true, effects };
    }
  }

  // 14. Anything else: end typing if typing. Not handled.
  if (active) {
    next = endTyping(next, true, effects);
  } else if (next.typed !== "") {
    // Stale timed-out typed text: clear silently, keep lastQuery.
    next = { ...next, typed: "", typedAt: 0 };
  }
  return { state: next, handled: false, effects };
}
