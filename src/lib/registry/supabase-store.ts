import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Store } from "./store";
import type {
  Exploration,
  Person,
  Project,
  Prototype,
  PrototypeVersion,
  RegistrySnapshot,
  Team,
} from "./types";

/**
 * Supabase.
 *
 * Reached only from the server, with the service role key, so the anon key
 * never leaves the machine and row level security can stay closed. The whole
 * snapshot is fetched in six queries and assembled here, which is well within
 * what a studio of this size will ever need — pagination is a problem worth
 * solving when it exists.
 */

const UNKNOWN_PERSON: Person = {
  id: "unknown",
  name: "Unknown",
  initials: "??",
  email: "",
  active: false,
};

type Row = Record<string, unknown>;

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function fetchAll(db: SupabaseClient, table: string): Promise<Row[]> {
  const { data, error } = await db.from(table).select("*");
  if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
  return (data ?? []) as Row[];
}

export function createSupabaseStore(): Store {
  const db = client();

  return {
    kind: "supabase",
    writable: true,

    async read(): Promise<RegistrySnapshot> {
      const [userRows, teamRows, projectRows, prototypeRows, explorationRows, versionRows] =
        await Promise.all([
          fetchAll(db, "users"),
          fetchAll(db, "teams"),
          fetchAll(db, "projects"),
          fetchAll(db, "prototypes"),
          fetchAll(db, "explorations"),
          fetchAll(db, "versions"),
        ]);

      const users = userRows.map(
        (row): Person => ({
          id: String(row.id),
          name: String(row.name),
          initials: String(row.initials),
          email: String(row.email),
          active: Boolean(row.active),
        }),
      );
      const byId = new Map(users.map((user) => [user.id, user]));
      const person = (id: unknown) => byId.get(String(id)) ?? UNKNOWN_PERSON;

      const teams = teamRows.map(
        (row): Team => ({
          slug: String(row.slug),
          name: String(row.name),
          remit: String(row.remit ?? ""),
          description: String(row.description ?? ""),
          status: row.status as Team["status"],
          lead: person(row.lead_id),
          members: ((row.member_ids as string[]) ?? []).map(person),
          createdBy: person(row.created_by),
          createdAt: String(row.created_at),
          archived: Boolean(row.archived),
        }),
      );

      const projects = projectRows.map(
        (row): Project => ({
          slug: String(row.slug),
          teamSlug: String(row.team_slug),
          name: String(row.name),
          createdBy: person(row.created_by),
          createdAt: String(row.created_at),
        }),
      );

      const versionsFor = (prototypeSlug: string, explorationId: string) =>
        versionRows
          .filter(
            (row) =>
              row.prototype_slug === prototypeSlug && row.exploration_id === explorationId,
          )
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .map(
            (row): PrototypeVersion => ({
              id: String(row.id),
              version: String(row.version),
              title: String(row.title),
              summary: String(row.summary ?? ""),
              why: String(row.why ?? ""),
              author: person(row.author_id),
              createdAt: String(row.created_at),
              preview: row.preview as PrototypeVersion["preview"],
              deployment: (row.deployment as PrototypeVersion["deployment"]) ?? null,
            }),
          );

      const prototypes = prototypeRows.map((row): Prototype => {
        const slug = String(row.slug);
        const explorations = explorationRows
          .filter((exploration) => exploration.prototype_slug === slug)
          .map(
            (exploration): Exploration => ({
              id: String(exploration.id),
              title: String(exploration.title),
              premise: String(exploration.premise ?? ""),
              author: person(exploration.author_id),
              status: exploration.status as Exploration["status"],
              branch: (exploration.branch as string | null) ?? undefined,
              preview: exploration.preview as Exploration["preview"],
              versions: versionsFor(slug, String(exploration.id)),
            }),
          );

        const selectedExploration =
          explorations.find((e) => e.id === row.selected_exploration_id) ?? explorations[0];
        const selectedVersion =
          selectedExploration?.versions.find((v) => v.id === row.selected_version_id) ??
          selectedExploration?.versions[0];

        return {
          slug,
          teamSlug: String(row.team_slug),
          projectSlug: (row.project_slug as string | null) ?? null,
          name: String(row.name),
          description: String(row.description ?? ""),
          designQuestion: String(row.design_question ?? ""),
          context: String(row.context ?? ""),
          owner: person(row.owner_id),
          collaborators: ((row.collaborator_ids as string[]) ?? []).map(person),
          status: row.status as Prototype["status"],
          tags: (row.tags as string[]) ?? [],
          preview: row.preview as Prototype["preview"],
          explorations,
          selected: {
            exploration: selectedExploration,
            version: selectedVersion,
            by: person(row.selected_by),
            at: String(row.selected_at),
          },
          createdBy: person(row.created_by),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
          archived: Boolean(row.archived),
          repositoryPath: (row.repository_path as string | null) ?? undefined,
          figmaUrl: (row.figma_url as string | null) ?? undefined,
        };
      });

      return { users, teams, projects, prototypes };
    },

    async createTeam(input) {
      const { error } = await db.from("teams").insert({
        slug: input.slug,
        name: input.name,
        remit: input.remit,
        description: input.description,
        status: "active",
        lead_id: input.by,
        member_ids: [input.by],
        created_by: input.by,
        created_at: new Date().toISOString().slice(0, 10),
        archived: false,
      });
      if (error) throw new Error(`Creating team failed: ${error.message}`);
    },

    async createProject(input) {
      const { error } = await db.from("projects").insert({
        slug: input.slug,
        team_slug: input.teamSlug,
        name: input.name,
        created_by: input.by,
        created_at: new Date().toISOString().slice(0, 10),
      });
      if (error) throw new Error(`Creating project failed: ${error.message}`);
    },

    async filePrototype(input) {
      const { error } = await db
        .from("prototypes")
        .update({ project_slug: input.projectSlug })
        .eq("slug", input.prototypeSlug);
      if (error) throw new Error(`Filing prototype failed: ${error.message}`);
    },

    async selectDirection(input) {
      const { error } = await db
        .from("prototypes")
        .update({
          selected_exploration_id: input.explorationId,
          selected_version_id: input.versionId,
          selected_by: input.by,
          selected_at: new Date().toISOString().slice(0, 10),
        })
        .eq("slug", input.prototypeSlug);
      if (error) throw new Error(`Selecting direction failed: ${error.message}`);
    },
  };
}
