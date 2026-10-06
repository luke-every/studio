import type { NextRequest } from "next/server";

/**
 * The one command a new person runs to be able to /push.
 *
 *   curl -fsSL https://<studio>/install.sh | sh
 *
 * It's written for this studio — the address is the one it was fetched from —
 * so there is nothing to fill in. It puts the skill where Claude Code looks
 * for it, and saves the studio's address and password once. No GitHub account
 * or key is involved: /push talks to the studio, and the studio talks to
 * GitHub. Run again, it updates the skill and keeps the saved password.
 *
 * It also sets up /newprototype when it can. That one is different: the
 * starter app and the conventions live in a private repository (with licensed
 * fonts in it), so they are fetched with the person's own GitHub login rather
 * than handed out here. If they can't see that repository yet, /push is still
 * fully set up and the script says what to do for the rest.
 */

const CONVENTIONS_REPO = "luke-every/team-conventions";

export function GET(request: NextRequest) {
  const studio = request.nextUrl.origin;

  const script = `#!/bin/sh
# Set up /push for Claude Code. Safe to run again: it updates.
set -e

STUDIO="${studio}"
CLAUDE_DIR="$HOME/.claude"
SKILL_DIR="$CLAUDE_DIR/skills/push"
CONFIG="$CLAUDE_DIR/prototype-studio.json"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed for /push. Install it from https://nodejs.org, then run this again."
  exit 1
fi

mkdir -p "$SKILL_DIR"
curl -fsSL "$STUDIO/skill/push/SKILL.md" -o "$SKILL_DIR/SKILL.md"
curl -fsSL "$STUDIO/skill/push/push.mjs" -o "$SKILL_DIR/push.mjs"

# Keep the password from last time, if it was for this studio.
PASSWORD=""
if [ -f "$CONFIG" ]; then
  PASSWORD=$(node -e '
    try {
      const saved = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      if (saved.url === process.argv[2]) process.stdout.write(saved.password || "");
    } catch {}
  ' "$CONFIG" "$STUDIO")
fi

if [ -z "$PASSWORD" ] && (exec < /dev/tty) 2>/dev/null; then
  printf "Studio password (the one you use to get in; press Enter if there isn't one): "
  stty -echo < /dev/tty 2>/dev/null || true
  read -r PASSWORD < /dev/tty || PASSWORD=""
  stty echo < /dev/tty 2>/dev/null || true
  echo
fi

node -e '
  require("fs").writeFileSync(
    process.argv[1],
    JSON.stringify({ url: process.argv[2], password: process.argv[3] }, null, 2) + "\\n",
  );
' "$CONFIG" "$STUDIO" "$PASSWORD"

# /newprototype: starts a prototype in the team's style. Needs your own GitHub
# access to ${CONVENTIONS_REPO}; never fails the install.
CONVENTIONS="$HOME/Claude/team-conventions"
NEWPROTOTYPE="no"
if [ -d "$CONVENTIONS/.git" ]; then
  (cd "$CONVENTIONS" && git pull -q --ff-only) 2>/dev/null || true
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  mkdir -p "$HOME/Claude"
  gh repo clone ${CONVENTIONS_REPO} "$CONVENTIONS" -- -q >/dev/null 2>&1 || true
fi
if [ -d "$CONVENTIONS/skills/newprototype" ]; then
  cp -R "$CONVENTIONS/skills/newprototype" "$CLAUDE_DIR/skills/"
  NEWPROTOTYPE="yes"
fi

echo
echo "/push is ready. Open Claude Code in your prototype's folder and type /push."
if [ "$NEWPROTOTYPE" = "yes" ]; then
  echo "/newprototype is ready too: in an empty folder, type /newprototype."
else
  echo
  echo "/newprototype (start a prototype in the team's style) isn't set up yet. It needs your own"
  echo "GitHub access to ${CONVENTIONS_REPO}:"
  echo "  1. Ask Luke to add your GitHub account to that repository."
  echo "  2. Install the GitHub CLI (brew install gh) and run: gh auth login"
  echo "  3. Run this command again."
fi
`;

  return new Response(script, {
    headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" },
  });
}
