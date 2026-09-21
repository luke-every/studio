# Setting the studio up

There is nothing to configure outside the app. No environment variables, no
config files, no database. Deploy it and finish setup in **Settings**.

```
GitHub    the code, and the registry — what everything means
Vercel    runs the Hub, and hosts the prototype previews
```

## Deploy

Import the repository on Vercel and deploy. That is the whole deployment
step — Vercel tells the studio which repository it came from, so the
repository setting answers itself.

## Connect, in the app

Open **Settings**:

1. **You** — paste a GitHub personal access token. The button next to the
   field opens the right page on GitHub. Scope it to this repository and give
   it **Contents: read and write**; nothing else is needed.
2. **Repository** — already filled in on Vercel. Change it only to write
   somewhere else, such as a branch while trying things out.
3. **Write access** — the studio checks it can actually push, and says what
   is wrong if it cannot.

Each person connects their own token, once. There is no shared token, no
OAuth app to register, and no secret held for the team.

## Why tokens rather than "Sign in with GitHub"

An OAuth app has a client ID and secret that must exist *before* anyone can
sign in, which means they can only live in environment variables — exactly
the manual setup this avoids. A token is something each person creates for
themselves, so the studio needs nothing configured to accept it.

The cost is one paste per person instead of one click. For a team this size
that is a good trade, and it is reversible: OAuth could be added later
without changing anything that reads a session.

## How your token is held

In an httpOnly cookie on your device, and nowhere else. It is never shown to
anyone else and never written to the repository.

The cookie is not encrypted, on purpose: the token *is* the credential, so
sealing it would protect against nothing that stealing the cookie does not
already defeat. What matters is that the **name** in the cookie is never
trusted — every write asks GitHub who the token belongs to, so nobody can
commit under someone else's name by editing their own cookie.

Revoking a token on GitHub immediately stops it working here.

## People

No accounts to create. Whoever connects is who they are on GitHub, their
display name is recorded on whatever they create, and avatars come from
`github.com/<login>.png`. Someone who cannot push can still browse
everything; Settings tells them why they cannot change anything.

## Running it locally

```
npm run dev
npm run registry:check   # validate the registry without starting the app
```

Locally the repository is not detected, so set it once in Settings — it is
remembered for you, and committed for everyone as soon as you are connected.

## What lives where

| | |
| --- | --- |
| `registry/` | teams, projects, prototypes, versions — the source of truth |
| `registry/settings.json` | which repository the studio writes to |
| `public/previews/` | uploaded preview images, committed with their prototype |
| `src/lib/registry/read.ts` | reads the registry from this deployment |
| `src/lib/registry/write.ts` | applies one change and commits it |
| `src/lib/registry/github.ts` | the only place that talks to the GitHub API |
| `src/lib/auth/` | connecting an account, and the session cookie |
