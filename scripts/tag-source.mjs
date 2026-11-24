import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Has a project tag each element of its own files (src) with where it is written (`data-studio-loc`), while the page is built in development and when a version
 * is pushed to the studio (`STUDIO_BASE_PATH` is set): a pushed version is what an engineer opens, and without the tag nothing on it says which line an element came
 * from. The files themselves are not changed. The loader goes into the project (with the path of its src), and a rule for it into its next.config.ts. The project's dev server reads its config once, so it is restarted
 * after this is first done. Returns "added" or "updated" when the config was changed, "present" when it already had it, and "skipped" when it has no
 * `turbopack: {` to put the rule in.
 */
/** The rule as the studio first wrote it (development only), and as it is now. */
const DEV_ONLY = '{ "*.tsx": { condition: "development", loaders: [process.cwd() + "/studio-loc-loader.cjs"] } }';
const RULE = '{ "*.tsx": { ...(process.env.STUDIO_BASE_PATH ? {} : { condition: "development" }), loaders: [process.cwd() + "/studio-loc-loader.cjs"] } }';
const SAID = "tags each element of this project's own files with where it is written, while the page is built in development, so a change";
const NOW = "tags each element of this project's own files with where it is written, while the page is built in development or pushed to the studio, so a change";

export function ensureTagging(dir) {
  const loader = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "studio-loc-loader.cjs"), "utf8");
  writeFileSync(join(dir, "studio-loc-loader.cjs"), loader.replace("__SRC__", JSON.stringify(join(dir, "src") + sep).slice(1, -1)));
  const config = join(dir, "next.config.ts");
  const text = readFileSync(config, "utf8");
  // The first version of the rule was for forks only, the second for development only: each is brought to the one that also tags a pushed version.
  const old = 'condition: { path: "**/src/components/forks/**" }';
  let moved = text;
  if (moved.includes(old)) moved = moved.replace(old, 'condition: "development"').replace("tags each element of a fork's files", "tags each element of this project's own files");
  if (moved.includes(DEV_ONLY)) moved = moved.replace(DEV_ONLY, RULE).replace(SAID, NOW);
  if (moved !== text) {
    writeFileSync(config, moved);
    return "updated";
  }
  if (text.includes("studio-loc-loader")) return "present";
  const comment = `    // Written by the studio: ${NOW} made on the canvas is written to that element.`;
  const rules = `    rules: ${RULE},`;
  // The starter's config has no turbopack block yet: it gets one.
  if (!text.includes("turbopack: {")) {
    const start = "const nextConfig: NextConfig = {";
    if (!text.includes(start)) return "skipped";
    writeFileSync(config, text.replace(start, `${start}\n  turbopack: {\n${comment}\n${rules}\n  },`));
    return "added";
  }
  const rule = ["turbopack: {", comment, rules].join("\n");
  writeFileSync(config, text.replace("turbopack: {", rule));
  return "added";
}

/** A page in the studio's frame does not zoom the browser window when it is pinched (Safari sends a pinch as gestures, which can be taken without touching scrolling). */
const HOLD_MARK = "no browser zoom";
const HOLD = `
// Written by the studio: no browser zoom. A pinch over the page does not zoom the browser window while it is in the studio's frame. Scrolling is not touched.
if (typeof window !== "undefined" && window.parent !== window) {
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) window.addEventListener(name, (event) => event.preventDefault());
}
`;
/** What the studio wrote here before: it passed a pinch and ⌘-scroll up to zoom the canvas, whose wheel listener made scrolling in the page stutter. It is taken out. */
const OLD_ZOOM = "\n// Written by the studio: a pinch or ⌘/ctrl-scroll over the page zooms the studio's canvas";

/** Has a project's `src/lib/studio-measure.ts` (the studio's helper, in every prototype) hold back the browser's zoom. Added once, to whatever version of the file is there (the studio's earlier zoom code, written after the rest, is replaced); nothing when it has none. Returns whether it was written. */
export function ensureNoBrowserZoom(dir) {
  const file = join(dir, "src", "lib", "studio-measure.ts");
  if (!existsSync(file)) return false;
  let text = readFileSync(file, "utf8");
  const old = text.indexOf(OLD_ZOOM);
  if (old === -1 && text.includes(HOLD_MARK)) return false;
  if (old !== -1) text = text.slice(0, old);
  writeFileSync(file, text.replace(/\s*$/, "\n") + HOLD);
  return true;
}
