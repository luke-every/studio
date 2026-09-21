import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  prototypeSchema,
  teamsFileSchema,
  versionSchema,
  type PrototypeRecord,
  type ProjectRecord,
  type TeamRecord,
  type VersionRecord,
} from "./schema";

/**
 * Reading the registry off disk.
 *
 * Every record is parsed through its schema and the relationships between
 * them are checked. Invalid data throws rather than being repaired: a hub
 * that quietly shows the wrong history is worse than one that will not start.
 */

const REGISTRY_ROOT = join(process.cwd(), "registry");

export type RegistryData = {
  teams: TeamRecord[];
  projects: ProjectRecord[];
  prototypes: PrototypeRecord[];
  versions: VersionRecord[];
};

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function fail(problems: string[]): never {
  throw new Error(
    `Registry is invalid:\n${problems.map((problem) => `  • ${problem}`).join("\n")}`,
  );
}

async function read(): Promise<RegistryData> {
  const { teams, projects } = teamsFileSchema.parse(
    await readJson(join(REGISTRY_ROOT, "teams.json")),
  );

  const prototypesRoot = join(REGISTRY_ROOT, "prototypes");
  const slugs = (await readdir(prototypesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const prototypes: PrototypeRecord[] = [];
  const versions: VersionRecord[] = [];

  for (const slug of slugs) {
    const dir = join(prototypesRoot, slug);
    prototypes.push(prototypeSchema.parse(await readJson(join(dir, "prototype.json"))));

    const files = (await readdir(join(dir, "versions"))).filter((name) =>
      name.endsWith(".json"),
    );
    for (const file of files) {
      versions.push(versionSchema.parse(await readJson(join(dir, "versions", file))));
    }
  }

  const data = { teams, projects, prototypes, versions };
  const problems = checkRelationships(data);
  if (problems.length > 0) fail(problems);

  return data;
}

/** Relationships schemas cannot express. */
export function checkRelationships(data: RegistryData): string[] {
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

    const mine = data.versions.filter((v) => v.prototypeSlug === prototype.slug);
    if (mine.length === 0) {
      problems.push(`Prototype ${prototype.slug} has no versions`);
    }
    if (!mine.some((version) => version.id === prototype.currentVersion)) {
      problems.push(
        `Prototype ${prototype.slug} points at unknown version "${prototype.currentVersion}"`,
      );
    }

    // Version numbers are chronological and never reused.
    const seen = new Set<string>();
    for (const version of mine) {
      if (seen.has(version.version)) {
        problems.push(`Version ${version.version} is used twice in ${prototype.slug}`);
      }
      seen.add(version.version);
    }
  }

  for (const version of data.versions) {
    if (!data.prototypes.some((prototype) => prototype.slug === version.prototypeSlug)) {
      problems.push(`Version ${version.id} belongs to unknown prototype "${version.prototypeSlug}"`);
    }
  }

  return problems;
}

/** Read once per process. The registry only changes when someone commits. */
let cached: Promise<RegistryData> | null = null;

export function loadRegistry(): Promise<RegistryData> {
  cached ??= read();
  return cached;
}
