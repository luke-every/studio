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
 * This is the only module that knows the registry is files. Everything else
 * goes through the async API in ./index, so moving the source to a database
 * — which running the Hub on Vercel will eventually require, since its
 * filesystem is read-only — is a change here and nowhere else.
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

    const versionFiles = (await readdir(join(dir, "versions"))).filter((name) =>
      name.endsWith(".json"),
    );
    for (const file of versionFiles) {
      versions.push(versionSchema.parse(await readJson(join(dir, "versions", file))));
    }
  }

  const data = { teams, projects, prototypes, versions };
  const problems = checkRelationships(data);
  if (problems.length > 0) fail(problems);

  return data;
}

/**
 * Relationships schemas cannot express: every reference points at something
 * that exists, and the selected direction is a real saved state.
 */
/**
 * Relationships schemas cannot express: every reference points at something
 * that exists, and the selected direction is a real saved state.
 *
 * People are no longer checked — they are GitHub accounts stored where they
 * acted, so there is no list they could fail to appear in.
 */
export function checkRelationships(data: RegistryData): string[] {
  const problems: string[] = [];
  const teamSlugs = new Set(data.teams.map((team) => team.slug));
  const projectSlugs = new Set(data.projects.map((project) => project.slug));
  const versionIds = new Set(data.versions.map((version) => version.id));

  for (const project of data.projects) {
    if (!teamSlugs.has(project.teamSlug)) {
      problems.push(`Project ${project.slug} references unknown team "${project.teamSlug}"`);
    }
  }

  for (const prototype of data.prototypes) {
    if (!teamSlugs.has(prototype.teamSlug)) {
      problems.push(
        `Prototype ${prototype.slug} references unknown team "${prototype.teamSlug}"`,
      );
    }
    if (prototype.projectSlug && !projectSlugs.has(prototype.projectSlug)) {
      problems.push(
        `Prototype ${prototype.slug} is filed into unknown project "${prototype.projectSlug}"`,
      );
    }

    const explorationIds = new Set(prototype.explorations.map((e) => e.id));
    if (!explorationIds.has(prototype.selected.explorationId)) {
      problems.push(
        `Prototype ${prototype.slug} selects unknown exploration "${prototype.selected.explorationId}"`,
      );
    }
    if (!versionIds.has(prototype.selected.versionId)) {
      problems.push(
        `Prototype ${prototype.slug} selects unknown version "${prototype.selected.versionId}"`,
      );
    }

    // Version numbers are chronological and never reused within a direction.
    const seen = new Map<string, Set<string>>();
    for (const version of data.versions.filter((v) => v.prototypeSlug === prototype.slug)) {
      if (!explorationIds.has(version.explorationId)) {
        problems.push(
          `Version ${version.id} references unknown exploration "${version.explorationId}"`,
        );
      }
      const used = seen.get(version.explorationId) ?? new Set<string>();
      if (used.has(version.version)) {
        problems.push(
          `Version number ${version.version} is used twice in ${prototype.slug}/${version.explorationId}`,
        );
      }
      used.add(version.version);
      seen.set(version.explorationId, used);
    }
  }

  for (const version of data.versions) {
    if (!data.prototypes.some((prototype) => prototype.slug === version.prototypeSlug)) {
      problems.push(`Version ${version.id} belongs to unknown prototype "${version.prototypeSlug}"`);
    }
  }

  return problems;
}

/**
 * Read once per process. The registry only changes when someone commits to
 * it, which means a new build.
 */
let cached: Promise<RegistryData> | null = null;

export function loadRegistry(): Promise<RegistryData> {
  cached ??= read();
  return cached;
}
