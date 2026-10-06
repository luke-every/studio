# Setting up

```
GitHub (content) the registry — teams, projects, prototypes, versions —
                and a prototype's own files, one commit per version
Vercel          runs the studio, which only ever reads
GitHub (this repo) the studio's own code
```

**Prototypes are content, not code.** They live in a dedicated GitHub
repository, registry and files alike, so adding one never
rebuilds or redeploys anything. It appears in seconds. This repository holds
the application and nothing else; no prototype's files are ever committed
here.

## Once, in Vercel and GitHub

1. **Settings → Environment Variables** → add `STUDIO_PASSWORD`, one shared
   word for the team. It opens the studio and authorises `/push`.
2. **Create the content repository.** A new, empty GitHub repo — separate
   from this one, e.g. `prototype-studio-content` — with at least one commit
   on its default branch (a README is enough; the studio always commits on
   top of an existing commit, never as the first one). Nothing here ever
   deploys, so it doesn't need to be connected to Vercel at all.
3. **Create a token for it.** In GitHub, a fine-grained personal access
   token scoped to only that repository, with **Contents: Read and write**
   permission and nothing else. Give it whatever expiry you're comfortable
   rotating on.
4. **Settings → Environment Variables** in Vercel → add:
   - `STUDIO_GITHUB_TOKEN` — the token from step 3.
   - `STUDIO_CONTENT_REPO` — `<owner>/<repo>`, e.g.
     `luke-every/prototype-studio-content`.
   - `STUDIO_CONTENT_BRANCH` — optional, defaults to `main`.
5. Redeploy so all of it takes effect.

`/api/health` (with the studio password) reports whether each is working —
`contentRepo` for GitHub.

## Preview pictures

A prototype's tile shows a picture, not the running prototype. A workflow in
the content repository takes it on GitHub a minute or so after a push — no
browser needed on anyone's machine. Copy `content-repo/.github/` into the root
of the content repository once (see `content-repo/README.md`); it needs nothing
else, and is free on a public repository. Until a version has its picture, its
tile shows the running prototype instead.

## Nothing to migrate

The teams in `registry/teams.json` are a seed. A fresh store has nothing in
it, so the studio reads that seed until the first save — at which point the
teams are written into the store along with whatever was saved. There is no
migration step.

## Installing /push

**Anyone else**, on their own, with no help: open the studio, tap "Get set up"
in the corner (it's also in Settings) and paste the one command it shows into
Terminal:

```
curl -fsSL https://<your-studio>/install.sh | sh
```

It puts the skill in `~/.claude/skills/push/`, asks for the studio password once
and saves it with the studio's address in `~/.claude/prototype-studio.json`.
They need Claude Code and Node.js — no GitHub account or key, because `/push`
talks to the studio and the studio talks to GitHub. Run it again to update.
The installer and the two skill files it downloads are served by the studio
itself (`/install.sh`, `/skill/push/…`), outside the door, since a terminal has
no cookie; they're the same code as this repository.

**From a clone of this repository**, for working on the skill:

```
npm run skill:install -- --url https://<your-studio> --password <word>
```

Typing `/push` while working on a prototype makes Claude work out what
changed, write it up, and upload it. No clone, no git, no deploy. Re-run the
install command after pulling changes to the skill.

## Two ways in

**`/push` from Claude Code** — the normal way. Attributed to whatever name
Claude gives, normally the local git identity. It commits the files to the
content repository directly, so there's no size limit beyond GitHub's 100MB
a file.

**Add prototype in the app** — for anyone without a terminal. Takes an HTML
file, a name, a team and a "Created by". Currently creates a prototype's
first version only; later versions are `/push`'s job.

## The API

`/push` goes through three endpoints, authorised with the studio password in
an `x-studio-password` header: `/api/prototypes` to see what exists,
`/api/push/start` to reserve a version and get the content repository, and
`/api/push` to record the commit it made. "Add prototype in the app" calls neither —
it's a write from inside the app itself, so it already knows its team.

| | |
| --- | --- |
| `GET /api/prototypes` | what exists, so a push knows if it is a new version |
| `POST /api/push/start` | `name` (and `team` if new, `version` to choose the number by hand): which version this becomes, and the content repository to commit to |
| `POST /api/push` | the commit `/push` made plus the notes (`name`, `version`, `commit`, `title`, `changes`…); the studio verifies the commit and records the version |

## The door

`STUDIO_PASSWORD` puts one shared word in front of the studio. Type it once
per device. No accounts, nothing to remember, no sign-out.

Prototypes are served from the studio's own domain — proxied from wherever
the files actually live, GitHub raw content included, since that answers
every file as `text/plain` and a browser won't run a script or apply a
stylesheet served that way — so a prototype link can be shared with someone
who does not have the word.

## Running locally

```
npm run dev
```

Without the content repository variables the studio keeps its registry in
`.local/registry.json` and serves prototype files from
`.local/p/<slug>/<version>/` — enough to work on the whole interface, creating
teams and projects included. `/push` and "Add prototype" still need the
repository, since they commit files. `.local` is git-ignored and `.vercelignore`d.

## Fonts

The studio uses ABC Diatype from `public/fonts/` (the same files as
`team-conventions`, which commits them). If they are missing the studio falls
back to the system font rather than failing.
