import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The /handoffpush skill, as files, for the installer to fetch: the same as /push's (see ../../push/[file]/route.ts).
 * Public code, nothing secret, which is why the door lets them through to a terminal that has no cookie.
 */
const FILES: Record<string, string> = {
  "SKILL.md": "text/markdown; charset=utf-8",
  "handoffpush.mjs": "text/javascript; charset=utf-8",
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = FILES[file];
  if (!type) return new Response("Not found.", { status: 404 });

  const body = await readFile(join(process.cwd(), ".claude", "skills", "handoffpush", file), "utf8");
  return new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });
}
