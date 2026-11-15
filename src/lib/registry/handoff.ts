import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { decisionProblem, handoffSchema, undecided, type Decision, type Handoff } from "@/lib/handoff";

import { getPrototype } from "./index";
import { readStudioFile, updateStudioFile, workingCopiesOn, workingFolder, WORKING_VERSION } from "./local-prototypes";
import { isStoreConfigured, readStoreFile, updateStoreFile } from "./store";
import { VERSION_PATTERN, versionSegment } from "./version";

/**
 * Handoffs, one file per version beside it, the same way comments are kept (see `comments.ts`): written whole by
 * /handoff, then changed one decision at a time from the studio. A working copy's (v0.0, on this machine) is kept in
 * its own `.studio/` folder, so nothing about a version nobody else can see is committed.
 */

const working = (key: string) => key === WORKING_VERSION && workingCopiesOn();

function pathFor(slug: string, key: string) {
  // These come from the browser and the skill and become a path, so they are checked here.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !VERSION_PATTERN.test(key)) throw new Error("That isn't a prototype version.");
  return `handoff/${slug}/${versionSegment(key)}.json`;
}

/** A version by its label (v0.4) or the key its files are kept under, which differ only after a rename. */
export async function findVersion(slug: string, version: string) {
  const found = (await getPrototype(slug))?.versions.find((item) => item.key === version || item.version === version);
  if (!found) throw new Error(`The studio has no ${version} of ${slug}. Push it first, then hand it off.`);
  return found;
}

export async function readHandoff(slug: string, key: string): Promise<Handoff | null> {
  const path = pathFor(slug, key);
  const text = working(key) ? await readStudioFile(slug, "handoff.json") : await readStoreFile(path);
  return text ? handoffSchema.parse(JSON.parse(text)) : null;
}

/** How far a handoff has got, for the row on the prototype's page: small, since it is asked for every few seconds. */
export async function handoffStatus(slug: string, key: string) {
  const current = await readHandoff(slug, key);
  return current ? { total: current.findings.length, left: undecided(current), signedBy: current.signOff?.by ?? null, variants: current.scope.variants.map((variant) => variant.id) } : null;
}

async function update<T>(slug: string, key: string, change: (current: Handoff | null) => { next: Handoff; message: string; result: T }): Promise<T> {
  const path = pathFor(slug, key);
  let result!: T;
  const write = (text: string | null) => {
    const done = change(text ? handoffSchema.parse(JSON.parse(text)) : null);
    result = done.result;
    // Indented: an engineer's agent, and sometimes an engineer, reads this file as it is.
    return { content: `${JSON.stringify(done.next, null, 2)}\n`, message: done.message };
  };
  if (working(key)) {
    await updateStudioFile(slug, "handoff.json", write);
    return result;
  }
  if (!isStoreConfigured()) throw new Error("No content repository is connected, so nothing can be saved.");
  await updateStoreFile(path, write);
  return result;
}

/**
 * The findings /handoff sent. Scanning again keeps each decision whose finding is still there and still makes sense;
 * once signed off the package is what engineering was given, so it is never replaced.
 */
export async function saveFindings(input: { slug: string; version: string; handoff: unknown }) {
  const version = await findVersion(input.slug, input.version);
  const scanned = handoffSchema.parse(input.handoff);
  return update(input.slug, version.key, (current) => {
    if (current?.signOff) throw new Error(`${version.version} was signed off by ${current.signOff.by}. Push a new version to hand off again.`);
    const before = new Map((current?.findings ?? []).map((finding) => [finding.id, finding.decision]));
    const next: Handoff = {
      ...scanned,
      // A plain scan doesn't fix or apply anything: what an earlier run recorded stays.
      fixed: scanned.fixed ?? current?.fixed,
      exact: scanned.exact ?? current?.exact,
      applied: current?.applied ?? null,
      prototype: { slug: input.slug, version: version.version },
      findings: scanned.findings.map((finding) => {
        const kept = before.get(finding.id);
        return { ...finding, decision: kept && !decisionProblem(finding, kept) ? kept : null };
      }),
      signOff: null,
    };
    return { next, message: `Handoff for ${input.slug} ${version.version}`, result: { version: version.version, findings: next.findings.length, kept: next.findings.length - undecided(next) } };
  });
}

/**
 * A handoff made on the designer's machine, carried to the version /push has just made: stored as it was, decisions and
 * sign-off included, so engineers who open that version find it. The version's code is what was pushed, so it is the
 * working copy's; `changedSince` names any live files that were changed after the handoff was made.
 */
export async function carryHandoff(input: { slug: string; version: string; handoff: unknown; changedSince?: string[] }) {
  const version = await findVersion(input.slug, input.version);
  const carried = handoffSchema.parse(input.handoff);
  return update(input.slug, version.key, (current) => {
    // Carrying is the designer's own act, and the latest handoff they made replaces whatever the version had.
    const next: Handoff = { ...carried, prototype: { slug: input.slug, version: version.version }, applied: null, changedSince: input.changedSince?.length ? input.changedSince : undefined };
    return { next, message: `Handoff carried to ${input.slug} ${version.version}`, result: { version: version.version, signedOff: !!next.signOff, changedSince: next.changedSince?.length ?? 0 } };
  });
}

