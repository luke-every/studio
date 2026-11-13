// A runnable check of what puts a Claude run's changes back (src/lib/registry/claude-undo.ts): edited, created and deleted
// files, a file changed since, and the cases where no undo is offered. Run from the studio's folder:
//   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/check-undo.ts
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChangedSince, changesSince, put, snapshot } from "@/lib/registry/claude-undo";

const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);
const fresh = () => {
  const folder = mkdtempSync(join(tmpdir(), "undo-check-"));
  mkdirSync(join(folder, "src/app"), { recursive: true });
  mkdirSync(join(folder, "node_modules/x"), { recursive: true });
  mkdirSync(join(folder, ".studio"), { recursive: true });
  writeFileSync(join(folder, "src/app/page.tsx"), "one");
  writeFileSync(join(folder, "src/app/gone.tsx"), "to be deleted");
  writeFileSync(join(folder, "src/same.ts"), "same");
  writeFileSync(join(folder, "node_modules/x/index.js"), "dep");
  writeFileSync(join(folder, "big.mp4"), Buffer.alloc(1024 * 1024 + 1));
  return { folder, snap: join(folder, ".studio/snapshot"), kept: join(folder, ".studio/undo/r1") };
};
const later = () => Date.now() + 2000;

(async () => {
  // Edited, created, deleted; unchanged, installed and oversized files left out.
  let { folder, snap, kept } = fresh();
  await snapshot(folder, snap, "t1");
  assert.equal(existsSync(join(snap, "before/big.mp4")), false, "an oversized file isn't copied");
  assert.equal(existsSync(join(snap, "before/node_modules")), false, "installed files aren't looked at");
  writeFileSync(join(folder, "src/app/page.tsx"), "two");
  writeFileSync(join(folder, "src/new.ts"), "made");
  rmSync(join(folder, "src/app/gone.tsx"));
  writeFileSync(join(folder, "node_modules/x/index.js"), "changed dep");
  const changes = await changesSince(folder, snap, "t1", kept, later());
  assert.deepEqual(changes?.map((c) => [c.path, !!c.before, !!c.after]).sort(), [["src/app/gone.tsx", true, false], ["src/app/page.tsx", true, true], ["src/new.ts", false, true]]);
  assert.equal(existsSync(snap), false, "the snapshot is used up");

  await put(folder, kept, changes!, "before");
  assert.deepEqual([read(join(folder, "src/app/page.tsx")), read(join(folder, "src/new.ts")), read(join(folder, "src/app/gone.tsx"))], ["one", null, "to be deleted"], "undo");
  await put(folder, kept, changes!, "after");
  assert.deepEqual([read(join(folder, "src/app/page.tsx")), read(join(folder, "src/new.ts")), read(join(folder, "src/app/gone.tsx"))], ["two", "made", null], "redo");

  // Changed since: refused whole, nothing touched.
  writeFileSync(join(folder, "src/new.ts"), "the owner's later work");
  await assert.rejects(put(folder, kept, changes!, "before"), ChangedSince);
  assert.deepEqual([read(join(folder, "src/app/page.tsx")), read(join(folder, "src/new.ts")), read(join(folder, "src/app/gone.tsx"))], ["two", "the owner's later work", null], "refused, nothing touched");
  // A path that would leave the folder is refused too.
  await assert.rejects(put(folder, kept, [{ path: "../outside.txt", before: null, after: null }], "before"), ChangedSince);
  rmSync(folder, { recursive: true });

  // Nothing changed: nothing kept.
  ({ folder, snap, kept } = fresh());
  await snapshot(folder, snap, "t1");
  assert.deepEqual(await changesSince(folder, snap, "t1", kept, later()), []);
  assert.equal(existsSync(kept), false);

  // Another run's snapshot, none at all, an oversized file changed, or a file written after the run ended: no undo.
  await snapshot(folder, snap, "t1");
  writeFileSync(join(folder, "src/same.ts"), "x");
  assert.equal(await changesSince(folder, snap, "other", kept, later()), null);
  assert.equal(await changesSince(folder, snap, "t1", kept, later()), null, "no snapshot left");
  await snapshot(folder, snap, "t1");
  writeFileSync(join(folder, "big.mp4"), Buffer.alloc(1024 * 1024 + 2));
  assert.equal(await changesSince(folder, snap, "t1", kept, later()), null);
  await snapshot(folder, snap, "t1");
  writeFileSync(join(folder, "src/same.ts"), "written after the run ended");
  assert.equal(await changesSince(folder, snap, "t1", kept, Date.now() - 60_000), null);
  assert.equal(existsSync(kept), false, "nothing kept when it can't be undone");
  rmSync(folder, { recursive: true });
  console.log("ok: undo check");
})().catch((error) => { console.error(error); process.exit(1); });
