# Setting the studio up

The studio runs on GitHub and Vercel and nothing else. There is no database.

```
GitHub    the code, and the registry — what everything means
Vercel    runs the Hub, and hosts the prototype previews
```

A change made in the Hub is a commit on the repository, made by whoever is
signed in. It is in GitHub immediately and visible to everyone once Vercel
has redeployed, about a minute later. The Hub says so while it is happening.

## Once, by hand

Everything the studio needs is reported in **Settings**, including what is
missing. Only one thing cannot be set there.

**Create a GitHub OAuth app** at
[github.com/settings/developers](https://github.com/settings/developers) →
New OAuth App:

- Homepage URL: your Vercel URL
- Authorization callback URL: `https://<your-studio>.vercel.app/api/auth/callback`

Then in **Vercel → Project Settings → Environment Variables**, add:

| Variable | Value |
| --- | --- |
| `GITHUB_CLIENT_ID` | from the OAuth app |
| `GITHUB_CLIENT_SECRET` | generate one on the OAuth app |

Redeploy. That is the whole setup — Settings will show green.

There is no session secret to manage: the cookie key is derived from the
client secret, so rotating the secret simply signs everyone out.

## People

There are no accounts to create. Whoever signs in with GitHub is who they
are, their display name is recorded on whatever they create, and avatars
come from `github.com/<login>.png`. Someone who cannot push to the
repository can still browse everything; they just cannot change anything,
and Settings tells them why.

## Running it locally

Copy `.env.example` to `.env.local` and fill in the same two values, with a
second OAuth app whose callback is `http://localhost:3000/api/auth/callback`.
Without them the studio still runs — you can browse everything, and Settings
explains why saving is off.

```
npm run dev
npm run registry:check   # validate the registry without starting the app
```

## What lives where

| | |
| --- | --- |
| `registry/` | teams, projects, prototypes, versions — the source of truth |
| `public/previews/` | uploaded preview images, committed with their prototype |
| `src/lib/registry/read.ts` | reads the registry from this deployment |
| `src/lib/registry/write.ts` | applies one change and commits it |
| `src/lib/registry/github.ts` | the only place that talks to the GitHub API |
| `src/lib/auth/` | sign-in, and the sealed session cookie |
