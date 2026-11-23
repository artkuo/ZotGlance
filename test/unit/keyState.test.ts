// Contract tests for src/modules/keyState.ts (PLAN.md, "Key handling";
// tasks/keyState.md). Written by the orchestrator; implementers must not
// edit this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OPTIONS,
  INITIAL_STATE,
  isTyping,
  reduceKey,
  type KeyInput,
  type KeyOptions,
  type KeyState,
} from "../../src/modules/keyState.ts";

const OPTS: KeyOptions = { typeSelect: true, timeoutMs: 1500, cmdY: true };

function k(
  key: string,
  code: string,
  mods: Partial<
    Pick<KeyInput, "altKey" | "metaKey" | "ctrlKey" | "shiftKey">
  > = {},
): KeyInput {
  return {
    key,
    code,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...mods,
  };
}
const SPACE = k(" ", "Space");
const letter = (c: string) =>
  k(c, c >= "0" && c <= "9" ? `Digit${c}` : `Key${c.toUpperCase()}`);

/** Feed a sequence of [key, time] and return the final result. */
function run(
  keys: [KeyInput, number][],
  start: KeyState = INITIAL_STATE,
  opts: KeyOptions = OPTS,
) {
  let state = start;
  let last;
  for (const [input, now] of keys) {
    last = reduceKey(state, input, now, opts);
    state = last.state;
  }
  return last!;
}
const typed = (text: string, at: number): KeyState => ({
  ...INITIAL_STATE,
  typed: text,
  typedAt: at,
  lastQuery: text,
});
const withCard = (s: KeyState = INITIAL_STATE): KeyState => ({
  ...s,
  cardOpen: true,
});

test("defaults", () => {
  assert.deepEqual(DEFAULT_OPTIONS, {
    typeSelect: true,
    timeoutMs: 1500,
    cmdY: true,
  });
  assert.deepEqual(INITIAL_STATE, {
    cardOpen: false,
    typed: "",
    typedAt: 0,
    lastQuery: "",
  });
});

test("isTyping: active strictly before the timeout", () => {
  const s = typed("kuo", 1000);
  assert.equal(isTyping(s, 1000, OPTS), true);
  assert.equal(isTyping(s, 2499, OPTS), true);
  assert.equal(isTyping(s, 2500, OPTS), false);
  assert.equal(isTyping(INITIAL_STATE, 0, OPTS), false);
});

test("Space toggles the card when not typing", () => {
  const open = reduceKey(INITIAL_STATE, SPACE, 0, OPTS);
  assert.equal(open.handled, true);
  assert.deepEqual(open.effects, [{ type: "openCard" }]);
  assert.equal(open.state.cardOpen, true);

  const close = reduceKey(open.state, SPACE, 10, OPTS);
  assert.equal(close.handled, true);
  assert.deepEqual(close.effects, [{ type: "closeCard" }]);
  assert.equal(close.state.cardOpen, false);
});

test("reduceKey does not mutate the input state", () => {
  const s = Object.freeze({ ...INITIAL_STATE });
  assert.doesNotThrow(() => reduceKey(s, SPACE, 0, OPTS));
  assert.deepEqual(s, INITIAL_STATE);
});

test("letters start typing and jump; more letters extend it", () => {
  const r1 = reduceKey(INITIAL_STATE, letter("k"), 100, OPTS);
  assert.equal(r1.handled, true);
  assert.deepEqual(r1.effects, [{ type: "typed", text: "k" }]);
  assert.equal(r1.state.typed, "k");
  assert.equal(r1.state.typedAt, 100);
  assert.equal(r1.state.lastQuery, "k");

  const r2 = run([
    [letter("k"), 100],
    [letter("u"), 200],
    [letter("o"), 300],
  ]);
  assert.deepEqual(r2.effects, [{ type: "typed", text: "kuo" }]);
  assert.equal(r2.state.typed, "kuo");
});

