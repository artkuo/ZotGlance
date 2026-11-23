// Prefix for zq-eval snippets: trusted key events + selection state.
// Usage: { cat scripts/dev/keyhelpers.js; echo "...your snippet..."; } | scripts/zq-eval.sh
const doc = win.document;
const iv = win.ZoteroPane.itemsView;
const vt = doc.getElementById("item-tree-main-default");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tip() {
  const t = Cc["@mozilla.org/text-input-processor;1"].createInstance(
    Ci.nsITextInputProcessor,
  );
  if (!t.beginInputTransactionForTests(win)) throw new Error("TIP busy");
  return t;
}
async function press(key, code, mods = {}) {
  const t = tip();
  const opts = { key, code };
  const KE = new win.KeyboardEvent("", opts);
  // modifiers via TIP
  const modKeys = [];
  if (mods.alt) modKeys.push(["Alt", "AltLeft"]);
  if (mods.meta) modKeys.push(["Meta", "MetaLeft"]);
  if (mods.shift) modKeys.push(["Shift", "ShiftLeft"]);
  for (const [k, c] of modKeys)
    t.keydown(new win.KeyboardEvent("", { key: k, code: c }));
  t.keydown(KE);
  t.keyup(KE);
  for (const [k, c] of modKeys.reverse())
    t.keyup(new win.KeyboardEvent("", { key: k, code: c }));
  await sleep(150);
}
const state = () => ({
  focused: iv.selection.focused,
  selected: [...iv.selection.selected],
  title: iv.getRow(iv.selection.focused)?.ref?.getDisplayTitle(),
  active: doc.activeElement?.id,
  sort: iv.getSortField(),
});
