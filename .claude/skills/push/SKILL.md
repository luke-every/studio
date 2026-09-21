---
name: push
description: Save the prototype you are working on into Prototype Studio as a new version, writing up what changed, then commit and push. Use when the user types /push, or asks to publish, ship, save a version of, or push a prototype to the studio.
---

# /push

Save the prototype in the current folder into Prototype Studio.

You are being asked to do the whole thing: work out what changed, write it
up honestly, put the files where they belong, and push. The person should
not have to tell you what they have been doing — you were there.

**You are almost certainly not in the studio repository.** Prototypes live
in their own folders. Everything below addresses the studio by absolute
path, and nothing is ever committed in the current directory.

## 1. Find the studio

Read `~/.claude/prototype-studio.json`:

```json
{ "path": "/Users/luke/Claude/proto" }
```

Call that path `$STUDIO` from here on. If the file is missing or the path
does not exist, ask where the studio repository is, then write the file so
this never has to be asked again.

Make sure it is current before writing anything:

```
git -C "$STUDIO" pull --rebase
```

If that fails because of local changes in the studio, stop and say so
rather than pushing on top of a mess.

## 2. Work out what you are pushing

**The file.** One self-contained HTML file. If the prototype is spread
across several files, inline the CSS and JS into a single file first and
push that — never push something that renders broken when served alone.
Write the combined file somewhere temporary; do not leave build artefacts in
the person's prototype folder.

**Whether it already exists.** Look in `$STUDIO/registry/prototypes/` for a
folder matching this prototype. If it is there, this is a new version:
reuse the exact same `--name` and pass `--slug <folder name>`. If not, this
is v0.1 and you also need `--team`.

**Which team**, for a new prototype only. Read `$STUDIO/registry/teams.json`
for the options. If it is genuinely ambiguous, ask — one short question
beats filing it wrongly.

## 3. Write the notes

This is the part that matters, and the part only you can do. These notes are
what someone reads in six weeks to understand why the prototype looks the
way it does.

- `--title` — a short headline for this version, a handful of words.
  "Tighter results layout", not "Update".
- `--changes` — what is new or different. Two or three sentences, or a few
  short lines. Say what changed and, where it is not obvious, what it was
  trying to fix.
- `--description` — only for a new prototype, or when its purpose has
  genuinely shifted. One sentence on what the thing is.

Write from what actually happened in this session. Do not invent a rationale
you were not given, and do not pad — "First pass at the results screen" is a
complete and honest note. Never write commit-style noise like "various
improvements".

## 4. Save it

Run from the studio, whatever directory you are in:

```
cd "$STUDIO" && npm run proto:add -- \
  --file "<absolute path to the html>" \
  --name "<prototype name>" \
  --team <team-slug> \
  --title "<headline>" \
  --changes "<what changed>"
```

Add `--slug <folder>` for an existing prototype, `--project <slug>` to file
it, `--description` for a new one.

The script works out the next version number, copies the file to
`public/p/<slug>/<version>/`, and writes the registry records. Every version
keeps its own copy of the files, so older ones stay viewable — never
overwrite or delete one.

## 5. Check, commit, push

```
cd "$STUDIO" && npm run registry:check
```

Fix anything it reports before committing; a broken registry breaks the
studio for everyone.

Then, still addressing the studio explicitly:

```
git -C "$STUDIO" add registry public/p
git -C "$STUDIO" commit -m "prototype(<slug>): <version> <headline>"
git -C "$STUDIO" push
```

Commit only `registry/` and `public/p/` — never sweep up unrelated changes
in the studio. The commit is what attributes the version to the person
pushing it, so let it be authored normally.

## 6. Tell them where it went

One line: the version number, and that it is live once the deploy finishes,
about a minute. Nothing more.

## Never

- Never run git in the prototype folder. It may be its own repository.
- Never edit or delete a saved version. If something is wrong, push another.
- Never reuse a version number.
- Never push files without registry records, or records without files.
