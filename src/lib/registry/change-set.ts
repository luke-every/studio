import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";

import { workingFolder } from "./local-prototypes";
import { counterpartOf } from "./production";

/**
 * What a prototype changes, as an engineer or their agent would want it: each fork against the file it was copied from, what is new, what is left to do, and whether
 * what was written follows the conventions. Worked out from the files, so nobody writes it by hand.
 *
 * Every copy a fork makes says where it came from on its first line (`// A copy of Name (project:src/…, at 0b3ed66)`), and each is compared with that file as it is now.
 * Markup taken out of a page (`// Markup taken out of src/app/page.tsx:89-107`) has no original: it is new.
 */
const run = promisify(execFile);
const PRODUCTION = join(homedir(), "Claude", "every-website-main");
const KITS = join(homedir(), "Claude", "team-conventions", "starter", "optional-stubs");
/** The most lines of a diff or a new file that are kept: past it, the file is the place to read. */
const MAX_LINES = 400;

export type FileChange = {
  /** From the project's folder. */
  path: string;
  status: "changed" | "new" | "same";
  /** What it is compared with, or where it was taken from. */
  against?: string;
  added: number;
  removed: number;
  /** A unified diff of what changed, or the text of a new file. */
  text: string;
  truncated: boolean;
};
export type ForkChange = {
  id: string;
  name: string;
  /** What it was copied from, in the prototype (`project:src/…`, `production:src/…`). */
  basedOn: string;
  /** The file in production's repository it comes from, where that is known: the prototype's component is a port of it. */
  production?: string;
  commit: string;
  files: FileChange[];
};
export type Lift = { file: string; line: number; text: string };
export type Check = { rule: string; file: string; line: number; text: string; why: string };
/** A file that is only in the prototype: nothing at its path in production, nor under its name anywhere else there. */
export type NewFile = { path: string; lines: number };
export type ChangeSet = { slug: string; name: string; generatedAt: string; forks: ForkChange[]; lifts: Lift[]; checks: Check[]; newFiles?: NewFile[] };

type Record_ = { label: string; folder: string; from?: { source?: string; commit?: string } };

/** Where a place named in a copy's first line is on this machine. */
function placeOf(folder: string, place: string) {
  if (place.startsWith("project:")) return join(folder, place.slice("project:".length));
  if (place.startsWith("production:")) return join(PRODUCTION, place.slice("production:".length));
  const kit = /^kit:([^:]+):(.+)$/.exec(place);
  return kit ? join(KITS, kit[1], kit[2]) : null;
}

const HEADER = /^\/\/ (?:A copy of (\w+) \((.+?)(?:, at ([0-9a-f]+))?\)|Markup taken out of ([^\s]+))/;

async function diffOf(original: string, now: string, label: string) {
  const dir = await mkdtemp(join(tmpdir(), "change-"));
  try {
    await writeFile(join(dir, "a"), original);
    await writeFile(join(dir, "b"), now);
    // `diff` ends with 1 when the files differ, which is the answer, not a failure.
    const out = await run("diff", ["-u", "--label", `original/${label}`, "--label", `prototype/${label}`, join(dir, "a"), join(dir, "b")]).catch((error: { stdout?: string; code?: number }) => (error.code === 1 ? { stdout: error.stdout ?? "" } : { stdout: "" }));
    return out.stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const trimTo = (text: string) => {
  const lines = text.split("\n");
  return lines.length > MAX_LINES ? { text: `${lines.slice(0, MAX_LINES).join("\n")}\n…`, truncated: true } : { text, truncated: false };
};

/** The text of a copy without the line that says where it is from, which is not part of what was changed. */
const withoutHeader = (text: string) => (HEADER.test(text.split("\n")[0]) ? text.split("\n").slice(1).join("\n") : text);

async function walk(root: string, skip = ["node_modules", ".next"]): Promise<string[]> {
  const found: string[] = [];
  const read = async (folder: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!skip.includes(entry.name)) await read(path);
      } else if (/\.(tsx?|css)$/.test(entry.name)) found.push(path);
    }
  };
  await read(root);
  return found;
}

