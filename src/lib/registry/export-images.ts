import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { readCopy } from "@/lib/copy-doc-build";

import { workingFolder } from "./local-prototypes";

const run = promisify(execFile);
/** A folder or file name this makes: letters, digits and a few marks, never a dot first, so a path can't leave the folder it is saved in. */
const SEGMENT = /^[a-z0-9][a-z0-9._@-]*$/i;

/** The sections of a prototype's copy, each with every line of it, for telling which one a picture is in. Only on this machine, where its folder is. */
export async function copySections(slug: string) {
  return (await readCopy(workingFolder(slug)).catch(() => [])).map((group) => ({ name: group.name, lines: group.entries.map(({ key, value }) => ({ key, value })) }));
}

/**
 * Keeps an export in the prototype's own folder, under `.studio/exports/` (a folder starting with a dot, so /push and the prototype's repository leave it out),
 * in a folder named for when it was made, and shows it in Finder. Pictures are in a folder per screen (a variant, or a step of the flow) and in it one per copy section, as they were found.
 */
export async function saveImageExport(slug: string, files: { path: string; bytes: Buffer }[]) {
  const folder = workingFolder(slug);
  if (!existsSync(folder)) throw new Error("This prototype isn't on this machine, so there is nowhere to save its pictures.");
  const made = join(folder, ".studio", "exports", `images-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`);
  for (const file of files) {
    const parts = file.path.split("/");
    if (!parts.length || parts.length > 3 || !parts.every((part) => SEGMENT.test(part))) throw new Error("A picture has a name that can't be saved.");
    const to = join(made, ...parts);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, file.bytes);
  }
  await run("open", [made]);
  return made;
}
