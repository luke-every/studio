---
name: push
description: Save the prototype you are working on into Prototype Studio as a new version, writing up what changed, then commit and push. Use when the user types /push, or asks to publish, ship, save a version of, or push a prototype to the studio.
---

# /push

Save the current prototype into Prototype Studio.

You are being asked to do the whole thing: work out what changed, write it
up honestly, put the files where they belong, and push. The person should
not have to tell you what they have been doing — you were there.

## 1. Work out what you are pushing

**The file.** A single self-contained HTML file. If the prototype is spread
across files, inline the CSS and JS into one file first and use that; do not
push something that will render broken when served on its own.

**Which studio.** These commands run in the Prototype Studio repository. If
the prototype lives in a different folder, note the file's absolute path —
you will pass it to the script from inside the studio repo.

**Whether it already exists.** Check `registry/prototypes/` for a folder
matching the prototype's name. If it is there, this is a new version of it,
so reuse the exact same `--name` and `--slug`. If it is not, this is v0.1
and you also need `--team`.

**Which team**, for a new prototype only. Read `registry/teams.json` for the
options. If it is genuinely ambiguous, ask — it is one short question and
getting it wrong means moving it later.

## 2. Write the notes

This is the part that matters, and the part only you can do. The version
notes are what someone reads in six weeks to understand why the prototype
looks the way it does.

- `--title` — a short headline for this version, a handful of words.
  "Tighter results layout", not "Update".
- `--changes` — what is new or different. Two or three sentences, or a few
  short lines. Say what changed and, where it is not obvious, what it was
  trying to fix.
- `--description` — only for a new prototype, or when the prototype's
  purpose has genuinely shifted. One sentence on what the thing is.

Write from what actually happened in this session. Do not invent a rationale
you were not given, and do not pad it — "First pass at the results screen"
is a complete and honest note. Never write commit-style noise like "various
improvements" or "update styles".

## 3. Save it

From the Prototype Studio repository:

```
npm run proto:add -- \
  --file <absolute path to the html> \
  --name "<prototype name>" \
  --team <team-slug> \
  --title "<headline>" \
  --changes "<what changed>"
```

Optional: `--slug` to match an existing folder, `--project <slug>` to file
it, `--description` for a new prototype.

The script works out the next version number, copies the file to
`public/p/<slug>/<version>/`, and writes the registry records. Every version
keeps its own copy, so older ones stay viewable — never overwrite one.

## 4. Check, commit, push

```
npm run registry:check
```

If that fails, fix the registry before committing; a broken registry breaks
the studio for everyone.

Then commit and push. Use the prototype and version in the message:

```
prototype(quiz-results): v0.2 tighter results layout
```

The commit is what attributes the version to the person pushing it, so let
it be authored normally — do not amend the author.

## 5. Tell them where it went

One short line: the version number, and that it is live once the deploy
finishes, about a minute. Nothing more.

## Never

- Never edit or delete a saved version. Versions are immutable; if something
  is wrong, push another one.
- Never reuse a version number.
- Never push files without registry records, or records without files.
