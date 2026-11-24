// Contract tests for src/modules/itemCard.ts (PLAN.md, "The card";
// tasks/itemCard.md). Written by the orchestrator; implementers must not
// edit this file. Fixtures mirror scripts/dev/seed.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AUTHORS,
  MAX_NOTES,
  NOTE_LINE_MAX,
  attachmentKind,
  buildCard,
  formatCreator,
  htmlToParagraphs,
  noteFirstLine,
  venueOf,
  yearFrom,
  type ItemData,
} from "../../src/modules/itemCard.ts";

const au = (lastName: string, firstName?: string) => ({
  creatorType: "author",
  lastName,
  firstName,
});

function item(over: Partial<ItemData> = {}): ItemData {
  return {
    id: 1,
    itemType: "journalArticle",
    itemTypeLabel: "Journal Article",
    fields: {},
    creators: [],
    attachments: [],
    notes: [],
    ...over,
  };
}

test("constants", () => {
  assert.equal(MAX_AUTHORS, 8);
  assert.equal(MAX_NOTES, 3);
  assert.equal(NOTE_LINE_MAX, 120);
});

test("formatCreator: Last, initials", () => {
  assert.equal(formatCreator(au("Kuo", "Arthur D.")), "Kuo, A. D.");
  assert.equal(formatCreator(au("Donelan", "J. Maxwell")), "Donelan, J. M.");
  assert.equal(formatCreator(au("Sartre", "Jean-Paul")), "Sartre, J.-P.");
  assert.equal(formatCreator(au("Alexander", "R McNeill")), "Alexander, R. M.");
  assert.equal(formatCreator(au("Nobody")), "Nobody");
  assert.equal(formatCreator(au("  Kuo ", "  Art  ")), "Kuo, A.");
});

test("formatCreator: single-field names are used as is", () => {
  assert.equal(
    formatCreator({ creatorType: "author", name: "WHO Consortium" }),
    "WHO Consortium",
  );
});

test("yearFrom", () => {
  assert.equal(yearFrom("2010-03-15"), "2010");
  assert.equal(yearFrom("March 2005"), "2005");
  assert.equal(yearFrom("1999"), "1999");
  assert.equal(yearFrom("n.d."), "");
  assert.equal(yearFrom(""), "");
  assert.equal(yearFrom("12345"), "");
  assert.equal(yearFrom("vol 0999 in 2001"), "2001");
});

test("venueOf by item type, with fallbacks", () => {
  assert.equal(
    venueOf("journalArticle", { publicationTitle: "J Biomech" }),
    "J Biomech",
  );
  assert.equal(venueOf("bookSection", { bookTitle: "Handbook" }), "Handbook");
  assert.equal(venueOf("book", { publisher: "Example UP" }), "Example UP");
  assert.equal(venueOf("thesis", { university: "U of F" }), "U of F");
  assert.equal(venueOf("preprint", { repository: "bioRxiv" }), "bioRxiv");
  assert.equal(venueOf("conferencePaper", { conferenceName: "ISB" }), "ISB");
  assert.equal(
    venueOf("conferencePaper", {
      proceedingsTitle: "Proc ISB",
      conferenceName: "ISB",
    }),
    "Proc ISB",
  );
  assert.equal(venueOf("report", { institution: "NIH" }), "NIH");
  assert.equal(venueOf("webpage", { websiteTitle: "Example" }), "Example");
  assert.equal(venueOf("dataset", { publisher: "Zenodo" }), "Zenodo");
  assert.equal(venueOf("dataset", {}), "");
});

test("htmlToParagraphs: plain text splits on newlines", () => {
  assert.deepEqual(htmlToParagraphs("First para.\nSecond  para.\n\n"), [
    "First para.",
    "Second para.",
  ]);
  assert.deepEqual(htmlToParagraphs(""), []);
});

test("htmlToParagraphs: strips tags, keeps text, decodes entities", () => {
  assert.deepEqual(
    htmlToParagraphs(
      "<p>Abstract with <i>inline HTML</i> and H<sub>2</sub>O &amp; more.</p><p>Second&nbsp;one &#945; &#x3b2; &lt;x&gt; &quot;q&quot; &#39;s&apos;</p>",
    ),
    [
      "Abstract with inline HTML and H2O & more.",
      "Second one α β <x> \"q\" 's'",
    ],
  );
  assert.deepEqual(
    htmlToParagraphs("<h1>Key result</h1><p>Uneven terrain.</p>"),
    ["Key result", "Uneven terrain."],
  );
  assert.deepEqual(htmlToParagraphs("a<br>b<br/>c"), ["a", "b", "c"]);
});

