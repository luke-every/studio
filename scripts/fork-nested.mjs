import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

import { bring, componentIndex, problemIn, resolveAlias } from "./extract-section.mjs";

/**
 * Makes a fork the owner of a component it uses. A fork draws the components it is made of as the originals, shared with the rest of the prototype, so a change to
 * one of them would be a change to all. This copies that component into the fork's folder and points the fork at the copy: its own files' imports, and the components
 * its starting data is built from (the `T_` imports of its record). The original is not touched.
 *
 * `record` is the fork's entry in `.studio/forks.json`. Returns it changed (`{ record }`), or `{ error }`; nothing is left half done.
 */
const PRODUCTION = join(homedir(), "Claude", "every-website-main");
const strip = (file) => file.replace(/\.tsx?$/, "").replace(/[\\/]index$/, "");

/** Whether an import (`specifier`, written in `from`) is the file `target`. */
function resolvesTo(dir, from, specifier, target) {
  let found = null;
  if (specifier.startsWith("@/")) found = resolveAlias(dir, specifier)?.file ?? null;
  else if (specifier.startsWith(".")) found = [".tsx", ".ts", "/index.tsx", "/index.ts"].map((end) => resolve(dirname(from), specifier + end)).find((one) => existsSync(one)) ?? null;
  return !!found && strip(found) === strip(target);
}

export function forkNested({ dir, record, name, commits = {} }) {
  const hit = componentIndex(dir).get(name);
  if (!hit) return { error: `${name} isn't one of the project's or production's own components, so there is no original to copy.` };
  const forkDir = join(dir, "src", "components", "forks", record.folder);
  if (!existsSync(forkDir)) return { error: "The fork's folder isn't there any more." };
  const own = readdirSync(forkDir).filter((entry) => /\.tsx?$/.test(entry));
  const copy = basename(hit.file);
  if (own.includes(copy)) return { error: `${name} is already a copy in this fork.` };

  // The fork's own files that name it, before anything is written: if what is written would not read, they go back as they were.
  const rewired = [];
  const base = copy.replace(/\.tsx?$/, "");
  for (const entry of own) {
    const path = join(forkDir, entry);
    const before = readFileSync(path, "utf8");
    const after = before.replace(/(from\s+["'])([^"']+)(["'])/g, (whole, open, specifier, close) => (resolvesTo(dir, path, specifier, hit.file) ? `${open}./${base}${close}` : whole));
    if (after !== before) rewired.push({ path, before, after });
  }
  const own_ = hit.root === join(dir, "src");
  const place = own_ ? `project:${relative(dir, hit.file).split(sep).join("/")}` : `production:${relative(dirname(hit.root), hit.file).split(sep).join("/")}`;
  const commit = own_ ? commits.project : commits.production;
  const done = new Set();
  bring(dir, forkDir, hit.file, `// A copy of ${name} (${place}${commit ? `, at ${commit}` : ""}), made for the fork ${record.label} that uses it. The original is not touched.`, done);
  for (const one of rewired) writeFileSync(one.path, one.after);
  // What it is checked by: the copy, and every file of the fork that now names it.
  const broken = [join(forkDir, copy), ...rewired.map((one) => one.path)].map((path) => ({ path, problem: problemIn(path) })).find((one) => one.problem);
  if (broken) {
    for (const one of rewired) writeFileSync(one.path, one.before);
    for (const made of done) rmSync(join(forkDir, basename(made)), { force: true });
    return { error: `It couldn't be copied cleanly (${broken.problem}), so nothing was changed.` };
  }
  // The components the fork's starting data is built from, named by the imports of its record.
  const imports = (record.imports ?? []).map((line) => line.replace(/from\s+"([^"]+)"/, (whole, specifier) => (resolvesTo(dir, join(forkDir, "x.tsx"), specifier, hit.file) ? `from "@/components/forks/${record.folder}/${base}"` : whole)));
  return { record: { ...record, imports } };
}

export { PRODUCTION };
