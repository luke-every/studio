import "server-only";

import { loadRegistry } from "./load";
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
 * The registry's public API.
 *
 * Every accessor is async even though the current source is a synchronous
 * file read, because the source will not stay files: running the Hub on
 * Vercel means writes cannot go to disk, and the store will move behind this
 * boundary. Callers that already await will not need to change.
 */

const UNKNOWN_PERSON: Person = {
  id: "unknown",
  name: "Unknown",
  initials: "??",
  email: "",
  active: false,
};

async function resolved(): Promise<RegistrySnapshot> {
  const data = await loadRegistry();

  const users: Person[] = data.users.map((user) => ({
    id: user.id,
    name: user.name,
    initials: user.initials,
    email: user.email,
    active: user.active,
  }));
  const byId = new Map(users.map((user) => [user.id, user]));
  const person = (id: string) => byId.get(id) ?? UNKNOWN_PERSON;

  const teams: Team[] = data.teams.map((team) => ({
    slug: team.slug,
    name: team.name,
    remit: team.remit,
    description: team.description,
    status: team.status,
    lead: person(team.leadId),
    members: team.memberIds.map(person),
    createdBy: person(team.created.by),
    createdAt: team.created.at,
    archived: team.archived,
  }));

  const projects: Project[] = data.projects.map((project) => ({
    slug: project.slug,
    teamSlug: project.teamSlug,
    name: project.name,
    createdBy: person(project.created.by),
    createdAt: project.created.at,
  }));

  const prototypes: Prototype[] = data.prototypes.map((record) => {
    const explorations: Exploration[] = record.explorations.map((exploration) => ({
      id: exploration.id,
      title: exploration.title,
      premise: exploration.premise,
      author: person(exploration.authorId),
      status: exploration.status,
      branch: exploration.branch,
      preview: exploration.preview,
      versions: data.versions
        .filter(
          (version) =>
            version.prototypeSlug === record.slug &&
            version.explorationId === exploration.id,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(
          (version): PrototypeVersion => ({
            id: version.id,
            version: version.version,
            title: version.title,
            summary: version.summary,
            why: version.why,
            author: person(version.authorId),
            createdAt: version.createdAt,
            preview: version.preview,
            deployment: version.deployment,
          }),
        ),
    }));

    // Validated at load, so these are guaranteed to resolve.
    const selectedExploration =
      explorations.find((e) => e.id === record.selected.explorationId) ?? explorations[0];
    const selectedVersion =
      selectedExploration.versions.find((v) => v.id === record.selected.versionId) ??
      selectedExploration.versions[0];

    return {
      slug: record.slug,
      teamSlug: record.teamSlug,
      projectSlug: record.projectSlug,
      name: record.name,
      description: record.description,
      designQuestion: record.designQuestion,
      context: record.context,
      owner: person(record.ownerId),
      collaborators: record.collaboratorIds.map(person),
      status: record.status,
      tags: record.tags,
      preview: record.preview,
      explorations,
      selected: {
        exploration: selectedExploration,
        version: selectedVersion,
        by: person(record.selected.by),
        at: record.selected.at,
      },
      createdBy: person(record.created.by),
      createdAt: record.created.at,
      updatedAt: record.updatedAt,
      archived: record.archived,
      repositoryPath: record.repositoryPath,
      figmaUrl: record.figmaUrl,
    };
  });

  return { users, teams, projects, prototypes };
}

/** Everything, resolved. What the app is handed on the server. */
export async function getRegistrySnapshot(): Promise<RegistrySnapshot> {
  return resolved();
}

export async function getUsers(): Promise<Person[]> {
  return (await resolved()).users;
}

export async function getTeams(): Promise<Team[]> {
  return (await resolved()).teams;
}

export async function getTeam(slug: string): Promise<Team | undefined> {
  return (await getTeams()).find((team) => team.slug === slug);
}

export async function getProjects(teamSlug?: string): Promise<Project[]> {
  const projects = (await resolved()).projects;
  return teamSlug ? projects.filter((project) => project.teamSlug === teamSlug) : projects;
}

export async function getPrototypes(): Promise<Prototype[]> {
  return (await resolved()).prototypes;
}

export async function getPrototype(slug: string): Promise<Prototype | undefined> {
  return (await getPrototypes()).find((prototype) => prototype.slug === slug);
}

/** Every saved version of a prototype, across all its explorations. */
export async function getPrototypeHistory(slug: string): Promise<PrototypeVersion[]> {
  const prototype = await getPrototype(slug);
  if (!prototype) return [];
  return prototype.explorations
    .flatMap((exploration) => exploration.versions)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The team's current direction — not the latest work. */
export async function getSelected(slug: string) {
  return (await getPrototype(slug))?.selected;
}