test("shifted letters and digits type; text keeps the case it was typed in", () => {
  const r = run([
    [k("K", "KeyK", { shiftKey: true }), 0],
    [letter("2"), 100],
  ]);
  assert.deepEqual(r.effects, [{ type: "typed", text: "K2" }]);
});

test("Space while typing is a text space", () => {
  const r = run([
    [letter("o"), 0],
    [letter("n"), 100],
    [SPACE, 200],
    [letter("m"), 300],
  ]);
  assert.equal(r.state.typed, "on m");
  assert.equal(r.state.cardOpen, false);
  const space = reduceKey(typed("on", 0), SPACE, 100, OPTS);
  assert.equal(space.handled, true);
  assert.deepEqual(space.effects, [{ type: "typed", text: "on " }]);
  assert.equal(space.state.typedAt, 100);
});

test("timer edges: Space at 1.49 s is text, at 1.51 s opens the card", () => {
  const before = reduceKey(typed("smith", 0), SPACE, 1490, OPTS);
  assert.deepEqual(before.effects, [{ type: "typed", text: "smith " }]);
  assert.equal(before.state.cardOpen, false);

  const after = reduceKey(typed("smith", 0), SPACE, 1510, OPTS);
  assert.deepEqual(after.effects, [{ type: "openCard" }]);
  assert.equal(after.state.cardOpen, true);
  assert.equal(after.state.typed, "");
  assert.equal(after.state.lastQuery, "smith");
});

test("a letter after the timeout starts fresh text", () => {
  const r = reduceKey(typed("smith", 0), letter("j"), 2000, OPTS);
  assert.deepEqual(r.effects, [{ type: "typed", text: "j" }]);
  assert.equal(r.state.lastQuery, "j");
});

test("Option-Space forces the card even mid-typing (matches on code, not key)", () => {
  const optSpace = k(" ", "Space", { altKey: true });
  const r = reduceKey(typed("kuo", 0), optSpace, 100, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [{ type: "endTyping" }, { type: "openCard" }]);
  assert.equal(r.state.typed, "");
  assert.equal(r.state.cardOpen, true);

  const close = reduceKey(withCard(), optSpace, 0, OPTS);
  assert.deepEqual(close.effects, [{ type: "closeCard" }]);
});

test("Cmd-Y toggles the card and ends typing; off when cmdY is false", () => {
  const cmdY = k("y", "KeyY", { metaKey: true });
  const r = reduceKey(typed("kuo", 0), cmdY, 100, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [{ type: "endTyping" }, { type: "openCard" }]);

  const close = reduceKey(withCard(), cmdY, 0, OPTS);
  assert.deepEqual(close.effects, [{ type: "closeCard" }]);

  const off = reduceKey(INITIAL_STATE, cmdY, 0, { ...OPTS, cmdY: false });
  assert.equal(off.handled, false);
  assert.deepEqual(off.effects, []);
});

test("Escape ends typing first, then closes the card, else passes", () => {
  const esc = k("Escape", "Escape");
  const r1 = reduceKey(withCard(typed("kuo", 0)), esc, 100, OPTS);
  assert.equal(r1.handled, true);
  assert.deepEqual(r1.effects, [{ type: "endTyping" }]);
  assert.equal(r1.state.cardOpen, true);

  const r2 = reduceKey(r1.state, esc, 200, OPTS);
  assert.equal(r2.handled, true);
  assert.deepEqual(r2.effects, [{ type: "closeCard" }]);

  const r3 = reduceKey(r2.state, esc, 300, OPTS);
  assert.equal(r3.handled, false);
  assert.deepEqual(r3.effects, []);
});

test("Enter ends typing and opens the card; otherwise passes to Zotero", () => {
  const enter = k("Enter", "Enter");
  const r = reduceKey(typed("kuo", 0), enter, 100, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [{ type: "endTyping" }, { type: "openCard" }]);

  const cardAlready = reduceKey(withCard(typed("kuo", 0)), enter, 100, OPTS);
  assert.deepEqual(cardAlready.effects, [{ type: "endTyping" }]);

  const idle = reduceKey(INITIAL_STATE, enter, 0, OPTS);
  assert.equal(idle.handled, false);
  assert.deepEqual(idle.effects, []);
});

