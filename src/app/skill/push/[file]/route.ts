import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The /push skill, as files, for the installer to fetch.
 *
 * Only these two, read from the skill's own folder in this repository, so the
 * studio always hands out the version that matches it. They are the same
 * public code as in the repository; nothing here is secret, which is why the
 * door lets them through to a terminal that has no cookie.
 */
const FILES: Record<string, string> = {
  "SKILL.md": "text/markdown; charset=utf-8",
  "push.mjs": "text/javascript; charset=utf-8",
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = FILES[file];
  if (!type) return new Response("Not found.", { status: 404 });

  const body = await readFile(join(process.cwd(), ".claude", "skills", "push", file), "utf8");
  return new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });
}
