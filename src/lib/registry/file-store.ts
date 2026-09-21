import { loadRegistry } from "./load";
import { ReadOnlyStoreError, type Store } from "./store";
import type { Exploration, Person, Project, Prototype, PrototypeVersion, RegistrySnapshot, Team } from "./types";

const UNKNOWN_PERSON: Person = {
  id: "unknown",
  name: "Unknown",
  initials: "??",
  email: "",
  active: false,
};

/**
 * The registry files in this repository.
 *
 * Reads only. Used when the database is not configured — local work, a fresh
 * clone, or before the Supabase project exists — and as the source the seed
 * script pushes from.
 */
export function createFileStore(): Store {
  return {
    kind: "files",
    writable: false,

    async read(): Promise<RegistrySnapshot> {
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
    },

    async createTeam() {
      throw new ReadOnlyStoreError();
    },
    async createProject() {
      throw new ReadOnlyStoreError();
    },
    async filePrototype() {
      throw new ReadOnlyStoreError();
    },
    async selectDirection() {
      throw new ReadOnlyStoreError();
    },
  };
}
