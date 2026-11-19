/**
 * Taking a copy document back: what was pasted from it, read down to its rows (key, current English, new English, status), and each row weighed
 * against the prototype's own words before anything is changed. Plain functions, no server code, so what a paste holds is known in the browser and
 * the same weighing is done again where the file is. The rules are the copywriter's: a new-English cell left empty, or holding only "/", means no
 * change; anything else is the new words; and a row is only taken once its status says Approved.
 */
export type PastedRow = {
  key: string;
  current: string;
  next: string;
  status: string;
  section: string;
};

const COLUMNS = {
  key: /^key$/i,
  current: /^(current english|en copy|current)$/i,
  next: /^(suggested english|en new|new english|new)$/i,
  status: /^status$/i,
};

const tidy = (text: string | null | undefined) =>
  (text ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

/** Where each column is, from a header row; null when it isn't one (it needs at least the key and the new English). */
function columnsOf(header: string[]) {
  const at = (pattern: RegExp) =>
    header.findIndex((cell) => pattern.test(cell));
  const found = {
    key: at(COLUMNS.key),
    current: at(COLUMNS.current),
    next: at(COLUMNS.next),
    status: at(COLUMNS.status),
  };
  return found.key >= 0 && found.next >= 0 ? found : null;
}

type Columns = NonNullable<ReturnType<typeof columnsOf>>;
const rowOf = (
  cells: string[],
  at: Columns,
  section: string,
): PastedRow | null => {
  const key = (cells[at.key] ?? "").replace(/`/g, "").trim();
  if (!key) return null;
  return {
    key,
    current: at.current >= 0 ? (cells[at.current] ?? "") : "",
    next: cells[at.next] ?? "",
    status: at.status >= 0 ? (cells[at.status] ?? "") : "",
    section,
  };
};

/** The rows of one table given as its lines of cells (the first is its header): none when it has no Key and Suggested English columns. */
export function rowsFromTable(lines: string[][], section: string): PastedRow[] {
  const at = lines.length ? columnsOf(lines[0]) : null;
  if (!at) return [];
  return lines.slice(1).flatMap((cells) => {
    const row = rowOf(cells, at, section);
    return row ? [row] : [];
  });
}

/** The rows of every table in what was pasted: from its HTML when it came with some (a table copied out of a document does), otherwise from its text. */
export function parseCopyPaste(html: string, text: string): PastedRow[] {
  const rows: PastedRow[] = [];
  if (html && /<table/i.test(html) && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let section = "";
    for (const element of Array.from(
      doc.body.querySelectorAll("h1,h2,h3,h4,table"),
    )) {
      if (element.tagName !== "TABLE") {
        section = tidy(element.textContent).replace(/^\d+\.\s*/, "");
        continue;
      }
      const lines = Array.from(element.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) =>
          tidy(cell.textContent),
        ),
      );
      const at = lines.length ? columnsOf(lines[0]) : null;
      if (!at) continue;
      for (const cells of lines.slice(1)) {
        const row = rowOf(cells, at, section);
        if (row) rows.push(row);
      }
    }
    if (rows.length) return rows;
  }
  // Text: cells are divided by tabs (a table copied out as plain text) or by pipes (Markdown); a line with none, between tables, names a section.
  let at: Columns | null = null;
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const divider = line.includes("\t")
      ? "\t"
      : line.includes("|")
        ? "|"
        : null;
    if (!divider) {
      if (line.trim())
        section = tidy(line)
          .replace(/^#+\s*/, "")
          .replace(/^\d+\.\s*/, "");
      continue;
    }
    if (/^[\s|:-]+$/.test(line)) continue;
    let cells = line.split(divider).map(tidy);
    if (divider === "|") {
      if (cells[0] === "") cells = cells.slice(1);
      if (cells[cells.length - 1] === "") cells = cells.slice(0, -1);
    }
    const header = columnsOf(cells);
    if (header) {
      at = header;
      continue;
    }
    const row = at ? rowOf(cells, at, section) : null;
    if (row) rows.push(row);
  }
  return rows;
}

export type ReviewKind =
  /** Approved, new words, and nothing wrong: taken unless unticked. */
  | "ready"
  /** Approved, but the file already says it. */
  | "already"
  /** Approved, but the file's words aren't the ones the doc was made from: they were changed since. */
  | "conflict"
  /** Approved, but a {placeholder} in it was changed, added or lost. */
  | "placeholders"
  /** Approved, with nothing written in the new English. */
  | "nocopy"
  /** New words, but not approved yet. */
  | "waiting"
  /** A key the file doesn't have. */
  | "unknown";

export type ReviewItem = {
  key: string;
  section: string;
  kind: ReviewKind;
  before: string;
  docCurrent: string;
  next: string;
  status: string;
  warnings: string[];
};
export type Review = {
  items: ReviewItem[];
  /** Rows read, rows with a key the file doesn't have, and rows with nothing to change that aren't being taken. */ total: number;
  unknown: number;
  noChange: number;
};

/** Words compared as a person reads them: spaces collapsed, and the same quotes. */
const same = (a: string, b: string) =>
  tidy(a).normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"') ===
  tidy(b).normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const tokens = (text: string) =>
  (text.match(/\{[^}]+\}/g) ?? []).sort().join(" ");
/** No change: an empty cell, or only a slash. */
export const noNewCopy = (next: string) => !next.trim() || next.trim() === "/";
export const isApproved = (status: string) =>
  tidy(status).toLowerCase() === "approved";

/** Weighs each pasted row against the prototype's words (`words`: key to what the file says now). Rows with nothing to change that aren't approved are only counted. */
export function reviewCopy(
  rows: PastedRow[],
  words: Map<string, string>,
): Review {
  const items: ReviewItem[] = [];
  let unknown = 0;
  let noChange = 0;
  for (const row of rows) {
    const before = words.get(row.key);
    const next = noNewCopy(row.next) ? "" : row.next.trim();
    const approved = isApproved(row.status);
    const base = {
      key: row.key,
      section: row.section,
      before: before ?? "",
      docCurrent: row.current,
      next,
      status: row.status,
      warnings: [] as string[],
    };
    if (before === undefined) {
      unknown++;
      if (next || approved)
        items.push({
          ...base,
          kind: "unknown",
          warnings: ["This key isn't in the prototype."],
        });
      continue;
    }
    if (!next) {
      if (approved)
        items.push({
          ...base,
          kind: "nocopy",
          warnings: ["Approved, but there is no new copy."],
        });
      else noChange++;
      continue;
    }
    if (!approved) {
      items.push({ ...base, kind: "waiting" });
      continue;
    }
    if (same(next, before)) {
      items.push({ ...base, kind: "already" });
      continue;
    }
    const warnings: string[] = [];
    let kind: ReviewKind = "ready";
    if (row.current && !same(row.current, before)) {
      kind = "conflict";
      warnings.push(
        "The prototype's words have changed since the doc was made.",
      );
    }
    if (tokens(next) !== tokens(before)) {
      kind = "placeholders";
      warnings.push(
        `A placeholder is different: the line has ${tokens(before) || "none"}, the new copy has ${tokens(next) || "none"}.`,
      );
    }
    if (next.length > before.length * 1.4 && next.length - before.length > 12)
      warnings.push(
        `It is ${Math.round((next.length / before.length - 1) * 100)}% longer, so it may not fit where it is.`,
      );
    items.push({ ...base, kind, warnings });
  }
  return { items, total: rows.length, unknown, noChange };
}