test("noteFirstLine: first paragraph, truncated with an ellipsis", () => {
  assert.equal(
    noteFirstLine("<h1>Key result</h1><p>Uneven terrain costs more.</p>"),
    "Key result",
  );
  assert.equal(noteFirstLine("<p></p><p>  </p>"), "");
  const long = "word ".repeat(40);
  const line = noteFirstLine(`<p>${long}</p>`);
  assert.equal(line.endsWith("…"), true);
  assert.ok(line.length <= NOTE_LINE_MAX);
  assert.equal(line.slice(0, -1), line.slice(0, -1).trimEnd());
});

test("attachmentKind", () => {
  const a = (contentType: string, linkMode = "imported_file") =>
    ({ id: 1, title: "", contentType, linkMode }) as never;
  assert.equal(attachmentKind(a("application/pdf")), "pdf");
  assert.equal(attachmentKind(a("application/epub+zip")), "epub");
  assert.equal(attachmentKind(a("text/html", "imported_url")), "snapshot");
  assert.equal(attachmentKind(a("", "linked_url")), "link");
  assert.equal(attachmentKind(a("text/html", "linked_url")), "link");
  assert.equal(attachmentKind(a("image/png")), "file");
});

test("buildCard: full journal article", () => {
  const card = buildCard(
    item({
      id: 42,
      fields: {
        title: " Energetic cost of walking on uneven terrain ",
        publicationTitle: "Journal of Fixture Biomechanics",
        date: "2010-03-15",
        volume: "43",
        issue: "7",
        pages: "1234-1241",
        DOI: "https://doi.org/10.0000/fixture.2010.001",
        url: "https://example.org/fixture/2010-001",
        abstractNote: "We study a model.\nIt works.",
      },
      creators: [
        au("Kuo", "Arthur D."),
        au("Donelan", "J. Maxwell"),
        { creatorType: "editor", lastName: "Ed", firstName: "Itor" },
      ],
      attachments: [
        {
          id: 3,
          title: "Publisher page",
          contentType: "",
          linkMode: "linked_url",
        },
        {
          id: 2,
          title: "Full Text PDF",
          contentType: "application/pdf",
          linkMode: "imported_file",
        },
      ],
      notes: [
        { id: 10, html: "<h1>Key result</h1><p>x</p>" },
        { id: 11, html: "<p>Method note.</p>" },
        { id: 12, html: "<p></p>" },
        { id: 13, html: "<p>Third.</p>" },
        { id: 14, html: "<p>Fourth.</p>" },
      ],
      citationKey: "kuo2010energetic",
    }),
  );
  assert.equal(card.id, 42);
  assert.equal(card.title, "Energetic cost of walking on uneven terrain");
  assert.deepEqual(card.authors, {
    shown: ["Kuo, A. D.", "Donelan, J. M."],
    hiddenCount: 0,
  });
  assert.equal(card.venue, "Journal of Fixture Biomechanics");
  assert.deepEqual(card.meta, ["2010", "43(7)", "1234–1241"]);
  assert.equal(card.doi, "10.0000/fixture.2010.001");
  assert.equal(card.doiUrl, "https://doi.org/10.0000/fixture.2010.001");
  assert.equal(card.url, "https://example.org/fixture/2010-001");
  assert.deepEqual(card.abstract, ["We study a model.", "It works."]);
  assert.deepEqual(card.attachments, [
    { id: 2, title: "Full Text PDF", kind: "pdf" },
    { id: 3, title: "Publisher page", kind: "link" },
  ]);
  assert.deepEqual(card.notes, [
    { id: 10, firstLine: "Key result" },
    { id: 11, firstLine: "Method note." },
    { id: 13, firstLine: "Third." },
  ]);
  assert.equal(card.moreNotes, 1);
  assert.deepEqual(card.footer, ["Journal Article", "kuo2010energetic"]);
  assert.equal(card.highlightId, null);
});

test("buildCard: 40 authors are truncated to MAX_AUTHORS", () => {
  const creators = Array.from({ length: 40 }, (_, i) =>
    au(`Author${i + 1}`, `A${i + 1}.`),
  );
  const card = buildCard(item({ creators }));
  assert.equal(card.authors.shown.length, MAX_AUTHORS);
  assert.equal(card.authors.shown[0], "Author1, A.");
  assert.equal(card.authors.hiddenCount, 32);
});

test("buildCard: no authors falls back to all creators", () => {
  const card = buildCard(
    item({
      creators: [{ creatorType: "editor", lastName: "Ed", firstName: "Itor" }],
    }),
  );
  assert.deepEqual(card.authors.shown, ["Ed, I."]);
});

