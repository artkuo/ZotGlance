// Contract tests for tiered matching in src/modules/matcher.ts
// (PLAN.md, "Phase 2", "Tiered matching").
// Written by the orchestrator; implementers must not edit this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitLetterDigit,
  tierTokens,
  findTieredMatch,
} from "../../src/modules/matcher.ts";

test("splitLetterDigit: splits where letters meet digits", () => {
  assert.deepEqual(splitLetterDigit("jones2006"), ["jones", "2006"]);
  assert.deepEqual(splitLetterDigit("kuo2010walk"), ["kuo", "2010", "walk"]);
  assert.deepEqual(splitLetterDigit("2006jones"), ["2006", "jones"]);
  assert.deepEqual(splitLetterDigit("h2o"), ["h", "2", "o"]);
});

test("splitLetterDigit: a token with no boundary stays whole", () => {
  assert.deepEqual(splitLetterDigit("kuo"), ["kuo"]);
  assert.deepEqual(splitLetterDigit("2010"), ["2010"]);
});

test("splitLetterDigit: punctuation also separates and is dropped", () => {
  assert.deepEqual(splitLetterDigit("o'brien"), ["o", "brien"]);
  assert.deepEqual(splitLetterDigit("kuo,2010"), ["kuo", "2010"]);
  assert.deepEqual(splitLetterDigit("--"), []);
  assert.deepEqual(splitLetterDigit(""), []);
});

test("splitLetterDigit: non-Latin letters count as letters", () => {
  assert.deepEqual(splitLetterDigit("步行2010"), ["步行", "2010"]);
});

test("tierTokens: tier 1 is tokenize, tier 2 splits each token", () => {
  assert.deepEqual(tierTokens("Jones2006"), [["jones2006"], ["jones", "2006"]]);
  assert.deepEqual(tierTokens("kuo2010walk  dyn"), [
    ["kuo2010walk", "dyn"],
    ["kuo", "2010", "walk", "dyn"],
  ]);
});

test("tierTokens: tier 2 is left out when it equals tier 1", () => {
  assert.deepEqual(tierTokens("kuo 2010"), [["kuo", "2010"]]);
  assert.deepEqual(tierTokens("Müller"), [["muller"]]);
});

test("tierTokens: tier 2 is left out when it would be empty", () => {
  assert.deepEqual(tierTokens("--"), [["--"]]);
});

test("tierTokens: no tokens gives no tiers", () => {
  assert.deepEqual(tierTokens(""), []);
  assert.deepEqual(tierTokens("   "), []);
});

const rows = [
  ["water", "h2o", "smith", "1999"], // 0
  ["jones", "walking", "2006"], // 1
  ["kuo", "walking", "2010"], // 2
  ["jones2006", "dataset", "2021"], // 3
  ["h", "2", "o", "jones", "2006"], // 4
];
const get = (i: number) => rows[i];

test("findTieredMatch: tier 1 wins over a closer tier-2 match", () => {
  // From row 0, tier 2 (jones + 2006) would match row 1 first, but tier 1
  // ("jones2006" as typed) matches row 3, and a stricter tier always wins.
  assert.deepEqual(
    findTieredMatch(rows.length, get, tierTokens("jones2006"), 0, 1, true),
    { index: 3, tier: 0 },
  );
});

test("findTieredMatch: falls back to tier 2 only when tier 1 matches no row", () => {
  assert.deepEqual(
    findTieredMatch(rows.length, get, tierTokens("kuo2010"), 0, 1, true),
    { index: 2, tier: 1 },
  );
  assert.deepEqual(
    findTieredMatch(rows.length, get, tierTokens("kuo2010walk"), 0, 1, true),
    { index: 2, tier: 1 },
  );
});

test("findTieredMatch: tier 1 still matches mixed words as typed", () => {
  assert.deepEqual(
    findTieredMatch(rows.length, get, tierTokens("h2o"), 2, 1, true),
    { index: 0, tier: 0 },
  );
});

test("findTieredMatch: passes from, direction and inclusive through", () => {
  const tiers = tierTokens("walk2006");
  assert.deepEqual(findTieredMatch(rows.length, get, tiers, 1, 1, true), {
    index: 1,
    tier: 1,
  });
  // exclusive: no other row has both, so the search wraps back to row 1
  assert.deepEqual(findTieredMatch(rows.length, get, tiers, 1, 1, false), {
    index: 1,
    tier: 1,
  });
  assert.deepEqual(
    findTieredMatch(rows.length, get, tierTokens("jones"), 1, -1, false),
    { index: 4, tier: 0 },
  );
});

test("findTieredMatch: no match at any tier, or no tiers", () => {
  assert.deepEqual(
    findTieredMatch(rows.length, get, tierTokens("zzz9"), 0, 1, true),
    { index: -1, tier: -1 },
  );
  assert.deepEqual(findTieredMatch(rows.length, get, [], 0, 1, true), {
    index: -1,
    tier: -1,
  });
  assert.deepEqual(findTieredMatch(0, get, tierTokens("kuo"), 0, 1, true), {
    index: -1,
    tier: -1,
  });
});
