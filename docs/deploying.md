# Deploying the studio

Three things to set up once: a Supabase project, its schema, and Vercel.
After that, `git push` is the whole deployment process.

## 1. Supabase

Create a free project at supabase.com. Region closest to the team.

Open **SQL Editor**, paste the contents of `supabase/schema.sql`, run it.
Re-running it is safe.

From **Project Settings → API**, copy:

- the project URL → `SUPABASE_URL`
- the **service role** key → `SUPABASE_SERVICE_ROLE_KEY`

The service role key bypasses row level security. It is only ever read in
server code, never prefixed `NEXT_PUBLIC_`, and never sent to a browser. RLS
is enabled on every table with no policies, so the anon key — the only key
that could ever leak client-side — can read nothing.

## 2. Seed it

Put both values in `.env.local` (see `.env.example`), then:

```
npm run registry:push
```

This reads `registry/`, validates it, and upserts it into Supabase. Versions
are insert-only: anything already in the database is left untouched, because
the database itself refuses to update or delete a version row.

From this point **the database is the source of truth** and the registry
files are the record of how it started.

## 3. Vercel

Import the repository. Add the same two environment variables in **Project
Settings → Environment Variables**, for Production and Preview. Deploy.

## Running without the database

If the environment variables are absent the studio reads the registry files
instead, read-only. Everything browses; nothing saves, and the nav says so.
That is the right mode for a fresh clone and for working on the interface.

## Free tier, honestly

Supabase pauses a free project after about a week with no activity. Restoring
it is one click in the dashboard, and a team using the studio weekly will
never see it — but if the studio goes quiet over a holiday, the first person
back may need to un-pause it. The alternative, Neon, does not pause but has
no auth or file storage, which the studio will want for sign-in and for
prototype screenshots. One vendor for all three is worth the trade.

## What this costs us

Moving the registry off disk means a version record no longer lives in the
repository, so the commit it describes has to be named explicitly — the
`commit_sha` and `branch` columns on `versions`. They are written *after* the
commit exists, so there is no ordering problem, but they can now drift, and
nothing yet checks that they point at real commits. That check belongs with
the work that starts writing them.
