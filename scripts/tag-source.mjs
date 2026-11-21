import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Has a project tag each element of its own files (src) with where it is written (`data-studio-loc`), while the page is built in development: the loader goes
 * into the project (with the path of its src), and a rule for it into its next.config.ts. The project's dev server reads its config once, so it is restarted
 * after this is first done. Returns "added" or "updated" when the config was changed, "present" when it already had it, and "skipped" when it has no
 * `turbopack: {` to put the rule in.
 */
export function ensureTagging(dir) {
  const loader = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "studio-loc-loader.cjs"), "utf8");
  writeFileSync(join(dir, "studio-loc-loader.cjs"), loader.replace("__SRC__", JSON.stringify(join(dir, "src") + sep).slice(1, -1)));
  const config = join(dir, "next.config.ts");
  const text = readFileSync(config, "utf8");
  // The first version of the rule was for forks only.
  const old = 'condition: { path: "**/src/components/forks/**" }';
  if (text.includes(old)) {
    writeFileSync(config, text.replace(old, 'condition: "development"').replace("tags each element of a fork's files", "tags each element of this project's own files"));
    return "updated";
  }
  if (text.includes("studio-loc-loader")) return "present";
  const comment = "    // Written by the studio: tags each element of this project's own files with where it is written, while the page is built in development, so a change made on the canvas is written to that element.";
  const rules = '    rules: { "*.tsx": { condition: "development", loaders: [process.cwd() + "/studio-loc-loader.cjs"] } },';
  // The starter's config has no turbopack block yet: it gets one.
  if (!text.includes("turbopack: {")) {
    const start = "const nextConfig: NextConfig = {";
    if (!text.includes(start)) return "skipped";
    writeFileSync(config, text.replace(start, `${start}\n  turbopack: {\n${comment}\n${rules}\n  },`));
    return "added";
  }
  const rule = [
    "turbopack: {",
    "    // Written by the studio: tags each element of this project's own files with where it is written, while the page is built in development, so a change made on the canvas is written to that element.",
    '    rules: { "*.tsx": { condition: "development", loaders: [process.cwd() + "/studio-loc-loader.cjs"] } },',
  ].join("\n");
  writeFileSync(config, text.replace("turbopack: {", rule));
  return "added";
}