/** A designer's decision on one finding, or null to take it back. Decisions can change until the handoff is signed off. */
export async function decide(input: { slug: string; key: string; id: string; decision: Pick<Decision, "action" | "candidate" | "name" | "reason"> | null; by: string }) {
  const by = input.by.trim();
  if (!by) throw new Error("Choose who you are first: a decision is signed with your name.");
  return update(input.slug, input.key, (current) => {
    if (!current) throw new Error("There is nothing to decide for this version yet.");
    if (current.signOff) throw new Error("This handoff is signed off, so its decisions are final.");
    const finding = current.findings.find((item) => item.id === input.id);
    if (!finding) throw new Error("That finding isn't there any more. Reload the page.");
    let decision: Decision | null = null;
    if (input.decision) {
      const problem = decisionProblem(finding, input.decision);
      if (problem) throw new Error(problem);
      const { action, candidate, name, reason } = input.decision;
      decision = {
        action,
        ...(action === "pick" || action === "extend" ? { candidate } : {}),
        ...(action === "add" ? { name: name?.trim() } : {}),
        ...(action === "exception" ? { reason: reason?.trim() } : {}),
        by,
        at: new Date().toISOString(),
      };
    }
    const next = { ...current, findings: current.findings.map((item) => (item.id === input.id ? { ...item, decision } : item)) };
    return { next, message: `Handoff decision on ${input.slug} ${current.prototype?.version ?? input.key}`, result: next };
  });
}

/** Ready for dev, signed with a name and a date. What is still undecided stays as it is: it needn't all be done. */
export async function signOff(input: { slug: string; key: string; by: string }) {
  const by = input.by.trim();
  if (!by) throw new Error("Choose who you are first: the sign-off carries your name.");
  return update(input.slug, input.key, (current) => {
    if (!current) throw new Error("There is nothing to sign off for this version yet.");
    if (current.signOff) throw new Error(`Already signed off by ${current.signOff.by}.`);
    const next = { ...current, signOff: { by, at: new Date().toISOString(), left: undecided(current) } };
    return { next, message: `Handoff signed off: ${input.slug} ${current.prototype?.version ?? input.key}`, result: next };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Doing what the decisions say, in the prototype running on this machine.

const run = promisify(execFile);
const SCANNER = () => join(process.cwd(), ".claude", "skills", "handoff", "scan.mjs");

/**
 * Runs the scanner's apply (or restore) on the prototype's working copy, then saves the findings it scanned again, so what
 * was done is gone from them and the decisions on the rest are kept. Only for a prototype on this machine.
 */
async function runApply(slug: string, key: string, by: string, args: (folder: string, files: { handoff: string; summary: string; rescan: string }) => string[]) {
  if (!workingCopiesOn()) throw new Error("The code can only be changed from the studio running on your machine.");
  if (!existsSync(SCANNER())) throw new Error("The handoff scanner isn't in this studio's folder.");
  const folder = workingFolder(slug);
  const current = await readHandoff(slug, key);
  if (!current) throw new Error("There is nothing handed off for this version yet.");
  if (current.signOff) throw new Error("Signed off already: push a new version to hand off again.");
  const dir = await mkdtemp(join(tmpdir(), "handoff-apply-"));
  const files = { handoff: join(dir, "handoff.json"), summary: join(dir, "summary.json"), rescan: join(dir, "rescan.json") };
  try {
    await writeFile(files.handoff, JSON.stringify(current));
    await run(process.execPath, [SCANNER(), ...args(folder, files), "--by", by || "Someone"], { maxBuffer: 20_000_000, timeout: 5 * 60_000 });
    const summary = JSON.parse(await readFile(files.summary, "utf8"));
    const rescanned = JSON.parse(await readFile(files.rescan, "utf8"));
    await saveFindings({ slug, version: current.prototype?.version ?? key, handoff: rescanned });
    return { summary, current };
  } catch (error) {
    const message = error instanceof Error ? error.message : "It didn't run.";
    throw new Error(message.split("\n").find((line) => line.trim()) ?? message);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Does what the decisions say that a script can (see `applyDecisions` in the scanner), after backing up the files it changes. */
export async function applyHandoff(input: { slug: string; key: string; by: string }) {
  const { summary } = await runApply(input.slug, input.key, input.by, (folder, files) => ["--apply", "--dir", folder, "--handoff", files.handoff, "--summary", files.summary, "--rescan", files.rescan]);
  return update(input.slug, input.key, (current) => {
    if (!current) throw new Error("There is nothing handed off for this version yet.");
    const applied = summary.backup
      ? { at: new Date().toISOString(), by: input.by.trim(), backup: String(summary.backup), changed: summary.changed, manual: summary.manual, left: summary.left, errors: summary.check?.first ?? [] }
      : current.applied ?? null;
    const next = { ...current, applied };
    return { next, message: `Handoff applied: ${input.slug}`, result: { handoff: next, summary } };
  });
}

/** Puts the files back that the last apply replaced, from the copies it made first. */
export async function undoHandoffApply(input: { slug: string; key: string; by: string }) {
  const current = await readHandoff(input.slug, input.key);
  const backup = current?.applied?.backup;
  if (!backup) throw new Error("Nothing was applied that could be undone.");
  await runApply(input.slug, input.key, input.by, (folder, files) => ["--restore", backup, "--dir", folder, "--handoff", files.handoff, "--summary", files.summary, "--rescan", files.rescan]);
  return update(input.slug, input.key, (latest) => {
    if (!latest) throw new Error("There is nothing handed off for this version yet.");
    const next = { ...latest, applied: null };
    return { next, message: `Handoff apply undone: ${input.slug}`, result: next };
  });
}
