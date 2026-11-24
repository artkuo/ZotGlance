// Contract tests for the "?" help card and punctuation keys in
// src/modules/keyState.ts (tasks/keyState-help.md).
// Written by the orchestrator; implementers must not edit this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_STATE,
  reduceKey,
  type KeyInput,
  type KeyOptions,
  type KeyState,
} from "../../src/modules/keyState.ts";

const OPTS: KeyOptions = { typeSelect: true, timeoutMs: 1500, cmdY: true };
const OFF: KeyOptions = { ...OPTS, typeSelect: false };

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
const QUESTION = k("?", "Slash", { shiftKey: true });
const SPACE = k(" ", "Space");
const ESC = k("Escape", "Escape");
const typed = (text: string, at: number): KeyState => ({
  ...INITIAL_STATE,
  typed: text,
  typedAt: at,
  lastQuery: text,
});
const help = (s: KeyState = INITIAL_STATE): KeyState => ({
  ...s,
  helpOpen: true,
});

// --- opening help --------------------------------------------------------

test("? opens help when not typing", () => {
  const r = reduceKey(INITIAL_STATE, QUESTION, 0, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [{ type: "openHelp" }]);
  assert.equal(r.state.helpOpen, true);
});

test("? closes the card first when it is open", () => {
  const r = reduceKey({ ...INITIAL_STATE, cardOpen: true }, QUESTION, 0, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [{ type: "closeCard" }, { type: "openHelp" }]);
  assert.equal(r.state.cardOpen, false);
  assert.equal(r.state.helpOpen, true);
});

test("? while typing is typed text, not help", () => {
  const r = reduceKey(typed("what", 0), QUESTION, 100, OPTS);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [{ type: "typed", text: "what?" }]);
  assert.equal(r.state.helpOpen, false);
});

test("? after the typing timeout opens help and clears the stale text", () => {
  const r = reduceKey(typed("kuo", 0), QUESTION, 5000, OPTS);
  assert.deepEqual(r.effects, [{ type: "openHelp" }]);
  assert.equal(r.state.typed, "");
  assert.equal(r.state.lastQuery, "kuo");
  assert.equal(r.state.helpOpen, true);
});

test("? with typeSelect off opens help unless Zotero's typing is mid-word", () => {
  const r = reduceKey(INITIAL_STATE, QUESTION, 0, OFF);
  assert.equal(r.handled, true);
  assert.deepEqual(r.effects, [{ type: "openHelp" }]);
  const mid = reduceKey(INITIAL_STATE, QUESTION, 0, OFF, {
    builtinTyping: true,
  });
  assert.equal(mid.handled, false);
  assert.deepEqual(mid.effects, []);
});

test("⌘? and ⌃? are not help (left to the system)", () => {
  for (const mods of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
    const r = reduceKey(
      INITIAL_STATE,
      k("?", "Slash", { shiftKey: true, ...mods }),
      0,
      OPTS,
    );
    assert.equal(r.state.helpOpen, false, JSON.stringify(mods));
    assert.ok(
      !r.effects.some((e) => e.type === "openHelp"),
      JSON.stringify(mods),
    );
  }
});

// --- closing help --------------------------------------------------------

test("?, Esc and Space close help and do nothing else", () => {
  for (const input of [
    QUESTION,
    ESC,
    SPACE,
    k(" ", "Space", { altKey: true }),
  ]) {
    const r = reduceKey(help(), input, 0, OPTS);
    assert.equal(r.handled, true, input.key);
    assert.deepEqual(r.effects, [{ type: "closeHelp" }], input.key);
    assert.equal(r.state.helpOpen, false, input.key);
    assert.equal(r.state.cardOpen, false, input.key);
  }
});

test("any other key closes help, then does its usual job", () => {
  const down = reduceKey(help(), k("ArrowDown", "ArrowDown"), 0, OPTS);
  assert.equal(down.handled, false);
  assert.deepEqual(down.effects, [{ type: "closeHelp" }]);
  assert.equal(down.state.helpOpen, false);

  const letter = reduceKey(help(), k("k", "KeyK"), 0, OPTS);
  assert.equal(letter.handled, true);
  assert.deepEqual(letter.effects, [
    { type: "closeHelp" },
    { type: "typed", text: "k" },
  ]);

  const cmdY = reduceKey(help(), k("y", "KeyY", { metaKey: true }), 0, OPTS);
  assert.deepEqual(cmdY.effects, [{ type: "closeHelp" }, { type: "openCard" }]);
  assert.equal(cmdY.state.cardOpen, true);
});

test("modifier-only keys leave help open", () => {
  const r = reduceKey(help(), k("Shift", "ShiftLeft"), 0, OPTS);
  assert.equal(r.handled, false);
  assert.deepEqual(r.effects, []);
  assert.equal(r.state.helpOpen, true);
});

// --- punctuation when not typing -----------------------------------------

test("+ and - reach Zotero (expand/collapse all) when not typing", () => {
  for (const input of [k("+", "Equal", { shiftKey: true }), k("-", "Minus")]) {
    const r = reduceKey(INITIAL_STATE, input, 0, OPTS);
    assert.equal(r.handled, false, input.key);
    assert.deepEqual(r.effects, [], input.key);
    assert.equal(r.state.typed, "", input.key);
  }
});

test("+ and - still type while typing (tier 2 splits on them)", () => {
  const r = reduceKey(typed("co", 0), k("-", "Minus"), 100, OPTS);
  assert.deepEqual(r.effects, [{ type: "typed", text: "co-" }]);
});

test("other punctuation doesn't start typing and is swallowed", () => {
  for (const key of [".", ",", "/", "'", "(", "=", "*"]) {
    const r = reduceKey(INITIAL_STATE, k(key, "Unidentified"), 0, OPTS);
    assert.equal(r.handled, true, key);
    assert.deepEqual(r.effects, [], key);
    assert.equal(r.state.typed, "", key);
  }
});

test("letters and digits, including non-Latin, still start typing", () => {
  for (const key of ["k", "K", "7", "é", "步"]) {
    const r = reduceKey(INITIAL_STATE, k(key, "Unidentified"), 0, OPTS);
    assert.deepEqual(r.effects, [{ type: "typed", text: key }], key);
  }
});

test("with typeSelect off, punctuation is left to Zotero", () => {
  const r = reduceKey(INITIAL_STATE, k(".", "Period"), 0, OFF);
  assert.equal(r.handled, false);
  assert.deepEqual(r.effects, []);
});
