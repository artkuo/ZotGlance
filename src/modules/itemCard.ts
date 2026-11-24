/**
 * Pure mapping from Zotero item data to the Quick Look card view model
 * (PLAN.md, "The card"). No Zotero, toolkit or DOM imports so it can be
 * unit-tested under `node --test`.
 */

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

export const MAX_AUTHORS = 8;
export const MAX_NOTES = 3;
export const NOTE_LINE_MAX = 120;

const ATTACHMENT_KIND_ORDER: Record<AttachmentKind, number> = {
  pdf: 0,
  epub: 1,
  snapshot: 2,
  file: 3,
  link: 4,
};

export function formatCreator(c: CreatorData): string {
  const lastName = (c.lastName ?? "").trim();
  if (!lastName) {
    return (c.name ?? "").trim();
  }
  const firstName = (c.firstName ?? "").trim();
  if (!firstName) {
    return lastName;
  }
  const initials = firstName
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => formatInitialPart(part))
    .join(" ");
  return `${lastName}, ${initials}`;
}

function formatInitialPart(part: string): string {
  // Hyphenated parts keep the hyphen: Jean-Paul -> J.-P.
  return part
    .split("-")
    .map((seg) => {
      if (!seg) return "";
      // Words already initials, like D. or D, become D.
      const letter = seg[0];
      return `${letter.toUpperCase()}.`;
    })
    .filter(Boolean)
    .join("-");
}

export function yearFrom(date: string): string {
  const match = date.match(/(?<!\d)([12]\d{3})(?!\d)/);
  if (!match) return "";
  const year = Number(match[1]);
  if (year < 1000 || year > 2999) return "";
  return match[1];
}

export function venueOf(
  itemType: string,
  fields: Record<string, string>,
): string {
  const f = (key: string) => fields[key] ?? "";
  switch (itemType) {
    case "journalArticle":
    case "magazineArticle":
    case "newspaperArticle":
      return f("publicationTitle");
    case "bookSection":
      return f("bookTitle");
    case "book":
      return f("publisher");
    case "thesis":
      return f("university");
    case "preprint":
      return f("repository");
    case "conferencePaper":
      return f("proceedingsTitle") || f("conferenceName");
    case "report":
      return f("institution");
    case "webpage":
      return f("websiteTitle");
    default:
      return f("publicationTitle") || f("publisher") || "";
  }
}

export function htmlToParagraphs(text: string): string[] {
  if (!text) return [];
  // Turn structural tags into newlines, then remove other tags.
  let s = text.replace(
    /<br\s*\/?>|<\/p\s*>|<\/div\s*>|<\/li\s*>|<\/h[1-6]\s*>/gi,
    "\n",
  );
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

function decodeEntities(text: string): string {
  return (
    text
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
        const cp = parseInt(hex, 16);
        return safeCodePoint(cp);
      })
      .replace(/&#(\d+);/g, (_, dec: string) => {
        const cp = parseInt(dec, 10);
        return safeCodePoint(cp);
      })
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      // Last, so "&amp;lt;" stays "&lt;" instead of becoming "<".
      .replace(/&amp;/g, "&")
  );
}

function safeCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

export function noteFirstLine(html: string): string {
  const paragraphs = htmlToParagraphs(html);
  const first = paragraphs[0] ?? "";
  if (first.length <= NOTE_LINE_MAX) return first;
  return first.slice(0, NOTE_LINE_MAX - 1).trimEnd() + "…";
}

export function attachmentKind(a: AttachmentData): AttachmentKind {
  if (a.linkMode === "linked_url") return "link";
  switch (a.contentType) {
    case "application/pdf":
      return "pdf";
    case "application/epub+zip":
      return "epub";
    case "text/html":
      return "snapshot";
    default:
      return "file";
  }
}

export function buildCard(item: ItemData): CardModel {
  const fields = item.fields ?? {};
  const title = (fields.title ?? "").trim() || "(untitled)";

  const allCreators = item.creators ?? [];
  const authorCreators = allCreators.filter((c) => c.creatorType === "author");
  const creatorsForDisplay =
    authorCreators.length > 0 ? authorCreators : allCreators;
  const formattedCreators = creatorsForDisplay.map(formatCreator);
  const shown = formattedCreators.slice(0, MAX_AUTHORS);
  const hiddenCount = Math.max(0, formattedCreators.length - MAX_AUTHORS);

  const venue = venueOf(item.itemType, fields).trim();

  const meta: string[] = [];
  const year = yearFrom(fields.date ?? "");
  if (year) meta.push(year);
  const volIssue = formatVolumeIssue(fields.volume, fields.issue);
  if (volIssue) meta.push(volIssue);
  const pages = (fields.pages ?? "").trim();
  if (pages) meta.push(pages.replace(/-/g, "–"));

  const doi = extractDoi(fields);
  const doiUrl = doi ? `https://doi.org/${doi}` : "";
  const url = fields.url ?? "";

  const abstract = htmlToParagraphs(fields.abstractNote ?? "");

  const attachments = (item.attachments ?? [])
    .filter((a) => a.linkMode !== "embedded_image")
    .map((a, index) => ({
      id: a.id,
      title: (a.title ?? "").trim() || "Attachment",
      kind: attachmentKind(a),
      index,
    }))
    .sort((a, b) => {
      const kd = ATTACHMENT_KIND_ORDER[a.kind] - ATTACHMENT_KIND_ORDER[b.kind];
      if (kd !== 0) return kd;
      return a.index - b.index;
    })
    .map(({ id, title: t, kind }) => ({ id, title: t, kind }));

  const allNonEmptyNotes: { id: number; firstLine: string }[] = [];
  for (const note of item.notes ?? []) {
    const firstLine = noteFirstLine(note.html ?? "");
    if (!firstLine) continue;
    allNonEmptyNotes.push({ id: note.id, firstLine });
  }

  let noteLines: { id: number; firstLine: string }[];
  let moreNotes: number;
  if (allNonEmptyNotes.length <= MAX_NOTES) {
    noteLines = allNonEmptyNotes;
    moreNotes = 0;
  } else {
    const highlightIndex = allNonEmptyNotes.findIndex(
      (n) => n.id === item.highlightId,
    );
    if (highlightIndex >= MAX_NOTES) {
      noteLines = [
        ...allNonEmptyNotes.slice(0, MAX_NOTES - 1),
        allNonEmptyNotes[highlightIndex],
      ];
    } else {
      noteLines = allNonEmptyNotes.slice(0, MAX_NOTES);
    }
    moreNotes = allNonEmptyNotes.length - MAX_NOTES;
  }

  const footer = [item.itemTypeLabel];
  const citationKey = (item.citationKey ?? "").trim();
  if (citationKey) footer.push(citationKey);

  return {
    id: item.id,
    title,
    authors: { shown, hiddenCount },
    venue,
    meta,
    doi,
    doiUrl,
    url,
    abstract,
    attachments,
    notes: noteLines,
    moreNotes,
    footer,
    highlightId: item.highlightId ?? null,
  };
}

function formatVolumeIssue(
  volume: string | undefined,
  issue: string | undefined,
): string {
  const v = (volume ?? "").trim();
  const i = (issue ?? "").trim();
  if (v && i) return `${v}(${i})`;
  if (v) return v;
  if (i) return `(${i})`;
  return "";
}

function extractDoi(fields: Record<string, string>): string {
  let raw = (fields.DOI ?? "").trim();
  if (!raw) {
    const extra = fields.extra ?? "";
    const m = extra.match(/^DOI:\s*(.+)$/im);
    if (m) raw = m[1].trim();
  }
  if (!raw) return "";
  return raw
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}
