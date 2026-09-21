/**
 * Push the registry files into Supabase.
 *
 * One-way: files → database. Run it once to seed a fresh database, and after
 * that the database is the source of truth and the files are history. It
 * validates before writing, so a broken registry never reaches the database.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run registry:push
 */
import { createClient } from "@supabase/supabase-js";

import { loadRegistry } from "../src/lib/registry/load";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see .env.example).",
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function upsert(table: string, rows: Record<string, unknown>[], conflict: string) {
  if (rows.length === 0) return;
  const { error } = await db.from(table).upsert(rows, { onConflict: conflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ✓ ${rows.length} ${table}`);
}

async function main() {
  const data = await loadRegistry();
  console.log("Pushing registry to Supabase");

  await upsert("users", data.users, "id");

  await upsert(
    "teams",
    data.teams.map((team) => ({
      slug: team.slug,
      name: team.name,
      remit: team.remit,
      description: team.description,
      status: team.status,
      lead_id: team.leadId,
      member_ids: team.memberIds,
      created_by: team.created.by,
      created_at: team.created.at,
      archived: team.archived,
    })),
    "slug",
  );

  await upsert(
    "projects",
    data.projects.map((project) => ({
      slug: project.slug,
      team_slug: project.teamSlug,
      name: project.name,
      created_by: project.created.by,
      created_at: project.created.at,
    })),
    "slug",
  );

  await upsert(
    "prototypes",
    data.prototypes.map((prototype) => ({
      slug: prototype.slug,
      team_slug: prototype.teamSlug,
      project_slug: prototype.projectSlug,
      name: prototype.name,
      description: prototype.description,
      design_question: prototype.designQuestion,
      context: prototype.context,
      owner_id: prototype.ownerId,
      collaborator_ids: prototype.collaboratorIds,
      status: prototype.status,
      tags: prototype.tags,
      preview: prototype.preview,
      selected_exploration_id: prototype.selected.explorationId,
      selected_version_id: prototype.selected.versionId,
      selected_by: prototype.selected.by,
      selected_at: prototype.selected.at,
      created_by: prototype.created.by,
      created_at: prototype.created.at,
      updated_at: prototype.updatedAt,
      archived: prototype.archived,
      repository_path: prototype.repositoryPath ?? null,
      figma_url: prototype.figmaUrl ?? null,
    })),
    "slug",
  );

  await upsert(
    "explorations",
    data.prototypes.flatMap((prototype) =>
      prototype.explorations.map((exploration) => ({
        prototype_slug: prototype.slug,
        id: exploration.id,
        title: exploration.title,
        premise: exploration.premise,
        author_id: exploration.authorId,
        status: exploration.status,
        branch: exploration.branch ?? null,
        preview: exploration.preview,
      })),
    ),
    "prototype_slug,id",
  );

  // Versions are insert-only: the database refuses updates, so anything
  // already there is left exactly as it was.
  const { data: existing, error } = await db.from("versions").select("id");
  if (error) throw new Error(`versions: ${error.message}`);
  const known = new Set((existing ?? []).map((row) => String(row.id)));
  const newVersions = data.versions.filter((version) => !known.has(version.id));

  if (newVersions.length > 0) {
    const { error: insertError } = await db.from("versions").insert(
      newVersions.map((version) => ({
        id: version.id,
        prototype_slug: version.prototypeSlug,
        exploration_id: version.explorationId,
        version: version.version,
        title: version.title,
        summary: version.summary,
        why: version.why,
        author_id: version.authorId,
        created_at: version.createdAt,
        preview: version.preview,
        deployment: version.deployment,
      })),
    );
    if (insertError) throw new Error(`versions: ${insertError.message}`);
  }
  console.log(`  ✓ ${newVersions.length} versions added, ${known.size} already present`);
  console.log("Done.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
