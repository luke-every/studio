# The registry

Three layers, and each owns exactly one thing:

```
Hub        the human interface over both
Registry   what the work means — owners, directions, versions, selection
Git        what the code is — source, branches, commits
```

**Git is the source of truth for code. The registry is the source of truth
for what the code means. The Hub is the source of truth for nothing.**

## Shape

The registry document and a prototype's files all live in a dedicated
GitHub repository — the *content* repository, never this one:

```
GitHub   registry.json                  teams, projects, prototypes, versions
         p/<slug>/<version>/index.html  the version's entry point
         p/<slug>/<version>/<...>       every other file in the folder pushed
         comments/<slug>/<version>.json comments and replies left on that version
         handoff/<slug>/<version>.json  that version's handoff: findings, decisions, sign-off
         canvas/<slug>/<version>.json   where that version's screens, frames and layers were put on the canvas
         canvas/<slug>/images/<name>.json  a picture the canvas uses (a data address, written once)
```

A version isn't forced into one file, and nothing about it is rewritten. The
folder that was pushed is committed at the same relative paths it had
locally, and served back the same way — a stylesheet loads, and whatever
that stylesheet itself points at (a font, a background image) resolves too,
because the served structure matches the pushed one exactly.

One registry document rather than an object per record, because a read has
to be one request to stay fast. It holds metadata only — never files — so it
stays small. Writes are read-modify-write, which is fine for a handful of
people saving rarely; the alternative costs every read a fan-out it does not
need.

Comments are kept beside the registry, not in it: one file per version, so a
comment never rewrites the registry or revalidates a page. A comment belongs to
the version it was left on and is pinned to an element in that version's own
files; a reply points at its comment with `parentId`. Nothing is deleted —
a comment is resolved. They are read by the browser through server actions, so
every page stays prerendered.

Every version is one commit, written through GitHub's Git Data API (a blob
per file, one tree, one commit, move the branch ref) — never a local `git`
checkout, and never this application's own repository. A version's path is
checked for existence first and never replaced, the same as it was in Blob.

A canvas is kept the same way (`src/lib/registry/canvas.ts`): one file per version, read by the
browser through server actions, and read, never written, from a share link. It is saved as Paper saves a
file, by sending what changed and not the whole (`diffCanvas` / `applyPatch` in `src/lib/canvas-doc.ts`,
checked by `scripts/check-canvas-doc.mjs`): per layer, set or removed, with the stacking order when it
changed, merged into whatever is saved now, so two people changing different layers keep both and a patch
sent twice does no harm. A change is sent 0.4s after the last one (a drag waits for the pointer to lift and
goes after 5s at the latest); a failed save is retried, later each time, and at once when the connection
returns. As the tab hides or the window closes the unsent patch goes to `POST /api/canvas` with `keepalive`,
which the browser finishes after the page is gone (a body under 64KB; a larger one makes the window ask
before it closes). Each save is a commit to the content repository. A working copy's (v0.0) is kept in its
`.studio/canvas.json`. The browser keeps its own copy as well, which is what the canvas opens with and what
is left offline; opening takes the cloud's copy unless this browser has changes it has not sent yet. Its
pictures are files of their own, written once.

