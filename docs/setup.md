# Setting up

The studio runs on GitHub and Vercel. No database, no accounts, no sign-in.

```
GitHub    the code, the registry, and the prototypes themselves
Vercel    runs the Hub and serves the prototypes
```

## Three environment variables, set once in Vercel

| Variable | What it is |
| --- | --- |
| `GITHUB_TOKEN` | A fine-grained token scoped to this repository with **Contents: read and write**. Used only for changes made in the app. |
| `STUDIO_PASSWORD` | One shared word for the whole team. Not a login — no accounts, no sign-out. |
| `REGISTRY_REPO` | Only needed outside Vercel. On Vercel the repository is detected. |

Settings inside the app reports all three, and says what to fix.

## Two ways work gets in

**From Claude Code — the normal way.** Prototypes are built in their own
folders, not in this repository, so `/push` is installed once per machine
rather than living in the repo:

```
npm run skill:install
```

That copies the skill to `~/.claude/skills/push/` and records where the
studio is in `~/.claude/prototype-studio.json`. From then on, `/push` works
in any Claude Code session, in any folder.

Typing `/push` while working on a prototype makes Claude work out what
changed, write it up, save the version and push it. Under the hood it runs:

```
npm run proto:add -- --file <path> --name "Quiz results" --team acquisition \
  --title "Tighter results layout" --changes "Cut the second card."
```

which copies the file to `public/p/<slug>/<version>/` and writes the
registry records. Each version keeps its own copy, so older ones stay
viewable. Because *you* make the commit, the version is attributed to you —
this is where real authorship comes from, and why the studio needs no login.

Re-run `npm run skill:install` after pulling changes to the skill.

**By hand in the app.** *Add prototype* on any team page takes an HTML file,
a name, a team and a "Created by". The file is committed with the studio's
token and served the same way. This is the only place the studio asks who you
are, because it is the only place it cannot tell.

It currently only creates a prototype's first version. Adding a *later*
version from the web interface is not built yet — that is `/push`'s job.

## Prototypes are files, not links

Every prototype lives in the repository and is served from this deployment:

```
public/p/quiz-results/editorial/index.html   →   /p/quiz-results/editorial
```

Tiles in the grid are the real thing, rendered small; the detail page is the
real thing, usable. Nothing goes stale and nothing disappears when someone
tidies up an account elsewhere.

This is also what makes remixing somebody's prototype simple later: copying a
folder is a real operation, copying a link is not.

## The door

`STUDIO_PASSWORD` puts one shared word in front of everything. Type it once
per device. There is no account, nothing to remember, and no sign-out.

Leave it unset locally. Set it in production: without it, anyone who finds
the URL can add prototypes to the repository.

Prototypes themselves at `/p/…` are deliberately outside the door, so a
prototype link can be shared with someone who does not have the word.

## Running locally

```
npm run dev
npm run registry:check   # validate the registry without starting the app
```

## What lives where

| | |
| --- | --- |
| `registry/` | teams, projects, prototypes, versions — what everything means |
| `public/p/<slug>/<exploration>/` | the prototypes themselves |
| `scripts/add-prototype.ts` | the Claude Code route in |
| `.claude/skills/push/` | the /push skill, installed per machine |
| `src/lib/registry/read.ts` | reads the registry from this deployment |
| `src/lib/registry/write.ts` | applies one change and commits it |
| `src/lib/registry/github.ts` | the only place that talks to the GitHub API |
| `src/lib/gate.ts` | the shared password |
