# Setting up

```
Vercel Blob     the registry — teams, projects, prototypes, versions
GitHub (content) a prototype's own files, one commit per version
Vercel          runs the studio, which only ever reads
GitHub (this repo) the studio's own code
```

**Prototypes are content, not code.** They live in storage — Blob for the
registry, a dedicated GitHub repository for files — so adding one never
rebuilds or redeploys anything. It appears in seconds. This repository holds
the application and nothing else; no prototype's files are ever committed
here.

## Once, in Vercel and GitHub

1. **Storage** → **Create Database** → **Blob** → connect it to this project.
   That sets `BLOB_READ_WRITE_TOKEN` for you; there is nothing to copy.
2. **Settings → Environment Variables** → add `STUDIO_PASSWORD`, one shared
   word for the team. It opens the studio and authorises `/push`.
3. **Create the content repository.** A new, empty GitHub repo — separate
   from this one, e.g. `prototype-studio-content` — with at least one commit
   on its default branch (a README is enough; the studio always commits on
   top of an existing commit, never as the first one). Nothing here ever
   deploys, so it doesn't need to be connected to Vercel at all.
4. **Create a token for it.** In GitHub, a fine-grained personal access
   token scoped to only that repository, with **Contents: Read and write**
   permission and nothing else. Give it whatever expiry you're comfortable
   rotating on.
5. **Settings → Environment Variables** in Vercel → add:
   - `STUDIO_GITHUB_TOKEN` — the token from step 4.
   - `STUDIO_CONTENT_REPO` — `<owner>/<repo>`, e.g.
     `luke-every/prototype-studio-content`.
   - `STUDIO_CONTENT_BRANCH` — optional, defaults to `main`.
6. Redeploy so all of it takes effect.

`/api/health` (with the studio password) reports whether each is working —
`storage` for Blob, `contentRepo` for GitHub.

## Nothing to migrate

The teams in `registry/teams.json` are a seed. A fresh store has nothing in
it, so the studio reads that seed until the first save — at which point the
teams are written into the store along with whatever was saved. There is no
migration step.

## Installing /push

Prototypes are built in their own folders, so the skill is installed per
machine rather than living in this repository. From a clone of it:

```
npm run skill:install -- --url https://<your-studio> --password <word>
```

That copies the skill — and the script it uses to upload a prototype's files
— to `~/.claude/skills/push/`, and records the studio's address in
`~/.claude/prototype-studio.json`. From then on `/push` works in any Claude
Code session, in any folder.

Typing `/push` while working on a prototype makes Claude work out what
changed, write it up, and upload it. No clone, no git, no deploy. Re-run the
install command after pulling changes to the skill.

## Two ways in

**`/push` from Claude Code** — the normal way. Attributed to whatever name
Claude gives, normally the local git identity.

**Add prototype in the app** — for anyone without a terminal. Takes an HTML
file, a name, a team and a "Created by". Currently creates a prototype's
first version only; later versions are `/push`'s job.

## The API

`/push` goes through two endpoints, authorised with the studio password in
an `x-studio-password` header. "Add prototype in the app" calls neither —
it's a write from inside the app itself, so it already knows its team.

| | |
| --- | --- |
| `GET /api/prototypes` | what exists, so a push knows if it is a new version |
| `POST /api/push` | the whole prototype folder plus `name`, and `team` if it is new. The entry is named `index.html`; every other file goes to the content repository at its own relative path |

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

Without `BLOB_READ_WRITE_TOKEN` the studio reads the files in `registry/`
instead — enough to work on the interface. Nothing can be saved in that
mode, and Settings says so.
