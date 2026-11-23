// Contract tests for src/modules/matcher.ts (PLAN.md, "Phase 2").
// Written by the orchestrator; implementers must not edit this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  wordsFrom,
  rowMatches,
  findMatch,
} from "../../src/modules/matcher.ts";

test("tokenize: lowercases, splits on whitespace, drops empties", () => {
  assert.deepEqual(tokenize("  Kuo   2010 "), ["kuo", "2010"]);
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("   "), []);
});

test("tokenize: folds diacritics", () => {
  assert.deepEqual(tokenize("Müller Ångström"), ["muller", "angstrom"]);
});

test("wordsFrom: splits display text on whitespace and punctuation", () => {
  assert.deepEqual(wordsFrom("Kuo, A. D."), ["kuo", "a", "d"]);
  assert.deepEqual(wordsFrom("2010-05-01"), ["2010", "05", "01"]);
  assert.deepEqual(wordsFrom("Energetics of walking: a (simple) model"), [
    "energetics",
    "of",
    "walking",
    "a",
    "simple",
    "model",
  ]);
});

test("wordsFrom: folds diacritics and keeps non-Latin letters", () => {
  assert.deepEqual(wordsFrom("Müller & Ñúñez"), ["muller", "nunez"]);
  assert.deepEqual(wordsFrom("步行 研究"), ["步行", "研究"]);
});

test("wordsFrom: empty or punctuation-only text gives no words", () => {
  assert.deepEqual(wordsFrom(""), []);
  assert.deepEqual(wordsFrom(" -- , "), []);
});

test("rowMatches: every token must prefix some word", () => {
  const words = ["dynamic", "walking", "kuo", "donelan", "2002"];
  assert.equal(rowMatches(["kuo"], words), true);
  assert.equal(rowMatches(["kuo", "2002"], words), true);
  assert.equal(rowMatches(["walk", "don"], words), true);
  assert.equal(rowMatches(["kuo", "2010"], words), false);
  assert.equal(rowMatches(["alking"], words), false); // prefix, not substring
});

test("rowMatches: order of tokens does not matter; one word may serve two tokens", () => {
  const words = ["kuo", "2002"];
  assert.equal(rowMatches(["2002", "kuo"], words), true);
  assert.equal(rowMatches(["k", "ku"], words), true);
});

test("rowMatches: no tokens never matches", () => {
  assert.equal(rowMatches([], ["anything"]), false);
});

const rows = [
  ["alpha", "smith", "1999"], // 0
  ["kuo", "walking", "2010"], // 1
  ["beta", "jones", "2010"], // 2
  ["kuo", "running", "2015"], // 3
  ["gamma", "smith", "2020"], // 4
];
const get = (i: number) => rows[i];

test("findMatch: searches forward from `from`, inclusive when asked", () => {
  assert.equal(findMatch(rows.length, get, ["kuo"], 1, 1, true), 1);
  assert.equal(findMatch(rows.length, get, ["kuo"], 1, 1, false), 3);
  assert.equal(findMatch(rows.length, get, ["kuo"], 2, 1, true), 3);
});

test("findMatch: wraps around the end and the start", () => {
  assert.equal(findMatch(rows.length, get, ["smith"], 4, 1, false), 0);
  assert.equal(findMatch(rows.length, get, ["kuo"], 1, -1, false), 3);
  assert.equal(findMatch(rows.length, get, ["smith"], 0, -1, false), 4);
});

test("findMatch: the only match is found again from itself only when inclusive", () => {
  assert.equal(findMatch(rows.length, get, ["jones"], 2, 1, true), 2);
  // exclusive search wraps all the way round back to the same row
  assert.equal(findMatch(rows.length, get, ["jones"], 2, 1, false), 2);
});

test("findMatch: multi-token queries", () => {
  assert.equal(findMatch(rows.length, get, ["kuo", "2015"], 0, 1, true), 3);
  assert.equal(findMatch(rows.length, get, ["2010", "jo"], 0, 1, true), 2);
});

test("findMatch: returns -1 when nothing matches, for empty lists, and for no tokens", () => {
  assert.equal(findMatch(rows.length, get, ["zzz"], 0, 1, true), -1);
  assert.equal(findMatch(0, get, ["kuo"], 0, 1, true), -1);
  assert.equal(findMatch(rows.length, get, [], 0, 1, true), -1);
});

test("findMatch: out-of-range or negative `from` is treated as 0 / clamped", () => {
  assert.equal(findMatch(rows.length, get, ["alpha"], -1, 1, true), 0);
  assert.equal(findMatch(rows.length, get, ["alpha"], 99, 1, true), 0);
});

test("findMatch: checks each row at most once", () => {
  let calls = 0;
  const counting = (i: number) => {
    calls++;
    return rows[i];
  };
  findMatch(rows.length, counting, ["zzz"], 2, 1, false);
  assert.ok(calls <= rows.length, `called ${calls} times`);
});
