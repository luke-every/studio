import "server-only";

import { isStoreConfigured, readRegistryDocument, type RegistryDocument } from "./store";
import { contentRepoUrl, isContentRepoConfigured } from "./github";
import { versionSegment } from "./version";
import { WORKING_VERSION, workingCopies } from "./local-prototypes";
import { aliased } from "./people";
import { prototypeSchema, teamsFileSchema, versionSchema } from "./schema";
import type { Person, Project, Prototype, PrototypeVersion, RegistrySnapshot, Team } from "./types";

/**
 * Reading the registry.
 *
 * From the content repository when it is configured, which is everywhere
 * that matters, and from the files in `registry/` otherwise — enough to run the interface
 * locally without a store.
 *
 * Everything is validated on the way in. Invalid data throws rather than
 * being repaired: a studio that quietly shows the wrong history is worse
 * than one that will not start.
 */

/**
 * The seed.
 *
 * The teams that ship with the repository. Used when the store has nothing
 * in it yet — which is how a fresh studio comes up with somewhere to put a
 * prototype, rather than refusing the first push for want of a team — and
 * when there is no store at all, so the interface can be worked on locally.
 */
export async function readSeed(): Promise<RegistryDocument> {
  const { readFile, readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = join(process.cwd(), "registry");

  const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

  const { teams, projects } = teamsFileSchema.parse(await readJson(join(root, "teams.json")));
  const prototypesRoot = join(root, "prototypes");

  // An empty seed has no prototypes directory to trace into the deployment,
  // which is normal rather than a failure.
  const slugs = await readdir(prototypesRoot, { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
    .catch(() => [] as string[]);

  const document: RegistryDocument = { teams, projects, prototypes: [], versions: [] };

  for (const slug of slugs) {
    const dir = join(prototypesRoot, slug);
    document.prototypes.push(prototypeSchema.parse(await readJson(join(dir, "prototype.json"))));
    const files = (await readdir(join(dir, "versions"))).filter((name) => name.endsWith(".json"));
    for (const file of files) {
      document.versions.push(versionSchema.parse(await readJson(join(dir, "versions", file))));
    }
  }

  return document;
}

export async function loadRegistry(): Promise<RegistryDocument> {
  // An empty studio and a broken one look identical to somebody using it,
  // so a read that fails is thrown rather than quietly returning nothing.
  const raw = isStoreConfigured() ? ((await readRegistryDocument()) ?? (await readSeed())) : await readSeed();

  const document: RegistryDocument = {
    teams: raw.teams.map((team) => teamsFileSchema.shape.teams.element.parse(team)),
    projects: raw.projects.map((project) =>
      teamsFileSchema.shape.projects.element.parse(project),
    ),
    prototypes: raw.prototypes.map((prototype) => prototypeSchema.parse(prototype)),
    versions: raw.versions.map((version) => versionSchema.parse(version)),
  };

  await addWorkingCopies(document);

  const problems = checkRelationships(document);
  if (problems.length > 0) {
    throw new Error(
      `Registry is invalid:\n${problems.map((problem) => `  • ${problem}`).join("\n")}`,
    );
  }

  return document;
}

/** On this machine, the built folders in ~/Claude/prototypes, as prototypes of their own (see `local-prototypes.ts`). A prototype the registry already has gets the working copy as one more version, `v0.0`, which opens by default while its dev server is running. */
async function addWorkingCopies(document: RegistryDocument) {
  const team = document.teams.find((item) => !item.archived);
  if (!team) return;
  for (const { slug, builtAt, live, port } of await workingCopies()) {
    // With the content repository connected, what isn't running is read from there: the latest push, not a stale build.
    if (!live && isContentRepoConfigured()) continue;
    const id = `${slug}-${WORKING_VERSION}`;
    const at = builtAt.toISOString();
    const existing = document.prototypes.find((item) => item.slug === slug);
    const known = !!existing;
    // The working copy is the prototype's own owner's, not the team lead's: otherwise one person shows up twice, under two logins.
    const author = existing?.owner ?? team.lead;
    if (known && document.versions.some((item) => item.id === id || (item.prototypeSlug === slug && item.version === WORKING_VERSION))) continue;
    if (!known) document.prototypes.push(
      prototypeSchema.parse({
        slug,
        teamSlug: team.slug,
        name: slug.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
        description: live
          ? `Running from ~/Claude/prototypes/${slug}, so a change shows as soon as you save it.`
          : `Served from ~/Claude/prototypes/${slug}/out, so a rebuild is all it takes to see a change.`,
        owner: team.lead,
        preview: { tint: ["#e8e6e1", "#8b8880"], caption: slug },
        currentVersion: id,
        created: { by: team.lead, at: at.slice(0, 10) },
        updatedAt: at,
      }),
    );
    document.versions.push(
      versionSchema.parse({
        id,
        prototypeSlug: slug,
        version: WORKING_VERSION,
        title: live ? "Live" : "Working copy",
        changes: live ? "The dev server running in the folder, as it is now." : "What is in the folder's last build.",
        author,
        createdAt: at,
        url: `/p/${slug}/v0-0`,
        live: live || undefined,
        liveUrl: live && port ? `http://localhost:${port}` : undefined,
      }),
    );
    // A dev server that is running is what is being worked on, so it is what opens.
    if (live) {
      const prototype = document.prototypes.find((item) => item.slug === slug);
      if (prototype) prototype.currentVersion = id;
    }
  }
}

/** Relationships the schemas cannot express. */
export function checkRelationships(data: RegistryDocument): string[] {
  const problems: string[] = [];
  const teamSlugs = new Set(data.teams.map((team) => team.slug));
  const projectSlugs = new Set(data.projects.map((project) => project.slug));

  for (const project of data.projects) {
    if (!teamSlugs.has(project.teamSlug)) {
      problems.push(`Project ${project.slug} references unknown team "${project.teamSlug}"`);
    }
  }

  for (const prototype of data.prototypes) {
    if (!teamSlugs.has(prototype.teamSlug)) {
      problems.push(`Prototype ${prototype.slug} references unknown team "${prototype.teamSlug}"`);
    }
    if (prototype.projectSlug && !projectSlugs.has(prototype.projectSlug)) {
      problems.push(
        `Prototype ${prototype.slug} is filed into unknown project "${prototype.projectSlug}"`,
      );
    }

    const mine = data.versions.filter((version) => version.prototypeSlug === prototype.slug);
    if (mine.length === 0) problems.push(`Prototype ${prototype.slug} has no versions`);
    if (!mine.some((version) => version.id === prototype.currentVersion)) {
      problems.push(
        `Prototype ${prototype.slug} points at unknown version "${prototype.currentVersion}"`,
      );
    }

    const seen = new Set<string>();
    for (const version of mine) {
      if (seen.has(version.version)) {
        problems.push(`Version ${version.version} is used twice in ${prototype.slug}`);
      }
      seen.add(version.version);
    }
  }

  return problems;
}

export async function readRegistry(): Promise<RegistrySnapshot> {
  const data = await loadRegistry();

  const teams: Team[] = data.teams.map((team) => ({
    slug: team.slug,
    name: team.name,
    remit: team.remit,
    description: team.description,
    lead: aliased(team.lead),
    members: team.members.map(aliased),
    createdBy: aliased(team.created.by),
    createdAt: team.created.at,
    archived: team.archived,
  }));

  const projects: Project[] = data.projects.map((project) => ({
    slug: project.slug,
    teamSlug: project.teamSlug,
    name: project.name,
    createdBy: aliased(project.created.by),
    createdAt: project.created.at,
  }));

  const prototypes: Prototype[] = data.prototypes.map((record) => {
    const versions: PrototypeVersion[] = data.versions
      .filter((version) => version.prototypeSlug === record.slug)
      .sort((a, b) => compareVersions(b.label ?? b.version, a.label ?? a.version))
      .map((version) => ({
        id: version.id,
        version: version.label ?? version.version,
        key: version.version,
        title: version.title,
        changes: version.changes,
        author: aliased(version.author),
        createdAt: version.createdAt,
        // Served from the studio rather than straight from the store: the
        // store sends HTML as a download, which no frame can show.
        url: version.url ? servedPath(record.slug, version.version) : undefined,
        fileUrl: version.url,
        source: version.source,
        live: version.live,
        liveUrl: version.liveUrl,
      }));

    const current = versions.find((version) => version.id === record.currentVersion) ?? versions[0];


    return {
      slug: record.slug,
      teamSlug: record.teamSlug,
      projectSlug: record.projectSlug,
      name: record.name,
      description: record.description,
      owner: aliased(record.owner),
      preview: {
        ...record.preview,
        tint: previewTint(record.slug, record.preview.tint),
        url: current?.url ?? undefined,
      },
      versions,
      current,
      createdBy: aliased(record.created.by),
      createdAt: record.created.at,
      updatedAt: record.updatedAt,
      archived: record.archived,
      figmaUrl: record.figmaUrl,
      notionUrl: record.notionUrl,
      repositoryPath: record.repositoryPath,
    };
  });

  const seen = new Map<string, Person>();
  const note = (person: Person) => seen.set(person.login, person);
  teams.forEach((team) => {
    note(team.lead);
    team.members.forEach(note);
  });
  prototypes.forEach((prototype) => {
    note(prototype.owner);
    prototype.versions.forEach((version) => note(version.author));
  });

  return {
    repoUrl: contentRepoUrl(),
    people: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
    teams,
    projects,
    prototypes,
  };
}

/** Where a version is served from. Paths use v0-2 so a dot never needs escaping. */
export function servedPath(slug: string, version: string) {
  return `/p/${slug}/${versionSegment(version)}`;
}

/** "v0.10" is after "v0.9", which a string sort would get backwards. */
export function compareVersions(a: string, b: string) {
  const parse = (value: string) => {
    const [major, minor, micro = 0] = value.replace(/^v/, "").split(".").map(Number);
    return [major, minor, micro];
  };
  const [x, y] = [parse(a), parse(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** What every save has written as a tint, since nothing ever chose one. */
const DEFAULT_TINT = ["#e8e6e1", "#8b8880"];
const PREVIEW_TINTS = 6;

/**
 * The gradient a prototype's thumbnail paints.
 *
 * Thumbnails show a gradient rather than the prototype itself, and every
 * save stored the same grey — so a prototype that never had a tint chosen
 * gets one of the theme's preview gradients, picked from its slug so it
 * stays the same on every page and every visit. A tint somebody did set is
 * left alone.
 */
function previewTint(slug: string, stored: [string, string]): [string, string] {
  if (stored[0] !== DEFAULT_TINT[0] || stored[1] !== DEFAULT_TINT[1]) return stored;
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const index = (hash % PREVIEW_TINTS) + 1;
  return [`var(--preview-${index}-from)`, `var(--preview-${index}-to)`];
}
