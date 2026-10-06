---
name: push
description: Save the prototype you are working on into Prototype Studio as a new version, writing up what changed. Use when the user types /push, or asks to publish, ship, save a version of, or push a prototype to the studio.
---

# /push

Save the prototype in the current folder into Prototype Studio.

You are being asked to do the whole thing: work out what changed, write it
up honestly, and upload it. The person should not have to tell you what they
have been doing — you were there.

This uploads over HTTP — the files go straight to the studio's content
repository on GitHub through its API, and the studio records the version.
There is no clone, no local git, and nothing is deployed: the prototype
appears in the studio within seconds. There's no size limit to work around —
up to 100MB a file, as big a folder as it needs. **Never run git here.**
The prototype folder may be its own repository and has nothing to do with
the studio's.

## 1. Find the studio

Read `~/.claude/prototype-studio.json`:

```json
{ "url": "https://prototype-studio.vercel.app", "password": "…" }
```

If it is missing or empty, this machine isn't set up yet. Tell the person to
open the studio, tap "Get set up" (or open Settings), and paste the one command
there into Terminal; it installs this skill and saves the address and password.
If they would rather give them to you, ask for the address and password and
write the file yourself.

## 2. Work out what you are pushing

**The folder.** Upload it as it is — nothing needs inlining, bundling, or
reading through by you first. That's the upload script's job (step 4): it
walks the folder and sends every file at its real relative path, so a local
reference anywhere in it (an HTML file's `<script src>`, a stylesheet's own
`url(...)` to a font) still resolves once served. Just know which file is
the entry (usually `index.html`) and which folder is the prototype's root.

If the prototype is a real build with a compile step (bundled JS modules,
a framework's build output), push the built output folder, not the source.

**Whether it already exists.** Ask the studio:

```
curl -s "<url>/api/prototypes" -H "x-studio-password: <password>"
```

It returns the prototypes with their slugs and teams. If this prototype is
listed, pass its `slug` and the upload becomes its next version. If it is
not listed, it is new and also needs a `team`.

**Which team**, for a new prototype only. The same response lists them. If
it is genuinely ambiguous, ask — one short question beats filing it wrongly.

## 3. Write the notes

This is the part that matters, and the part only you can do. These notes are
what someone reads in six weeks to understand why the prototype looks the
way it does.

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

## 4. Upload

One script does the whole thing: asks the studio which version this will be,
commits every file in the folder to the content repository at its real
relative path, then tells the studio — nothing is read into your own
context to do this, and nothing is inlined or rewritten. A large folder
takes a little longer; let it run.

```
node ~/.claude/skills/push/push.mjs \
  --dir /absolute/path/to/the/prototype \
  --name "Quiz results" \
  --author "<the person's name>" \
  --title "Tighter results layout" \
  --changes "Cut the second card. Moved the CTA above the fold."
```

Add `--entry app.html` if the entry isn't `index.html`, `--slug quiz-results`
for an existing prototype, `--team acquisition` for a new one, and
optionally `--project <slug>` or `--description "..."`.

If the person gives a Figma or Notion link for the prototype, add
`--figma <url>` and/or `--notion <url>`. The studio shows them under the
prototype, and keeps the last ones it was given. Only pass what you were given.

The version number is normally the next one, chosen by the studio. If the
person asks for a specific number ("push this as v1.0"), add `--version v1.0`.
It must look like `v0.8` and be one that prototype doesn't already have —
the studio refuses a number that exists. Only pass it when asked; never to
"fix" an error.

For the author, use the person's name as they would write it — their git
`user.name` is a good default if you do not otherwise know it.

If it prints a "Heads up" about the prototype adding the time to its own file
addresses, tell the person in one line: it makes the prototype slow to open in
the studio, and the fix is to pin that value to a fixed string.

It prints what it uploaded, the version that was saved, and a link to it.
Trust that output — there is no need to open anything it wrote or sent to
check it.

## 5. Tell them where it went

One line: the version number and the link from the response. Nothing more.

## Never

- Never run git in the prototype folder, or anywhere, for this.
- Never re-upload an existing version — the studio refuses, and rightly.
  If something is wrong, push another version.
- Never invent what changed.