test("arrows end typing and pass through; the card stays open", () => {
  const down = k("ArrowDown", "ArrowDown");
  const r = reduceKey(withCard(typed("kuo", 0)), down, 100, OPTS);
  assert.equal(r.handled, false);
  assert.deepEqual(r.effects, [{ type: "endTyping" }]);
  assert.equal(r.state.typed, "");
  assert.equal(r.state.cardOpen, true);

  const idle = reduceKey(withCard(), down, 0, OPTS);
  assert.equal(idle.handled, false);
  assert.deepEqual(idle.effects, []);
  assert.equal(idle.state.cardOpen, true);
});

test("+, -, left/right and Tab end typing and pass through", () => {
  for (const input of [
    k("+", "Equal", { shiftKey: true }),
    k("ArrowLeft", "ArrowLeft"),
    k("ArrowRight", "ArrowRight"),
    k("Tab", "Tab"),
  ]) {
    const r = reduceKey(typed("kuo", 0), input, 100, OPTS);
    // "+" is printable, so with typeSelect on it types; the others pass.
    if (input.key === "+") {
      assert.deepEqual(r.effects, [{ type: "typed", text: "kuo+" }]);
    } else {
      assert.equal(r.handled, false, input.key);
      assert.deepEqual(r.effects, [{ type: "endTyping" }], input.key);
    }
  }
  // When not typing, "-" with typeSelect off reaches Zotero (collapse all).
  const minus = reduceKey(INITIAL_STATE, k("-", "Minus"), 0, {
    ...OPTS,
    typeSelect: false,
  });
  assert.equal(minus.handled, false);
});

test("modifier-only keydowns change nothing and don't end typing", () => {
  const s = typed("kuo", 0);
  for (const key of ["Shift", "Alt", "Meta", "Control"]) {
    const r = reduceKey(s, k(key, `${key}Left`), 100, OPTS);
    assert.equal(r.handled, false, key);
    assert.deepEqual(r.effects, [], key);
    assert.equal(r.state.typed, "kuo", key);
  }
});

test("Cmd-G / Shift-Cmd-G find next/previous with the last query", () => {
  const cmdG = k("g", "KeyG", { metaKey: true });
  const r = reduceKey(typed("kuo", 0), cmdG, 100, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [
    { type: "findNext", text: "kuo", direction: 1 },
  ]);
  assert.equal(r.state.typed, "kuo");
  assert.equal(r.state.typedAt, 100);

  // Still works after typing timed out; restarts typing.
  const late = reduceKey(typed("kuo", 0), cmdG, 9000, OPTS);
  assert.deepEqual(late.effects, [
    { type: "findNext", text: "kuo", direction: 1 },
  ]);
  assert.equal(late.state.typed, "kuo");
  assert.equal(isTyping(late.state, 9001, OPTS), true);

  const back = reduceKey(
    typed("kuo", 0),
    k("G", "KeyG", { metaKey: true, shiftKey: true }),
    100,
    OPTS,
  );
  assert.deepEqual(back.effects, [
    { type: "findNext", text: "kuo", direction: -1 },
  ]);

  const none = reduceKey(INITIAL_STATE, cmdG, 0, OPTS);
  assert.equal(none.handled, false);
});

test("Backspace edits typed text and ends typing when empty", () => {
  const bs = k("Backspace", "Backspace");
  const r1 = reduceKey(typed("kuo", 0), bs, 100, OPTS);
  assert.equal(r1.handled, true);
  assert.deepEqual(r1.effects, [{ type: "typed", text: "ku" }]);
  assert.equal(r1.state.typedAt, 100);

  const r2 = reduceKey(typed("k", 0), bs, 100, OPTS);
  assert.equal(r2.handled, true);
  assert.deepEqual(r2.effects, [{ type: "endTyping" }]);
  assert.equal(r2.state.typed, "");

  const idle = reduceKey(INITIAL_STATE, bs, 0, OPTS);
  assert.equal(idle.handled, false);
});

