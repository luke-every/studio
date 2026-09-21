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

## What is not built yet

**Writes.** The Hub runs on Vercel, whose filesystem is read-only, so
creating a team, creating a project and filing a prototype currently apply to
the browser session only — the nav says so plainly when that has happened.
Making them persist means a real store behind `src/lib/registry`, and that is
the next piece of work. Nothing in the interface changes when it lands.

**Authentication.** People identify themselves with the switcher in the nav
and the choice is remembered locally. That is enough to attribute work, which
is the point; it is not enough to trust it. Real sign-in replaces
`CurrentUserProvider` and nothing that consumes it changes.