A handoff is kept the same way, one file per version (`src/lib/registry/handoff.ts`). /handoff
scans the prototype on the designer's machine and posts the findings to `/api/handoff` with the
studio password (they are small, so unlike /push's files they come through the studio); the
designer's decisions are written into the same file from the studio, one at a time; "Ready for
dev" adds the sign-off, after which the file is never replaced. That file *is* the package an
engineer's agent reads (`GET /api/handoff`, or `scan.mjs --fetch`): its shape is `Handoff` in
`src/lib/handoff.ts`. A working copy's (v0.0) is kept in its `.studio/handoff.json` instead. Exact colours are
never decisions: the scanner swaps them for their tokens in the prototype's own files before it
scans (`fixed`), and lists any it left as written (`exact`, in a copied file or not a colour class).

**/push commits from the laptop, not through the studio.** A Vercel
Function can't accept a request body over 4.5MB, and prototypes outgrow
that quickly. So `/api/push/start` reserves the next version number and
hands back the content repository; the skill writes the commit itself; and
`/api/push` receives only the commit and the notes, checks the commit
really holds `p/<slug>/<version>/index.html`, and records it. The only size
limit left is GitHub's, 100MB a file. If someone else saved the same
prototype in between, the number has moved on and `/api/push` refuses
rather than record files under the wrong version.

The token handed out is the content repository's own, behind the studio
password. That password already authorises writing a prototype, and the
token is scoped to that one repository, so it grants nothing new.

A Next app is built by the skill, not the studio: once the version is reserved it
builds a static export pinned to `/p/<slug>/<version>`, commits that as the
version, and commits the app's source under `_source/` in the same folder.
The studio only ever serves static files, so a page of an export (`/about`)
is found as `about/index.html` or `about.html`.

Serving streams the file rather than buffering it — which is what gets a
file past the same 4.5MB limit on the way out — and passes range requests
through, which Safari needs to play a video.

"Add prototype" in the app still sends its file through the studio, so it
stays under that limit; it's for a single HTML file.

**Why a *separate* repository, and why not just this one.** Prototypes used
to live in this repository, and it was wrong: every upload rebuilt and
redeployed the whole application for content the application had nothing to
do with — a minute of latency, a repository that grew forever, a merge
conflict whenever two people saved at once. Moving to Blob fixed that by
taking content out of git entirely. Moving prototype files *back* into git —
because a version being real, inspectable history is worth having — only
stays safe as long as it's a repository Vercel never watches. If it were
this repository, or a branch of it, every push would reintroduce exactly
that redeploy.

**What that gets back.** A prototype's files have real git history again —
who committed what, and when, inspectable outside the studio entirely — on
top of what the version records already carried (author, date, what
changed).

## What is not stored

**Anything per-person.** Which prototypes you opened recently, your view
mode. Browser state; it would be noise in a shared store.

## The four ideas that matter

**Explorations are not versions.** An exploration is a *direction*
("Editorial recommendation"). A version is a saved state within it ("v0.8").

**Versions are immutable.** Never edit one to describe a new state. Write
another. Never reuse a version number within an exploration.

**Current is not latest.** A prototype records a *selected* exploration and
version, chosen explicitly by a person, with their name and the date. Someone
can be experimenting on v0.9 while the team still regards v0.8 as the
direction. The detail view shows the selected version, never the newest one.

**Nothing is deleted.** Alternatives stay. Selecting one direction does not
remove the others; they are listed alongside it.

## Reading it

`src/lib/registry/store.ts` knows the registry document;
`src/lib/registry/github.ts` knows the content repository both live in.
Nothing else touches either directly — everything else goes through
`src/lib/registry/index.ts`.

Reads are cached under the `registry` tag and a write revalidates it, so a
change is visible within seconds without every page view costing a fetch.
Without a store configured the studio falls back to the files in
`registry/`, which is enough to work on the interface locally.

Every record is parsed through a Zod schema and the relationships between
them are checked: references resolve, selected versions exist, version
numbers are unique within an exploration. **Invalid data throws.** A hub that
quietly shows the wrong history is worse than one that refuses to start.

```
npm run registry:check
```

runs the same validation on its own and exits non-zero. It never repairs
anything.

## Writing it

A change in the Hub reads the current file from GitHub, applies one change,
validates the result against the same schema the application reads through,
and commits it — as the person who made it, using their own token. Validating
before committing is what stops one bad write becoming a broken studio for
everybody.

Reads do not go through GitHub. They come from the registry files in the
deployed bundle, which is faster and has no rate limit; the cost is that a
change reaches other people when Vercel has finished redeploying. For changes
this rare, that is a fair trade for having no database.

## What is not built yet

**Saving a version from inside the Hub.** Versions can be added by hand with
*Add prototype*, which creates v0.1, but the full save-a-version workflow —
inspect the working tree, validate, commit, record — still belongs to Claude
Code rather than the interface.

**Commit references.** `commitSha` is not stored, because for versions saved
into this repository the commit that introduced the file is the version. When
prototypes become real apps with their own deploys, a version will need to
name the commit it describes, and that field will have to earn its place then.

**Screenshots on save.** *Add prototype* accepts an uploaded image. Nothing
captures one automatically yet.
