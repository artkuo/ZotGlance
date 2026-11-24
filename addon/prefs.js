// ZotGlance preferences, shown in Zotero's Settings → ZotGlance.
// Values set from the settings pane are stored as strings.
pref("cmdY", true);
// Phase 2 type-to-select; false leaves typing to Zotero's built-in one.
pref("typeSelect", true);
pref("typeSelectTimeoutMs", "1500");
// Abstract font: a key of ABSTRACT_FONTS in src/modules/quickLook.ts.
pref("abstractFont", "serif");
// Abstract size, percent of the items list's font size.
pref("abstractSize", "100");
// Card size in px after the user resizes it; 0 = automatic.
pref("cardWidth", 0);
pref("cardHeight", 0);
// Columns type-to-select matches: "shown" (the items list's visible
// columns) or "fixed" (the match* prefs below, whether shown or not).
pref("typeSelectColumns", "shown");
pref("matchTitle", true);
pref("matchCreator", true);
pref("matchYear", true);
pref("matchPublication", false);
pref("matchPublisher", false);
pref("matchCitationKey", false);
