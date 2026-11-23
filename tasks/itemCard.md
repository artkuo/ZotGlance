# Implement `src/modules/itemCard.ts`

The pure mapping from an item's data to what the Quick Look card shows (PLAN.md, "The card"). `quickLook.ts`, written separately, reads a `Zotero.Item` into the plain `ItemData` below, calls `buildCard`, and renders the result. The contract is `test/unit/itemCard.test.ts`. **Do not edit that test file.** Make it pass.

This module must not import Zotero, the toolkit or DOM globals (no `DOMParser`). It runs under `node --test`. Strip HTML with string and regex code.

## API

```ts
export interface CreatorData {
  creatorType: string; // "author", "editor", "contributor", ...
  firstName?: string;
  lastName?: string;
  name?: string; // single-field creators (institutions)
}

export interface AttachmentData {
  id: number;
  title: string;
  contentType: string; // e.g. "application/pdf", "application/epub+zip", "text/html", ""
  linkMode:
    | "imported_file"
    | "imported_url"
    | "linked_file"
    | "linked_url"
    | "embedded_image";
}

export interface NoteData {
  id: number;
  html: string; // the note's HTML as Zotero stores it
}

export interface ItemData {
  id: number;
  itemType: string; // Zotero internal name, e.g. "journalArticle"
  itemTypeLabel: string; // localized, supplied by the caller, e.g. "Journal Article"
  fields: Record<string, string>; // Zotero field name -> value ("" or absent if empty)
  creators: CreatorData[];
  attachments: AttachmentData[];
  notes: NoteData[];
  citationKey?: string;
  highlightId?: number; // id of the attachment/note row the user is on, if any
}

export type AttachmentKind = "pdf" | "epub" | "snapshot" | "link" | "file";

export interface CardModel {
  id: number;
  title: string;
  authors: { shown: string[]; hiddenCount: number };
  venue: string; // shown in italics by the renderer
  meta: string[]; // after the venue, joined with " · " by the renderer
  doi: string; // bare DOI ("10.x/y"), "" if none
  doiUrl: string; // "https://doi.org/" + doi, "" if none
  url: string;
  abstract: string[]; // plain-text paragraphs
  attachments: { id: number; title: string; kind: AttachmentKind }[];
  notes: { id: number; firstLine: string }[];
  moreNotes: number;
  footer: string[]; // [itemTypeLabel, citationKey?]
  highlightId: number | null;
}

export const MAX_AUTHORS: number; // 8
export const MAX_NOTES: number; // 3
export const NOTE_LINE_MAX: number; // 120

export function formatCreator(c: CreatorData): string;
export function yearFrom(date: string): string;
export function venueOf(
  itemType: string,
  fields: Record<string, string>,
): string;
export function htmlToParagraphs(text: string): string[];
export function noteFirstLine(html: string): string;
export function attachmentKind(a: AttachmentData): AttachmentKind;
export function buildCard(item: ItemData): CardModel;
```

## Rules

**`formatCreator`**

- Use `name` if there is no `lastName`.
- Otherwise output `Last, I. I.`: initials from `firstName`, split on spaces and periods. Hyphenated parts keep the hyphen: `Jean-Paul` → `J.-P.`. Words that are already initials, like `D.` or `D`, become `D.`.
- With no first name, output just `Last`. Trim everything.

**`yearFrom`:** the first standalone 4-digit run from 1000 to 2999 in the string, else `""`. So `"2010-03-15"` → `"2010"`, `"March 2005"` → `"2005"`, `"n.d."` → `""`.

**`venueOf`**, by item type, falling back as shown:

| itemType                                          | venue                                           |
| ------------------------------------------------- | ----------------------------------------------- |
| journalArticle, magazineArticle, newspaperArticle | `publicationTitle`                              |
| bookSection                                       | `bookTitle`                                     |
| book                                              | `publisher`                                     |
| thesis                                            | `university`                                    |
| preprint                                          | `repository`                                    |
| conferencePaper                                   | `proceedingsTitle`, else `conferenceName`       |
| report                                            | `institution`                                   |
| webpage                                           | `websiteTitle`                                  |
| anything else                                     | `publicationTitle`, else `publisher`, else `""` |

**`htmlToParagraphs`** (used for the abstract):

- Turn `<br>`, `</p>`, `</div>`, `</li>`, `</h1>`–`</h6>` into newlines, then remove all other tags.
- Decode `&amp; &lt; &gt; &quot; &#39; &apos; &nbsp;`, plus numeric `&#NNN;` and `&#xHH;`.
- Split on newlines, collapse runs of whitespace inside each paragraph to a single space, trim, and drop empty paragraphs.
- Plain text without tags just gets split on newlines.

**`noteFirstLine`:**

- The first paragraph from `htmlToParagraphs(html)`, or `""`.
- If it's longer than `NOTE_LINE_MAX` characters, cut it to `NOTE_LINE_MAX - 1` characters, `trimEnd()`, and append `…`.

**`attachmentKind`:**

- `linked_url` → `link`
- `application/pdf` → `pdf`
- `application/epub+zip` → `epub`
- `text/html` → `snapshot`
- anything else → `file`

**`buildCard`:**

- `title`: the `title` field trimmed, or `"(untitled)"`.
- `authors`:
  - Use creators with `creatorType === "author"`. If there are none, use all creators.
  - Format each one with `formatCreator`.
  - If there are more than `MAX_AUTHORS`, `shown` is the first `MAX_AUTHORS` and `hiddenCount` is the rest. Otherwise `hiddenCount` is 0.
- `venue`: `venueOf(...)`, trimmed.
- `meta`, in order, skipping empty parts:
  - The year, from `yearFrom(fields.date)`.
  - Volume and issue as `43(7)`, `43`, or `(7)`.
  - Pages, with `-` replaced by `–` (en dash).
- `doi`:
  - Take `fields.DOI`. If that's empty, look in `fields.extra` for a line `DOI: ...`.
  - Strip a leading `https://doi.org/`, `http://dx.doi.org/` or `doi:`, case-insensitive.
  - `doiUrl` is `https://doi.org/` + the doi, or `""` if there is no DOI.
- `url`: `fields.url` or `""`.
- `abstract`: `htmlToParagraphs(fields.abstractNote ?? "")`.
- `attachments`:
  - Leave out `embedded_image`.
  - Sort by kind in the order pdf, epub, snapshot, file, link. Within the same kind, keep the input order (stable).
  - Use the title, or `"Attachment"` if it's empty.
- `notes`:
  - The first `MAX_NOTES` notes, in input order, as `{ id, firstLine: noteFirstLine(html) }`. Skip notes whose first line is empty before counting.
  - `moreNotes` is how many non-empty notes were left over.
- `footer`: `[itemTypeLabel]`, plus `citationKey` if it's non-empty.
- `highlightId`: `item.highlightId ?? null`.

Add a short doc comment at the top of the file saying it is pure and why (it's unit-tested under `node --test`).

## Checks that must pass

- `npm run test:unit`
- `npm run build`
- `npm run lint:check` (run `npm run lint:fix` first if needed)
