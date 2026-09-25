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

The registry document lives in Blob. A prototype's files live in a
dedicated GitHub repository — the *content* repository, never this one:

```
Blob     registry.json                  teams, projects, prototypes, versions
GitHub   p/<slug>/<version>/index.html  the version's entry point
         p/<slug>/<version>/<...>       every other file in the folder pushed
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

Every version is one commit, written through GitHub's Git Data API (a blob
per file, one tree, one commit, move the branch ref) — never a local `git`
checkout, and never this application's own repository. A version's path is
checked for existence first and never replaced, the same as it was in Blob.

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

`src/lib/registry/blob.ts` knows where the registry document lives;
`src/lib/registry/github.ts` knows where a prototype's own files live.
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
