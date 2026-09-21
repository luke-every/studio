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
 * Reading the registry.
 *
 * Always from the files in this deployment — no network, no rate limit, no
 * latency. Writes go to GitHub as commits, so a change becomes visible to
 * everyone once Vercel has finished redeploying. For changes as rare as
 * these, that is a fair trade for having no database at all.
 *
 * There is very little to resolve any more: people are stored where they
 * acted, so nothing has to be looked up by id.
 */
export async function readRegistry(): Promise<RegistrySnapshot> {
  const data = await loadRegistry();

  const teams: Team[] = data.teams.map((team) => ({
    slug: team.slug,
    name: team.name,
    remit: team.remit,
    description: team.description,
    status: team.status,
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
    const explorations: Exploration[] = record.explorations.map((exploration) => ({
      id: exploration.id,
      title: exploration.title,
      premise: exploration.premise,
      author: exploration.author,
      status: exploration.status,
      branch: exploration.branch,
      preview: exploration.preview,
      versions: data.versions
        .filter(
          (version) =>
            version.prototypeSlug === record.slug && version.explorationId === exploration.id,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(
          (version): PrototypeVersion => ({
            id: version.id,
            version: version.version,
            title: version.title,
            summary: version.summary,
            why: version.why,
            author: version.author,
            createdAt: version.createdAt,
            preview: version.preview,
            deployment: version.deployment,
          }),
        ),
    }));

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
      owner: record.owner,
      collaborators: record.collaborators,
      status: record.status,
      tags: record.tags,
      preview: record.preview,
      explorations,
      selected: {
        exploration: selectedExploration,
        version: selectedVersion,
        by: record.selected.by,
        at: record.selected.at,
      },
      createdBy: record.created.by,
      createdAt: record.created.at,
      updatedAt: record.updatedAt,
      archived: record.archived,
      repositoryPath: record.repositoryPath,
      figmaUrl: record.figmaUrl,
    };
  });

  // Everyone who appears anywhere, so the interface can show the studio's
  // cast without a user list existing.
  const seen = new Map<string, Person>();
  const note = (person: Person) => seen.set(person.login, person);
  teams.forEach((team) => {
    note(team.lead);
    team.members.forEach(note);
  });
  prototypes.forEach((prototype) => {
    note(prototype.owner);
    prototype.collaborators.forEach(note);
    prototype.explorations.forEach((exploration) => {
      note(exploration.author);
      exploration.versions.forEach((version) => note(version.author));
    });
  });

  return {
    people: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
    teams,
    projects,
    prototypes,
  };
}
