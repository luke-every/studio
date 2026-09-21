-- Prototype Studio — registry schema
--
-- The registry moved from files to Postgres because the Hub runs on Vercel,
-- whose filesystem is read-only. What it means is unchanged: Git owns the
-- code, this owns what the code means, the Hub owns neither.
--
-- Run once in the Supabase SQL editor. Re-running is safe.

create table if not exists users (
  id        text primary key,
  name      text not null,
  email     text not null,
  initials  text not null,
  active    boolean not null default true
);

create table if not exists teams (
  slug        text primary key,
  name        text not null,
  remit       text not null default '',
  description text not null default '',
  status      text not null check (status in ('active', 'on-hold', 'complete')),
  lead_id     text not null references users (id),
  member_ids  text[] not null default '{}',
  created_by  text not null references users (id),
  created_at  date not null,
  archived    boolean not null default false
);

-- A folder inside a team. Filing is optional and reversible.
create table if not exists projects (
  slug       text primary key,
  team_slug  text not null references teams (slug) on delete cascade,
  name       text not null,
  created_by text not null references users (id),
  created_at date not null
);

create table if not exists prototypes (
  slug                    text primary key,
  team_slug               text not null references teams (slug),
  project_slug            text references projects (slug) on delete set null,
  name                    text not null,
  description             text not null default '',
  design_question         text not null default '',
  context                 text not null default '',
  owner_id                text not null references users (id),
  collaborator_ids        text[] not null default '{}',
  status                  text not null check (status in ('exploring', 'in-review', 'shipped', 'parked')),
  tags                    text[] not null default '{}',
  preview                 jsonb not null,
  -- The team's current direction: an explicit human choice, never "latest".
  selected_exploration_id text not null,
  selected_version_id     text not null,
  selected_by             text not null references users (id),
  selected_at             date not null,
  created_by              text not null references users (id),
  created_at              date not null,
  updated_at              date not null,
  archived                boolean not null default false,
  repository_path         text,
  figma_url               text
);

-- A divergent design direction. Not a version.
create table if not exists explorations (
  prototype_slug text not null references prototypes (slug) on delete cascade,
  id             text not null,
  title          text not null,
  premise        text not null default '',
  author_id      text not null references users (id),
  status         text not null check (status in ('active', 'review', 'selected', 'archived')),
  branch         text,
  preview        jsonb not null,
  primary key (prototype_slug, id)
);

-- A saved state of an exploration. Immutable: insert only, never updated.
create table if not exists versions (
  id             text primary key,
  prototype_slug text not null references prototypes (slug) on delete cascade,
  exploration_id text not null,
  version        text not null,
  title          text not null,
  summary        text not null default '',
  why            text not null default '',
  author_id      text not null references users (id),
  created_at     date not null,
  preview        jsonb not null,
  -- A deployment is an instance of a version, not a version of its own.
  deployment     jsonb,
  -- Now that the record no longer lives in the repo, the commit it describes
  -- has to be named explicitly. Written after the commit exists, never before.
  commit_sha     text,
  branch         text,
  unique (prototype_slug, exploration_id, version)
);

create index if not exists prototypes_team_idx on prototypes (team_slug);
create index if not exists prototypes_project_idx on prototypes (project_slug);
create index if not exists versions_prototype_idx on versions (prototype_slug);

-- A saved version must never be edited or removed. Enforced here rather than
-- by convention, because the whole point of a version is that it still means
-- what it meant when it was written.
create or replace function versions_are_immutable() returns trigger as $$
begin
  raise exception 'Versions are immutable. Save a new version instead.';
end;
$$ language plpgsql;

drop trigger if exists versions_no_update on versions;
create trigger versions_no_update before update or delete on versions
  for each row execute function versions_are_immutable();

-- Everything reaches this database from the server, using the service role
-- key. Row level security on with no policies means the anon key — the only
-- one that could ever reach a browser — can read nothing.
alter table users        enable row level security;
alter table teams        enable row level security;
alter table projects     enable row level security;
alter table prototypes   enable row level security;
alter table explorations enable row level security;
alter table versions     enable row level security;
