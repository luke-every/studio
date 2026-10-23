---
name: push
description: Save the prototype you are working on into Prototype Studio as a new version, writing up what changed. Use when the user types /push, or asks to publish, ship, save a version of, or push a prototype to the studio.
---

# /push

Save the prototype in the current folder into Prototype Studio.

You are being asked to do the whole thing: work out what changed, write it
up honestly, and upload it. The person should not have to tell you what they
have been doing — you were there.

One script does the rest. It reads the studio's address from
`~/.claude/prototype-studio.json`, asks the studio which version this will be,
builds the app if it is one, sends every file to the content repository in a
single upload (however many files there are; only what changed travels), and
records the version. The prototype is live within seconds. The script uses git
for that in a throwaway folder of its own. **Never run git yourself**: the
prototype folder may be its own repository and has nothing to do with the studio's. Don't read the folder's
files to check the upload; trust the script's output.

## 1. What to push

- **A folder with an `index.html`:** push it as it is. Nothing needs inlining
  or bundling.
- **A Next app** (`package.json` with `next`, no `index.html`): push the app's
  own folder. The script installs, builds it pinned to the version's address,
  so it behaves exactly as in `next dev`, and saves the source beside it in
  `_source/` for engineers. Studio prototypes are static, so API routes,
  server actions and middleware can't be part of one. An app's own config may
  leave them out, so the script just builds; if the build fails it names them. Fetching data from the browser is fine.
  It doesn't matter how the app was started: if its `next.config` doesn't know
  about the studio, the script builds behind a temporary wrapper and puts the
  person's config back untouched. Don't edit their config or code to make a
  build work.
- **Any other build:** build it yourself and push the output folder.

The prototype's name decides whether it is new or the next version of one the
studio has, so there is nothing to look up. A new prototype needs a team: if
you leave `--team` out the script says so and lists the teams. Pick the
obvious one, or ask one short question if it is genuinely ambiguous.

If the script says no studio is configured, the person hasn't run the install
command yet. Tell them to open the studio, tap "Get set up", and paste the one
command into Terminal.

**Flow:** the script carries the previous version's flow forward on its own, as long as its parameters are still read by the files.
Read `FLOW.md` (next to this file) only if this is the first push of a
multi-screen prototype, or this session changed its screens or navigation.
Otherwise skip it.

**Controls:** switchable states, variants or scenarios belong in studio
controls. If the folder has none, the script carries the previous version's
forward, only those that still apply (something still reads their parameter);
`--no-controls` drops them. Read the "Controls" section of `FLOW.md` only if
this prototype has such switches.

## 2. Write the notes

These notes are what someone reads in six weeks to understand why the
prototype looks the way it does.

- `title` — a short headline for this version, a handful of words.
  "Tighter results layout", not "Update".
- `changes` — what is new or different. Two or three sentences, or a few
  short lines. Say what changed and, where it is not obvious, what it was
  trying to fix.
- `description` — only for a new prototype, or when its purpose has
  genuinely shifted. One sentence on what the thing is.

Write from what actually happened in this session. Do not invent a rationale
you were not given, and do not pad — "First pass at the results screen" is a
complete and honest note. Never write commit-style noise like "various
improvements".

## 3. Upload

```
node ~/.claude/skills/push/push.mjs \
  --dir /absolute/path/to/the/prototype \
  --name "Quiz results" \
  --title "Tighter results layout" \
  --changes "Cut the second card. Moved the CTA above the fold."
```

The author is the person's git `user.name` unless you pass `--author "<name>"`.
Add `--team acquisition` for a new prototype, `--flow <file>` only when the
flow is new or changed (`--no-flow` drops it), `--entry app.html` if the entry isn't `index.html`, `--project <slug>`,
`--description "..."`, and `--figma <url>` / `--notion <url>` only if the
person gave you those links.

**Small edit or new version.** Decide this yourself from what changed this
session. Copy, spelling, a colour or spacing tweak, a bug fix: add `--small`, and
v3.2 becomes v3.2.1 instead of v3.3. A new screen, a changed flow, a different
approach: leave it off. If it's genuinely unclear, leave it off. Say which you
chose in your closing line.

Only if the person asks for a specific number ("push this as v1.0"), add
`--version v1.0`. It must look like `v0.8` and be one that prototype doesn't
already have. Never pass it to "fix" an error.

If it prints "Fixed N file path(s) that started with "/"", the script has already
corrected them in the uploaded copy; their source is untouched and stays right for
production. Mention it in one line only if they ask. If instead it prints a "Heads up"
about paths starting with "/", those name no file in the site (or are built in code),
so they won't load in the studio: tell the person in one line that the fix is the
framework's image component or a literal path to a file in `public/`; don't change
their code unless they ask.

If it prints a "Heads up" about the prototype adding the time to its own file
addresses, tell the person in one line: it makes the prototype slow to open in
the studio, and the fix is to pin that value to a fixed string.

## If the script stops

Tell the person in a line or two what it said, and ask what they want to do.
**Do not** edit their code, open a browser, run builds or checks, or try
another approach to get past it. Those are their decisions, and each costs
minutes.

Two lines that are not problems: "Couldn't send it in one go … uploading file by
file instead" (no git on this Mac, or it couldn't reach GitHub; it carries on), and
"GitHub asked to slow down; waiting …" (it waits and carries on). If it still stops
on GitHub's rate limit, nothing was saved: say to run /push again in a few minutes.

## 4. Tell them where it went

One line: the version number and the link the script printed, plus its `Flow:`
and `Time:` lines. Nothing more.

## Never

- Never run git in the prototype folder, or anywhere, for this.
- Never re-upload an existing version — the studio refuses, and rightly.
  If something is wrong, push another version.
- Never invent what changed.
