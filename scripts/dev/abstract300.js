// Adds a journal article with a 300-word abstract (invented text) to the
// "zotQL fixtures" collection, to check that an average abstract fits the
// card. Run after seed.js: scripts/zq-eval.sh < scripts/dev/abstract300.js
const sentences = [
  "Walking on uneven terrain is common in daily life, yet most laboratory studies of human gait use smooth, level treadmills.",
  "Here we ask how the mechanical work and metabolic energy of walking change when the ground surface varies in height from step to step.",
  "Young healthy adults walked on a custom treadmill fitted with blocks of several heights, at a range of speeds and step lengths.",
  "We measured oxygen consumption and carbon dioxide production, ground reaction forces, and three-dimensional body motion.",
  "A simple dynamic walking model was used to predict how step-to-step transitions should change with terrain amplitude.",
  "The model predicts that uneven terrain increases the collision losses at heel strike, which must be restored by push-off work from the trailing leg.",
  "Consistent with this prediction, net metabolic rate increased with terrain amplitude, by roughly a quarter at the largest amplitude tested.",
  "Positive work performed at the ankle and hip increased in proportion to the measured collision losses, while knee work changed little.",
  "Subjects also adopted slightly shorter and wider steps, with greater variability in step width and step timing.",
  "These adjustments appear to trade a small increase in step frequency for improved lateral balance on the irregular surface.",
  "The relative contribution of balance control to the total energetic cost was estimated by comparing trials with and without lateral stabilisation.",
  "Stabilisation reduced step width variability and a modest fraction of the added metabolic cost, suggesting that most of the cost arises from sagittal-plane work.",
  "We conclude that a simple collisional model explains much of the energetic penalty of uneven terrain, and that the remaining cost is related to balance.",
  "These findings may inform the design of assistive devices and prostheses intended for use outdoors, where surfaces are rarely smooth.",
  "Future work should examine older adults and people with impaired balance, for whom uneven ground poses a greater risk of falls.",
];
let words = [],
  i = 0;
while (words.length < 300) {
  words.push(...sentences[i % sentences.length].split(" "));
  i++;
}
const text = words
  .slice(0, 300)
  .join(" ")
  .replace(/[,;:.]*$/, ".");
const LIB = Zotero.Libraries.userLibraryID;
const coll = Zotero.Collections.getByLibrary(LIB).find(
  (c) => c.name === "zotQL fixtures",
);
let item = (await Zotero.Items.getAll(LIB)).find(
  (it) =>
    it.isRegularItem() &&
    /^(A 300-word abstract|Energetics of walking over uneven)/.test(
      it.getField("title"),
    ),
);
if (!item) {
  item = new Zotero.Item("journalArticle");
  item.libraryID = LIB;
  item.setField(
    "title",
    "Energetics of walking over uneven terrain at several speeds",
  );
  item.setField("publicationTitle", "Journal of Fixture Biomechanics");
  item.setField("date", "2012");
  item.setField("volume", "45");
  item.setField("issue", "2");
  item.setField("pages", "200-210");
  item.setField("DOI", "10.0000/fixture.2012.300");
  item.setCreators([
    { lastName: "Voloshina", firstName: "Alexandra S.", creatorType: "author" },
    { lastName: "Kuo", firstName: "Arthur D.", creatorType: "author" },
    { lastName: "Daley", firstName: "Monica A.", creatorType: "author" },
    { lastName: "Ferris", firstName: "Daniel P.", creatorType: "author" },
  ]);
  item.setField("abstractNote", text);
  item.addToCollection(coll.id);
  await item.saveTx();
}
return {
  id: item.id,
  words: item.getField("abstractNote").split(/\s+/).length,
};
