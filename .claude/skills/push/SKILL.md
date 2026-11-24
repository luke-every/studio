---
name: push
description: Save the prototype you are working on into Studio as a new version, writing up what changed. Use when the user types /push, or asks to publish, ship, save a version of, or push a prototype to the studio.
---

# /push

Save the prototype in the current folder into Studio. Work out what changed, write it up honestly, and upload it: you were there, so the person shouldn't have to tell you.

One script does the rest (installs and builds a Next app, uploads only what changed, records the version). **Never run git yourself**, and don't read the folder's files to check the upload: trust the script's output.

## 1. Check what it is

- A folder with `index.html`: pushed as it is. A Next app (`package.json` with `next`): the script builds it and saves the source beside it. Any other build: build it yourself and push the output folder. Studio prototypes are static, so API routes, server actions and middleware can't be part of one; the script names them if the build fails. Don't edit the person's config or code to make a build work.
- The prototype's name decides whether it is new or the next version of an existing one. A new prototype needs `--team`: if you leave it out the script lists the teams; pick the obvious one or ask one short question.
- Read `FLOW.md` (next to this file) only if this is the first push of a multi-screen prototype, this session changed its screens or navigation, or the prototype has switchable states or variants. Otherwise skip it: the script carries the previous flow and controls forward.

## 2. Write the notes

What someone reads in six weeks to understand why the prototype looks the way it does.

- `title`: a short headline for this version, a handful of words. "Tighter results layout", not "Update".
- `changes`: what is new or different, in two or three sentences or a few short lines, and where it isn't obvious what it was trying to fix.
- `description`: only for a new prototype, or when its purpose has shifted. One sentence on what the thing is. If `.studio/summary.md` is in the folder (written from the prototype's Notion brief), use its text as it is for a new prototype and write no other.

Write from what actually happened in this session. Don't invent a rationale you weren't given, don't pad ("First pass at the results screen" is complete), and never write "various improvements".

## 3. Upload

```
node ~/.claude/skills/push/push.mjs \
  --dir /absolute/path/to/the/prototype \
  --name "Quiz results" \
  --title "Tighter results layout" \
  --changes "Cut the second card. Moved the CTA above the fold."
```

Add `--team <slug>` for a new prototype, `--description "..."`, `--small` for a small edit, `--flow <file>` only when the flow is new or changed.

**Small edit or new version:** decide from what changed this session. Copy, spelling, a colour or spacing tweak, a bug fix: `--small` (v3.2 becomes v3.2.1). A new screen, a changed flow, a different approach: leave it off. Unclear: leave it off. Say which you chose in your closing line.

**If the script stops,** tell the person in a line or two what it said and ask what they want to do. Don't edit their code, open a browser, run builds or checks, or try another approach. If it printed a "Heads up" or "Fixed N file path(s)" line, or a line about rate limits, or the person gave a specific version number, a Figma or a Notion link: read `REFERENCE.md` (next to this file) first.

## 4. Tell them where it went

One line: the version number and the link the script printed, plus its `Flow:`, `Time:` and `Handoff:` lines. Nothing more.

## Never

- Never run git in the prototype folder, or anywhere, for this.
- Never re-upload an existing version: the studio refuses. If something is wrong, push another version.
- Never invent what changed.