/** The rules in conventions.md that can be read off the lines that were added. */
function checksOf(file: string, text: string): Check[] {
  const found: Check[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/^\+/, "");
    if (!raw.startsWith("+") || raw.startsWith("+++")) return;
    const at = (rule: string, why: string) => found.push({ rule, file, line: index + 1, text: line.trim().slice(0, 160), why });
    if (/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(line) && !/^\s*\/\//.test(line)) at("Colour", "A hex value: colour is the design system's tokens only.");
    if (/\b(?:bg|text|border|ring|fill|stroke)-(?:gray|neutral|stone|slate|zinc|red|blue|green|yellow|orange|purple|pink)-\d/.test(line)) at("Colour", "A Tailwind default palette colour: tokens only.");
    if (/(?:^|[\s"'`])(?:sm|xl|2xl):[a-z[]/.test(line)) at("Breakpoints", "`sm:` and `xl:` aren't used: mobile-first, with `lg:` for desktop.");
  });
  return found;
}

export async function buildChangeSet(slug: string, name: string): Promise<ChangeSet> {
  const folder = workingFolder(slug);
  let records: Record<string, Record_> = {};
  try {
    records = JSON.parse(await readFile(join(folder, ".studio", "forks.json"), "utf8")) as Record<string, Record_>;
  } catch {
    records = {};
  }
  const forks: ForkChange[] = [];
  const checks: Check[] = [];
  const seenFolders = new Set<string>();
  for (const [id, record] of Object.entries(records)) {
    // Several entries can be one fork's files drawn with other data: its files are read once.
    if (seenFolders.has(record.folder)) continue;
    seenFolders.add(record.folder);
    const forkDir = join(folder, "src", "components", "forks", record.folder);
    if (!existsSync(forkDir)) continue;
    const names = (await readdir(forkDir)).filter((entry) => /\.(tsx?|css)$/.test(entry)).sort();
    const texts = new Map(await Promise.all(names.map(async (entry) => [entry, await readFile(join(forkDir, entry), "utf8")] as const)));
    // The first line of a copy says what it is a copy of; the files beside it have no line of their own and are compared with those beside the original.
    const originals = new Map<string, string>();
    const beside: string[] = [];
    for (const [entry, text] of texts) {
      const found = HEADER.exec(text.split("\n")[0]);
      const place = found?.[2] ? placeOf(folder, found[2]) : null;
      if (place && existsSync(place)) {
        originals.set(entry, place);
        beside.push(dirname(place));
      }
    }
    const files: FileChange[] = [];
    for (const entry of names) {
      const text = texts.get(entry)!;
      const path = relative(folder, join(forkDir, entry));
      const header = HEADER.exec(text.split("\n")[0]);
      const original = originals.get(entry) ?? beside.map((dir) => join(dir, entry)).find((one) => existsSync(one));
      const now = withoutHeader(text);
      if (!original) {
        const kept = trimTo(now);
        files.push({ path, status: "new", against: header?.[4] ? `taken out of ${header[4]}` : undefined, added: now.split("\n").length, removed: 0, text: kept.text, truncated: kept.truncated });
        checks.push(...checksOf(path, now.split("\n").map((row) => `+${row}`).join("\n")));
        continue;
      }
      const before = await readFile(original, "utf8");
      const diff = await diffOf(before, now, basename(entry));
      const lines = diff.split("\n");
      const added = lines.filter((row) => row.startsWith("+") && !row.startsWith("+++")).length;
      const removed = lines.filter((row) => row.startsWith("-") && !row.startsWith("---")).length;
      const kept = trimTo(diff);
      files.push({ path, status: diff.trim() ? "changed" : "same", against: relative(original.startsWith(PRODUCTION) ? PRODUCTION : original.startsWith(KITS) ? KITS : folder, original), added, removed, text: kept.text, truncated: kept.truncated });
      checks.push(...checksOf(path, diff));
    }
    const main = [...texts.values()].map((text) => HEADER.exec(text.split("\n")[0])).find((found) => found);
    // Production's file: where the component came from if that is production, else the one its port says it is a port of ("Port of every-website `src/…`").
    let production: string | undefined;
    const origin = [...originals.values()][0];
    if (origin?.startsWith(PRODUCTION)) production = relative(PRODUCTION, origin);
    else if (origin) production = /Port of every-website `([^`]+)`/.exec((await readFile(origin, "utf8")).slice(0, 4000))?.[1];
    forks.push({ id, name: record.label, basedOn: main?.[2] ?? record.from?.source ?? "", production, commit: main?.[3] ?? record.from?.commit ?? "", files });
  }

  // What the prototype leaves to be done: every `TODO(lift)` in its own files.
  const lifts: Lift[] = [];
  for (const path of await walk(join(folder, "src"))) {
    (await readFile(path, "utf8")).split("\n").forEach((row, index) => {
      if (row.includes("TODO(lift)")) lifts.push({ file: relative(folder, path), line: index + 1, text: row.replace(/^[\s/{*]+|[\s*/}]+$/g, "").replace(/^TODO\(lift\):?\s*/, "").slice(0, 200) });
    });
  }
  // What is only in the prototype: its components (not the forks, which are compared above) that production has nothing to match. Only where production is on this machine.
  const newFiles: NewFile[] = [];
  for (const path of await walk(join(folder, "src", "components"))) {
    const relativePath = relative(folder, path);
    if (relativePath.startsWith(join("src", "components", "forks")) || !/\.tsx?$/.test(relativePath)) continue;
    const counterpart = await counterpartOf(relativePath);
    if (counterpart?.status === "none") newFiles.push({ path: relativePath, lines: (await readFile(path, "utf8")).split("\n").length });
  }
  return { slug, name, generatedAt: new Date().toISOString(), forks, lifts: lifts.slice(0, 200), checks: checks.slice(0, 100), newFiles: newFiles.slice(0, 100) };
}
