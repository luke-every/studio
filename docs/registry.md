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

Two kinds of object in Blob:

```
registry.json                  teams, projects, prototypes, versions
p/<slug>/<version>/index.html  the prototype itself, served by the CDN
```

One registry document rather than an object per record, because a read has
to be one request to stay fast. It holds metadata only — never files — so it
stays small. Writes are read-modify-write, which is fine for a handful of
people saving rarely; the alternative costs every read a fan-out it does not
need.

Prototype files are written once per version and never replaced. The store
refuses an upload to a path that already exists.

**Why not the repository.** It was, and it was wrong: every upload rebuilt
and redeployed the whole application for content the application had nothing
to do with. A minute of latency, a repository that grew forever, and a merge
conflict whenever two people saved at once. Content and code now move
independently.

**What that costs.** A prototype's files no longer have git history. The
version records still carry the author, the date and what changed, which is
the part anybody actually reads.

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

`src/lib/registry/blob.ts` is the only module that knows where anything
lives. Everything else goes through `src/lib/registry/index.ts`.

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
