import "server-only";

import { isBlobConfigured, readRegistryDocument, type RegistryDocument } from "./blob";
import { prototypeSchema, teamsFileSchema, versionSchema } from "./schema";
import type { Person, Project, Prototype, PrototypeVersion, RegistrySnapshot, Team } from "./types";

/**
 * Reading the registry.
 *
 * From Blob when it is configured, which is everywhere that matters, and
 * from the files in `registry/` otherwise — enough to run the interface
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
  const raw = isBlobConfigured() ? ((await readRegistryDocument()) ?? (await readSeed())) : await readSeed();

  const document: RegistryDocument = {
    teams: raw.teams.map((team) => teamsFileSchema.shape.teams.element.parse(team)),
    projects: raw.projects.map((project) =>
      teamsFileSchema.shape.projects.element.parse(project),
    ),
    prototypes: raw.prototypes.map((prototype) => prototypeSchema.parse(prototype)),
    versions: raw.versions.map((version) => versionSchema.parse(version)),
  };

  const problems = checkRelationships(document);
  if (problems.length > 0) {
    throw new Error(
      `Registry is invalid:\n${problems.map((problem) => `  • ${problem}`).join("\n")}`,
    );
  }

  return document;
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
    lead: team.lead,
    members: team.members,
    createdBy: team.created.by,
    createdAt: team.created.at,
    archived: team.archived,
  }));

  const projects: Project[] = data.projects.map((project) => ({
    slug: project.slug,
    teamSlug: project.teamSlug,
    name: project.name,
    createdBy: project.created.by,
    createdAt: project.created.at,
  }));

  const prototypes: Prototype[] = data.prototypes.map((record) => {
    const versions: PrototypeVersion[] = data.versions
      .filter((version) => version.prototypeSlug === record.slug)
      .sort((a, b) => compareVersions(b.version, a.version))
      .map((version) => ({
        id: version.id,
        version: version.version,
        title: version.title,
        changes: version.changes,
        author: version.author,
        createdAt: version.createdAt,
        url: version.url,
      }));

    const current = versions.find((version) => version.id === record.currentVersion) ?? versions[0];

    return {
      slug: record.slug,
      teamSlug: record.teamSlug,
      projectSlug: record.projectSlug,
      name: record.name,
      description: record.description,
      owner: record.owner,
      preview: record.preview,
      versions,
      current,
      createdBy: record.created.by,
      createdAt: record.created.at,
      updatedAt: record.updatedAt,
      archived: record.archived,
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
    people: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
    teams,
    projects,
    prototypes,
  };
}

/** "v0.10" is after "v0.9", which a string sort would get backwards. */
export function compareVersions(a: string, b: string) {
  const parse = (value: string) => value.replace(/^v/, "").split(".").map(Number);
  const [aMajor, aMinor] = parse(a);
  const [bMajor, bMinor] = parse(b);
  return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}
