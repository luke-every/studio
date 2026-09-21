import { loadRegistry } from "./load";
import type { Person, Project, Prototype, PrototypeVersion, RegistrySnapshot, Team } from "./types";

/**
 * Reading the registry.
 *
 * Always from the files in this deployment — no network, no rate limit, no
 * latency. Writes go to GitHub as commits, so a change becomes visible to
 * everyone once Vercel has finished redeploying.
 */
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

    // Validated at load, so this always resolves.
    const current = versions.find((v) => v.id === record.currentVersion) ?? versions[0];

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