test("Cmd-Down opens the attachment and closes the card only when it's open", () => {
  const cmdDown = k("ArrowDown", "ArrowDown", { metaKey: true });
  const r = reduceKey(withCard(), cmdDown, 0, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [
    { type: "openAttachment" },
    { type: "closeCard" },
  ]);
  assert.equal(r.state.cardOpen, false);

  const closed = reduceKey(INITIAL_STATE, cmdDown, 0, OPTS);
  assert.equal(closed.handled, false);
  assert.deepEqual(closed.effects, []);
});

test("PageUp/PageDown and Shift-Space scroll the open card", () => {
  const card = withCard();
  assert.deepEqual(
    reduceKey(card, k("PageDown", "PageDown"), 0, OPTS).effects,
    [{ type: "scrollCard", direction: 1 }],
  );
  assert.deepEqual(reduceKey(card, k("PageUp", "PageUp"), 0, OPTS).effects, [
    { type: "scrollCard", direction: -1 },
  ]);
  const shiftSpace = k(" ", "Space", { shiftKey: true });
  const s = reduceKey(card, shiftSpace, 0, OPTS);
  assert.equal(s.handled, true);
  assert.deepEqual(s.effects, [{ type: "scrollCard", direction: 1 }]);
  assert.equal(s.state.cardOpen, true);

  // Card closed: PageDown and Shift-Space pass to Zotero.
  assert.equal(
    reduceKey(INITIAL_STATE, k("PageDown", "PageDown"), 0, OPTS).handled,
    false,
  );
  assert.equal(reduceKey(INITIAL_STATE, shiftSpace, 0, OPTS).handled, false);

  // Shift-Space while typing is a text space.
  const t = reduceKey(typed("kuo", 0), shiftSpace, 100, OPTS);
  assert.deepEqual(t.effects, [{ type: "typed", text: "kuo " }]);
});

test("typing with the card open keeps it open (the card follows the jump)", () => {
  const r = reduceKey(withCard(), letter("k"), 0, OPTS);
  assert.deepEqual(r.effects, [{ type: "typed", text: "k" }]);
  assert.equal(r.state.cardOpen, true);
});

test("typeSelect off: letters pass to Zotero's built-in typing", () => {
  const off = { ...OPTS, typeSelect: false };
  const r = reduceKey(INITIAL_STATE, letter("k"), 0, off);
  assert.equal(r.handled, false);
  assert.deepEqual(r.effects, []);
  assert.equal(r.state.typed, "");
});

test("typeSelect off: Space defers to built-in typing when it is mid-word", () => {
  const off = { ...OPTS, typeSelect: false };
  const mid = reduceKey(INITIAL_STATE, SPACE, 0, off, { builtinTyping: true });
  assert.equal(mid.handled, false);
  assert.deepEqual(mid.effects, []);

  const idle = reduceKey(INITIAL_STATE, SPACE, 0, off, {
    builtinTyping: false,
  });
  assert.deepEqual(idle.effects, [{ type: "openCard" }]);
});

test("Ctrl- or Alt-letters are not typing: they end typing and pass", () => {
  for (const input of [
    k("k", "KeyK", { ctrlKey: true }),
    k("˚", "KeyK", { altKey: true }),
  ]) {
    const r = reduceKey(typed("kuo", 0), input, 100, OPTS);
    assert.equal(r.handled, false);
    assert.deepEqual(r.effects, [{ type: "endTyping" }]);
  }
});

test("stale typed text ends silently (no endTyping effect)", () => {
  const r = reduceKey(typed("kuo", 0), k("ArrowDown", "ArrowDown"), 5000, OPTS);
  assert.deepEqual(r.effects, []);
  assert.equal(r.state.typed, "");
  assert.equal(r.state.lastQuery, "kuo");
});
