import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

/**
 * The command behind the Remix button.
 *
 *   curl -fsSL https://<studio>/remix/<slug>/<version> | sh
 *
 * Makes sure this machine is set up the way /push is (the installer saves the
 * studio's address and password), then runs scripts/remix.mjs, which copies
 * the version into a new folder and opens Claude Code in it. The slug and
 * version are checked against a strict pattern because they end up in a shell.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; version: string }> }) {
  const { slug, version } = await params;
  if (!/^[a-z0-9-]+$/.test(slug) || !/^v\d+\.\d+$/.test(version)) return new Response("Not found.", { status: 404 });

  const studio = request.nextUrl.origin;
  const remix = await readFile(join(process.cwd(), "scripts", "remix.mjs"), "utf8");

  const script = `#!/bin/sh
set -e
STUDIO="${studio}"
CONFIG="$HOME/.claude/prototype-studio.json"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed. Install it from https://nodejs.org, then run this again."
  exit 1
fi

# First time on this machine: the installer saves the address and password.
if ! grep -q "\\"$STUDIO\\"" "$CONFIG" 2>/dev/null; then
  curl -fsSL "$STUDIO/install.sh" | sh
fi

SCRIPT="$(mktemp).mjs"
trap 'rm -f "$SCRIPT"' EXIT
cat > "$SCRIPT" <<'REMIX_SCRIPT'
${remix}
REMIX_SCRIPT
node "$SCRIPT" ${slug} ${version}
`;

  return new Response(script, {
    headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" },
  });
}
