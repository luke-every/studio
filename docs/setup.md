# Setting up

```
Vercel Blob    the registry, and every prototype's files
Vercel         runs the studio, which only ever reads
GitHub         the studio's own code
```

**Prototypes are content, not code.** They live in storage, so adding one
never rebuilds or redeploys anything — it appears in seconds. The repository
holds the application and nothing else.

## Once, in Vercel

1. **Storage** → **Create Database** → **Blob** → connect it to this project.
   That sets `BLOB_READ_WRITE_TOKEN` for you; there is nothing to copy.
2. **Settings → Environment Variables** → add `STUDIO_PASSWORD`, one shared
   word for the team. It opens the studio and authorises `/push`.
3. Redeploy so both take effect.

Settings inside the app reports whether each is working.

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

That copies the skill to `~/.claude/skills/push/` and records the studio's
address in `~/.claude/prototype-studio.json`. From then on `/push` works in
any Claude Code session, in any folder.

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

Both go through the same two endpoints, authorised with the studio password
in an `x-studio-password` header:

| | |
| --- | --- |
| `GET /api/prototypes` | what exists, so a push knows if it is a new version |
| `POST /api/push` | an HTML file plus `name`, and `team` if it is new |

## The door

`STUDIO_PASSWORD` puts one shared word in front of the studio. Type it once
per device. No accounts, nothing to remember, no sign-out.

Prototypes are served from the store's own CDN, so a prototype link can be
shared with someone who does not have the word.

## Running locally

```
npm run dev
```

Without `BLOB_READ_WRITE_TOKEN` the studio reads the files in `registry/`
instead — enough to work on the interface. Nothing can be saved in that
mode, and Settings says so.
