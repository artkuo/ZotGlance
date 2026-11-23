// Seed the DEV library with fixture items. Run with:
//   scripts/zq-eval.sh < scripts/dev/seed.js
// Idempotent: does nothing if the "zotQL fixtures" collection exists.
// All content is invented test data.

const LIB = Zotero.Libraries.userLibraryID;
const COLL = "zotQL fixtures";
const existing = Zotero.Collections.getByLibrary(LIB).find(
  (c) => c.name === COLL,
);
if (existing) return { skipped: true, collection: existing.id };

const coll = new Zotero.Collection({ libraryID: LIB, name: COLL });
await coll.saveTx();

const lorem =
  "We study how a simple model explains the energetic cost of a task. " +
  "A compact mechanism accounts for most of the observed variation, and " +
  "predictions agree with measurements across a range of speeds. ";

async function make(type, fields, creators = [], extra = {}) {
  const item = new Zotero.Item(type);
  item.libraryID = LIB;
  for (const [k, v] of Object.entries(fields)) item.setField(k, v);
  item.setCreators(creators);
  item.addToCollection(coll.id);
  await item.saveTx();
  for (const html of extra.notes || []) {
    const n = new Zotero.Item("note");
    n.libraryID = LIB;
    n.parentID = item.id;
    n.setNote(html);
    await n.saveTx();
  }
  return item;
}
const au = (lastName, firstName) => ({
  lastName,
  firstName,
  creatorType: "author",
});

const made = [];

// 1. Journal article: full metadata, 3 child notes + more (for "+N more").
const ja = await make(
  "journalArticle",
  {
    title: "Energetic cost of walking on uneven terrain",
    publicationTitle: "Journal of Fixture Biomechanics",
    date: "2010-03-15",
    volume: "43",
    issue: "7",
    pages: "1234-1241",
    DOI: "10.0000/fixture.2010.001",
    url: "https://example.org/fixture/2010-001",
    abstractNote: lorem.repeat(6),
  },
  [au("Kuo", "Arthur D."), au("Donelan", "J. Maxwell"), au("Smith", "Jane")],
  {
    notes: [
      "<h1>Key result</h1><p>Uneven terrain costs about 28% more.</p>",
      "<p>Method note: treadmill with blocks.</p>",
      "<p>Follow up on step width variability.</p>",
      "<p>Fourth note, should be hidden behind +N more.</p>",
    ],
  },
);
made.push(ja.id);

// 1b. A small PDF attachment and a link attachment on the journal article.
const pdfPath = PathUtils.join(PathUtils.tempDir, "zotql-fixture.pdf");
const pdf =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R" +
  "/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
  "4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 72 700 Td (zotQL fixture) Tj ET\nendstream endobj\n" +
  "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
  "trailer<</Root 1 0 R>>\n%%EOF\n";
await IOUtils.writeUTF8(pdfPath, pdf);
await Zotero.Attachments.importFromFile({
  file: pdfPath,
  parentItemID: ja.id,
  title: "Full Text PDF",
});
await Zotero.Attachments.linkFromURL({
  url: "https://example.org/fixture/2010-001",
  parentItemID: ja.id,
  title: "Publisher page",
});

// 2. Journal article with 40 authors (et al. truncation).
const many = [];
for (let i = 1; i <= 40; i++) many.push(au(`Author${i}`, `A${i}.`));
made.push(
  (
    await make(
      "journalArticle",
      {
        title: "A forty-author consortium study of gait",
        publicationTitle: "Fixture Consortium Reports",
        date: "2021",
        abstractNote: lorem,
      },
      many,
    )
  ).id,
);

// 3. Book.
made.push(
  (
    await make(
      "book",
      {
        title: "Principles of Fixture Locomotion",
        publisher: "Example University Press",
        place: "Calgary",
        date: "2005",
        abstractNote: lorem.repeat(2),
      },
      [au("Alexander", "R. McNeill")],
    )
  ).id,
);

// 4. Thesis.
made.push(
  (
    await make(
      "thesis",
      {
        title: "Optimization of stepping in an invented model",
        university: "University of Fixtures",
        thesisType: "PhD thesis",
        date: "2018",
        abstractNote: lorem.repeat(3),
      },
      [au("Osman", "Kim")],
    )
  ).id,
);

// 5. Preprint.
made.push(
  (
    await make(
      "preprint",
      {
        title: "Preprint on fixture dynamics of running",
        repository: "bioRxiv",
        archiveID: "2024.01.01.000001",
        date: "2024-01-02",
        DOI: "10.0000/fixture.preprint.1",
        abstractNote: lorem,
      },
      [au("Seethapathi", "Nidhi"), au("Kuo", "Arthur D.")],
    )
  ).id,
);

// 6. No abstract, minimal fields.
made.push(
  (
    await make(
      "journalArticle",
      { title: "An item with no abstract", date: "1999" },
      [au("Nobody", "N.")],
    )
  ).id,
);

// 7. HTML in abstract and a very long title.
made.push(
  (
    await make(
      "journalArticle",
      {
        title:
          "A very long title that keeps going to test wrapping in the Quick Look card " +
          "and how the layout behaves when the title spans three or more lines of text",
        publicationTitle: "Proceedings of the Society for Fixtures",
        date: "2015",
        abstractNote:
          "<p>Abstract with <i>inline HTML</i> and Greek letters α β and H<sub>2</sub>O.</p>",
      },
      [au("Long", "Title")],
    )
  ).id,
);

// 8. Standalone note and standalone link attachment.
const sn = new Zotero.Item("note");
sn.libraryID = LIB;
sn.setNote("<h1>Standalone note</h1><p>Some loose thoughts.</p>");
sn.addToCollection(coll.id);
await sn.saveTx();
made.push(sn.id);

// 9. Filler rows for type-to-select: varied authors, years, titles.
const surnames = [
  "Adams",
  "Brown",
  "Chen",
  "Davis",
  "Evans",
  "Fischer",
  "Garcia",
  "Hughes",
  "Ito",
  "Jensen",
  "Kim",
  "Lopez",
  "Miller",
  "Nguyen",
  "Okafor",
  "Patel",
  "Quinn",
  "Rossi",
  "Silva",
  "Tanaka",
  "Ueda",
  "Varga",
  "Wong",
  "Xu",
  "Young",
  "Zhang",
  "Kuo",
  "Smith",
  "Smithson",
  "Kumar",
];
const topics = [
  "metabolic cost",
  "step width",
  "balance control",
  "ankle push-off",
  "collision losses",
  "pendulum dynamics",
  "muscle efficiency",
  "gait speed",
  "terrain variability",
  "trajectory optimization",
];
for (let i = 0; i < surnames.length; i++) {
  const year = String(1990 + ((i * 7) % 35));
  made.push(
    (
      await make(
        "journalArticle",
        {
          title: `On ${topics[i % topics.length]} in human walking, part ${i + 1}`,
          publicationTitle: i % 2 ? "Fixture Journal A" : "Fixture Journal B",
          date: year,
          abstractNote: i % 3 ? lorem : "",
        },
        [au(surnames[i], "X."), au(surnames[(i + 5) % surnames.length], "Y.")],
      )
    ).id,
  );
}

return { collection: coll.id, created: made.length };