test("buildCard: minimal item (no abstract, no fields)", () => {
  const card = buildCard(item({ fields: { date: "1999" } }));
  assert.equal(card.title, "(untitled)");
  assert.deepEqual(card.authors, { shown: [], hiddenCount: 0 });
  assert.equal(card.venue, "");
  assert.deepEqual(card.meta, ["1999"]);
  assert.equal(card.doi, "");
  assert.equal(card.doiUrl, "");
  assert.equal(card.url, "");
  assert.deepEqual(card.abstract, []);
  assert.deepEqual(card.attachments, []);
  assert.deepEqual(card.notes, []);
  assert.equal(card.moreNotes, 0);
  assert.deepEqual(card.footer, ["Journal Article"]);
});

test("buildCard: volume/issue variants and DOI from extra", () => {
  assert.deepEqual(buildCard(item({ fields: { volume: "43" } })).meta, ["43"]);
  assert.deepEqual(buildCard(item({ fields: { issue: "7" } })).meta, ["(7)"]);
  const fromExtra = buildCard(
    item({ fields: { extra: "PMID: 123\nDOI: doi:10.1/abc\nfoo" } }),
  );
  assert.equal(fromExtra.doi, "10.1/abc");
  assert.equal(
    buildCard(item({ fields: { DOI: "http://dx.doi.org/10.2/X" } })).doi,
    "10.2/X",
  );
});

test("buildCard: book, thesis, preprint venues; highlight passes through", () => {
  assert.equal(
    buildCard(item({ itemType: "book", fields: { publisher: "Example UP" } }))
      .venue,
    "Example UP",
  );
  assert.equal(
    buildCard(item({ itemType: "thesis", fields: { university: "U of F" } }))
      .venue,
    "U of F",
  );
  const pre = buildCard(
    item({
      itemType: "preprint",
      fields: { repository: "bioRxiv" },
      highlightId: 7,
    }),
  );
  assert.equal(pre.venue, "bioRxiv");
  assert.equal(pre.highlightId, 7);
});

test("buildCard: attachment ordering is by kind then input order; embedded images dropped", () => {
  const card = buildCard(
    item({
      attachments: [
        {
          id: 1,
          title: "",
          contentType: "image/png",
          linkMode: "imported_file",
        },
        {
          id: 2,
          title: "Snap",
          contentType: "text/html",
          linkMode: "imported_url",
        },
        {
          id: 3,
          title: "B",
          contentType: "application/pdf",
          linkMode: "imported_file",
        },
        {
          id: 4,
          title: "img",
          contentType: "image/png",
          linkMode: "embedded_image",
        },
        {
          id: 5,
          title: "Book",
          contentType: "application/epub+zip",
          linkMode: "imported_file",
        },
        {
          id: 6,
          title: "A",
          contentType: "application/pdf",
          linkMode: "linked_file",
        },
      ],
    }),
  );
  assert.deepEqual(
    card.attachments.map((a) => [a.id, a.kind, a.title]),
    [
      [3, "pdf", "B"],
      [6, "pdf", "A"],
      [5, "epub", "Book"],
      [2, "snapshot", "Snap"],
      [1, "file", "Attachment"],
    ],
  );
});

// --- M3: a highlighted note is always shown (tasks/itemCard-highlight.md) ---

const notes5 = [
  { id: 10, html: "<p>One</p>" },
  { id: 11, html: "<p>Two</p>" },
  { id: 12, html: "<p></p>" },
  { id: 13, html: "<p>Three</p>" },
  { id: 14, html: "<p>Four</p>" },
  { id: 15, html: "<p>Five</p>" },
];

test("highlighted note within the first MAX_NOTES: unchanged", () => {
  const card = buildCard(item({ notes: notes5, highlightId: 11 }));
  assert.deepEqual(
    card.notes.map((n) => n.id),
    [10, 11, 13],
  );
  assert.equal(card.moreNotes, 2);
});

test("highlighted note past MAX_NOTES replaces the last slot", () => {
  const card = buildCard(item({ notes: notes5, highlightId: 15 }));
  assert.deepEqual(
    card.notes.map((n) => [n.id, n.firstLine]),
    [
      [10, "One"],
      [11, "Two"],
      [15, "Five"],
    ],
  );
  assert.equal(card.notes.length, MAX_NOTES);
  assert.equal(card.moreNotes, 2);
});

test("highlighted empty note, or an attachment id, changes nothing", () => {
  const empty = buildCard(item({ notes: notes5, highlightId: 12 }));
  assert.deepEqual(
    empty.notes.map((n) => n.id),
    [10, 11, 13],
  );
  assert.equal(empty.moreNotes, 2);
  const other = buildCard(item({ notes: notes5, highlightId: 999 }));
  assert.deepEqual(
    other.notes.map((n) => n.id),
    [10, 11, 13],
  );
});
