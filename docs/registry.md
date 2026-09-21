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

```
registry/
  users.json                         people, and only people
  teams.json                         teams + the project folders inside them
  prototypes/
    quiz-results/
      prototype.json                 identity, explorations, selected direction
      versions/
        editorial-v0.8.json          immutable — one file per version
        editorial-v0.7.json
        comparison-first-v0.3.json
```

One file per version is deliberate. An immutable record as an immutable file
means immutability is enforced by *don't edit a file that already exists*
rather than by discipline inside a growing array, and two people saving
versions at the same time produce no merge conflict, because each save is a
pure addition.

## What is not stored

**Commit SHAs.** The registry lives in the same repository as the code, so
the commit that introduced a version file *is* that version —
`git log -1 -- registry/prototypes/<slug>/versions/<file>` resolves it, for
free, forever, without a field that can drift. This also removes the
ordering problem of recording a SHA inside the commit that produces it.

**Anything per-person.** Which prototypes you opened recently, your view mode,
who you are signed in as: browser state. Putting it in the registry would
mean a commit every time somebody glanced at something.

**Deployments as their own entity.** A version has a URL and a status. A
deployment is an instance of a version; redeploying the same state never
produces a new version number, so a separate record would distinguish
nothing. It becomes an entity the day that stops being true.

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

`src/lib/registry/load.ts` is the only module that knows the registry is
files. Everything else goes through `src/lib/registry/index.ts`, whose API is
async even though the current read is synchronous — because the source will
not stay files.

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
