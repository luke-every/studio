import "server-only";

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";

/**
 * What the studio can tell about a prototype's files from production's own code, wherever production is on this machine: whether a file has a counterpart there,
 * what a file says it is a port, extension or new component of, and what is in production's file. Only facts, read off the two: nothing here says what to do about them.
 */
export const PRODUCTION = join(homedir(), "Claude", "every-website-main");

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);
let index: { at: number; byName: Map<string, string[]> } | null = null;

/** Every source file under production's `src`, by its file name: where a file moved to is found as well as where it stayed. Kept for a minute. */
async function productionFiles() {
  if (index && Date.now() - index.at < 60_000) return index.byName;
  const byName = new Map<string, string[]>();
  const read = async (folder: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) await read(path);
      } else if (/\.(tsx?|css)$/.test(entry.name) && !/\.(test|spec|stories)\./.test(entry.name)) {
        const list = byName.get(entry.name) ?? [];
        list.push(relative(PRODUCTION, path));
        byName.set(entry.name, list);
      }
    }
  };
  await read(join(PRODUCTION, "src"));
  index = { at: Date.now(), byName };
  return byName;
}

export const productionHere = () => existsSync(join(PRODUCTION, "src"));

/** A prototype file's counterpart in production: at the same path, at another (the nearest by folder), or none. Null when production isn't on this machine. */
export async function counterpartOf(file: string): Promise<{ status: "same-path" | "moved" | "none"; path?: string } | null> {
  if (!productionHere()) return null;
  if (existsSync(join(PRODUCTION, file))) return { status: "same-path", path: file };
  const others = (await productionFiles()).get(basename(file)) ?? [];
  return others.length ? { status: "moved", path: others[0] } : { status: "none" };
}

/** What a component says about where it comes from, in its doc comment (conventions.md, "Say where it comes from"): a port, an extension, or new. */
export type Provenance = { kind: "port" | "extends" | "new"; /** The production file it names. */ production?: string; /** The comment, as one line. */ note: string };

export function provenanceOf(source: string): Provenance | null {
  for (const match of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    const note = match[1].replace(/^\s*\* ?/gm, "").replace(/\s+/g, " ").trim();
    const named = /(Port of|Extends) every-website `([^`]+)`/.exec(note);
    if (named) return { kind: named[1] === "Port of" ? "port" : "extends", production: named[2], note };
    if (/New: nothing in every-website/.test(note)) return { kind: "new", note };
  }
  return null;
}

/** A production file's text, or null when production isn't on this machine or has no such file. */
export const productionText = (path: string) => readFile(join(PRODUCTION, path), "utf8").catch(() => null);
