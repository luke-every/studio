import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * What the studio has written into a project's files, so it can be put back. Each save is one step: the files it changed, as they were and as they became. Undoing a
 * step writes the files back, but only while each is exactly as the studio left it: if something else has changed it since (Claude, the person, a save of another
 * kind), putting the old text back would take that away too, so it is refused and said. Kept in the project's `.studio` folder, at most `LIMIT` steps.
 */
type Step = { at: number; files: { path: string; before: string; after: string }[] };
type Stack = { past: Step[]; future: Step[] };
const LIMIT = 40;

const stackFile = (folder: string) => join(folder, ".studio", "undo.json");

async function read(folder: string): Promise<Stack> {
  try {
    const stack = JSON.parse(await readFile(stackFile(folder), "utf8")) as Stack;
    return { past: Array.isArray(stack.past) ? stack.past : [], future: Array.isArray(stack.future) ? stack.future : [] };
  } catch {
    return { past: [], future: [] };
  }
}

async function write(folder: string, stack: Stack) {
  await mkdir(dirname(stackFile(folder)), { recursive: true });
  await writeFile(`${stackFile(folder)}.tmp`, JSON.stringify(stack));
  await rename(`${stackFile(folder)}.tmp`, stackFile(folder));
}

/** One save, as the files it changed (paths relative to the project's folder). */
export async function recordWrite(folder: string, files: Step["files"]) {
  if (!files.length) return;
  const stack = await read(folder);
  await write(folder, { past: [...stack.past, { at: Date.now(), files }].slice(-LIMIT), future: [] });
}

/** Puts back the last step written (`undo`) or writes the last one put back again (`redo`). */
export async function stepWrite(folder: string, direction: "undo" | "redo"): Promise<{ ok: true; files: string[] } | { ok: false; error: string }> {
  const stack = await read(folder);
  const step = direction === "undo" ? stack.past[stack.past.length - 1] : stack.future[stack.future.length - 1];
  if (!step) return { ok: false, error: direction === "undo" ? "There is nothing written to undo." : "There is nothing to redo." };
  const src = resolve(folder, "src");
  const targets = step.files.map((one) => ({ ...one, full: resolve(folder, one.path) }));
  if (targets.some((one) => !one.full.startsWith(src + sep))) return { ok: false, error: "That step names a file outside the project's own." };
  // As each is now must be as that step left it.
  for (const one of targets) {
    const now = await readFile(one.full, "utf8").catch(() => null);
    const expected = direction === "undo" ? one.after : one.before;
    if (now !== expected) return { ok: false, error: `${one.path} has changed since, so putting it back would take that change away too. Nothing was changed.` };
  }
  for (const one of targets) {
    await writeFile(`${one.full}.tmp`, direction === "undo" ? one.before : one.after);
    await rename(`${one.full}.tmp`, one.full);
  }
  await write(folder, direction === "undo" ? { past: stack.past.slice(0, -1), future: [...stack.future, step] } : { past: [...stack.past, step], future: stack.future.slice(0, -1) });
  return { ok: true, files: step.files.map((one) => one.path) };
}
