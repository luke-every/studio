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
 * It also sets up /newprototype. The starter app and conventions are in a
 * private repository with licensed fonts in it, so the studio hands them over
 * (see /skill/newprototype/bundle) to anyone with the studio password — nobody
 * has to be added to anything on GitHub. If that isn't possible yet, /push is
 * still fully set up and the script says why.
 */

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

# /newprototype: starts a prototype in the team's style. The studio hands over
# the starter app and conventions, using the same password. Never fails the install.
CONVENTIONS="$HOME/Claude/team-conventions"
NEWPROTOTYPE="no"
NEWPROTOTYPE_WHY=""
if [ -d "$CONVENTIONS/.git" ]; then
  # Your own clone of the conventions: keep it, just bring it up to date.
  (cd "$CONVENTIONS" && git pull -q --ff-only) 2>/dev/null || true
else
  BUNDLE="$(mktemp)"
  CODE=$(curl -sL -H "x-studio-password: $PASSWORD" -o "$BUNDLE" -w "%{http_code}" "$STUDIO/skill/newprototype/bundle" 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ] && tar -tzf "$BUNDLE" >/dev/null 2>&1; then
    mkdir -p "$CONVENTIONS"
    tar -xzf "$BUNDLE" -C "$CONVENTIONS" --strip-components=1
  elif [ "$CODE" = "403" ]; then
    NEWPROTOTYPE_WHY="The studio has no password yet, and the fonts in it are licensed. Ask Luke to set one."
  elif [ "$CODE" = "401" ]; then
    NEWPROTOTYPE_WHY="That password wasn't accepted. Fix it in ~/.claude/prototype-studio.json and run this again."
  else
    NEWPROTOTYPE_WHY="The studio couldn't hand it over right now (answer $CODE). Run this again in a minute."
  fi
  rm -f "$BUNDLE"
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
  echo "/newprototype (start a prototype in the team's style) isn't set up yet."
  echo "$NEWPROTOTYPE_WHY"
fi
`;

  return new Response(script, {
    headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "no-store" },
  });
}
