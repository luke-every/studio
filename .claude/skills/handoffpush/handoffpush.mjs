#!/usr/bin/env node
/**
 * /handoffpush: sends the handoff made on this machine to the studio's latest pushed version, without pushing the
 * prototype again. Reads `.studio/handoff.json` (what /handoff and the review made) and `.studio/pushed.json` (what the
 * last /push sent), and says whether the files have changed since either.
 *
 *   node handoffpush.mjs --dir <prototype> --name "<its name in the studio>" [--version v1.3]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const dir = resolve(flag("dir") ?? ".");
const name = flag("name") ?? flag("slug");
if (!name) fail('Say which prototype this is: --name "<its name in the studio>".');

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);
const handoff = read(join(dir, ".studio", "handoff.json"));
if (!handoff) fail("There is no handoff here yet. Run /handoff first, then review it in the studio.");
const pushed = read(join(dir, ".studio", "pushed.json"));

const config = read(join(homedir(), ".claude", "prototype-studio.json")) ?? {};
const base = flag("studio-url") ?? config.url;
if (!base) fail('No studio configured in ~/.claude/prototype-studio.json. Open the studio and use "Get set up".');
const headers = { "content-type": "application/json", ...((flag("studio-password") ?? config.password) ? { "x-studio-password": flag("studio-password") ?? config.password } : {}) };

const call = async (path, init = {}) => {
  const response = await fetch(new URL(path, base), { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) fail(body.error ?? `The studio answered ${response.status}.`);
  return body;
};

// The studio's latest version of this prototype is where it goes, unless --version says another.
const { prototypes } = await call("/api/prototypes");
const found = prototypes.find((item) => item.slug === name.toLowerCase() || item.name.toLowerCase() === name.toLowerCase());
if (!found) fail(`The studio has no prototype called "${name}". /push it first.`);
const version = flag("version") ?? found.latest;

const sha = (file) => {
  try {
    return createHash("sha1").update(readFileSync(join(dir, file))).digest("hex");
  } catch {
    return null;
  }
};
// Live files as they were when the handoff was made, and as they were when the version was pushed.
const changedSinceHandoff = Object.entries(handoff.scope?.hashes ?? {}).filter(([file, hash]) => sha(file) !== hash).map(([file]) => file);
const changedSincePush = pushed ? Object.keys(handoff.scope?.hashes ?? {}).filter((file) => sha(file) !== pushed.hashes?.[file]) : null;

const saved = await call("/api/handoff", { method: "POST", body: JSON.stringify({ slug: found.slug, version, handoff, carried: true, changedSince: changedSinceHandoff }) });
console.log(`Handoff sent to ${found.slug} ${saved.version}${handoff.signOff ? `, signed off by ${handoff.signOff.by}` : ", not signed off yet"}.`);
if (changedSinceHandoff.length) console.log(`${changedSinceHandoff.length} file(s) changed since the handoff was made, so it may be out of date: ${changedSinceHandoff.slice(0, 3).join(", ")}${changedSinceHandoff.length > 3 ? ", …" : ""}.`);
if (changedSincePush === null) console.log("Nothing on this machine says what was pushed, so whether the version's code matches this handoff isn't known.");
else if (pushed.version !== saved.version) console.log(`Your last push from here was ${pushed.version}, not ${saved.version}: the handoff describes your files as they are now.`);
else if (changedSincePush.length) console.log(`${changedSincePush.length} file(s) the handoff describes have changed since ${pushed.version} was pushed (${changedSincePush.slice(0, 3).join(", ")}${changedSincePush.length > 3 ? ", …" : ""}): /push too, or the engineers' source won't match it.`);
