import "server-only";

import type { Session } from "@/lib/auth/session";
import type {
  PrototypeRecord,
  TeamRecord,
  ProjectRecord,
  VersionRecord,
} from "./schema";
import { prototypeSchema, teamsFileSchema, versionSchema } from "./schema";
import { GitHubError, readJsonFile, writeBinaryFile, writeFile } from "./github";

/**
 * Changing the registry.
 *
 * Each of these reads the current file from GitHub, applies one change,
 * validates the result against the same schema the application reads
 * through, and commits it. Validating before committing is what keeps a bad
 * write from becoming a broken studio for everyone else.
 */

const TEAMS_PATH = "registry/teams.json";

const prototypePath = (slug: string) => `registry/prototypes/${slug}/prototype.json`;
const versionPath = (slug: string, explorationId: string, version: string) =>
  `registry/prototypes/${slug}/versions/${explorationId}-${version}.json`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The person, as stored. The display name travels with the login so
 * attribution still reads properly long after they have moved on.
 */
function author(session: Session) {
  return { login: session.login, name: session.name };
}

export function slugify(name: string, fallback: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `${fallback}-${Date.now()}`;
}

type TeamsFile = { teams: TeamRecord[]; projects: ProjectRecord[] };

async function loadTeamsFile(session: Session) {
  const file = await readJsonFile<TeamsFile>(session, TEAMS_PATH);
  if (!file) throw new GitHubError(`${TEAMS_PATH} is missing from the repository.`);
  return { value: teamsFileSchema.parse(file.value), sha: file.sha };
}

async function loadPrototype(session: Session, slug: string) {
  const file = await readJsonFile<PrototypeRecord>(session, prototypePath(slug));
  if (!file) throw new GitHubError(`No prototype called "${slug}" in the registry.`);
  return { value: prototypeSchema.parse(file.value), sha: file.sha };
}

const stringify = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export async function createTeam(
  session: Session,
  input: { name: string; remit: string; description: string },
) {
  const { value, sha } = await loadTeamsFile(session);
  const slug = slugify(input.name, "team");

  if (value.teams.some((team) => team.slug === slug)) {
    throw new GitHubError(`There is already a team called "${input.name}".`);
  }

  const next: TeamsFile = {
    ...value,
    teams: [
      ...value.teams,
      {
        slug,
        name: input.name.trim(),
        remit: input.remit.trim(),
        description: input.description.trim(),
        status: "active",
        lead: author(session),
        members: [author(session)],
        created: { by: author(session), at: today() },
        archived: false,
      },
    ],
  };

  teamsFileSchema.parse(next);
  await writeFile(session, `registry: add team "${input.name.trim()}"`, {
    path: TEAMS_PATH,
    content: stringify(next),
    sha,
  });

  return slug;
}

export async function createProject(
  session: Session,
  input: { teamSlug: string; name: string },
) {
  const { value, sha } = await loadTeamsFile(session);
  const slug = slugify(input.name, "project");

  if (!value.teams.some((team) => team.slug === input.teamSlug)) {
    throw new GitHubError(`No team called "${input.teamSlug}".`);
  }
  if (value.projects.some((project) => project.slug === slug)) {
    throw new GitHubError(`There is already a project called "${input.name}".`);
  }

  const next: TeamsFile = {
    ...value,
    projects: [
      ...value.projects,
      {
        slug,
        teamSlug: input.teamSlug,
        name: input.name.trim(),
        created: { by: author(session), at: today() },
      },
    ],
  };

  teamsFileSchema.parse(next);
  await writeFile(session, `registry: add project "${input.name.trim()}"`, {
    path: TEAMS_PATH,
    content: stringify(next),
    sha,
  });

  return slug;
}

export async function filePrototype(
  session: Session,
  input: { prototypeSlug: string; projectSlug: string | null },
) {
  const { value, sha } = await loadPrototype(session, input.prototypeSlug);
  const next: PrototypeRecord = { ...value, projectSlug: input.projectSlug };

  prototypeSchema.parse(next);
  await writeFile(
    session,
    input.projectSlug
      ? `registry: file ${value.name} into ${input.projectSlug}`
      : `registry: remove ${value.name} from its project`,
    { path: prototypePath(input.prototypeSlug), content: stringify(next), sha },
  );
}

/** Change the team's current direction. Records who chose it, and when. */
export async function selectDirection(
  session: Session,
  input: { prototypeSlug: string; explorationId: string; versionId: string },
) {
  const { value, sha } = await loadPrototype(session, input.prototypeSlug);
  const next: PrototypeRecord = {
    ...value,
    selected: {
      explorationId: input.explorationId,
      versionId: input.versionId,
      by: author(session),
      at: today(),
    },
  };

  prototypeSchema.parse(next);
  await writeFile(session, `registry: ${value.name} now follows ${input.versionId}`, {
    path: prototypePath(input.prototypeSlug),
    content: stringify(next),
    sha,
  });
}

/**
 * Adding a prototype by hand.
 *
 * Not everything arrives through the save-a-version workflow — often someone
 * has already built something somewhere else and simply wants it findable.
 * This creates the prototype and its first version in one go, because a
 * prototype with no saved state is not something anyone can look at.
 */
export async function createPrototype(
  session: Session,
  input: {
    name: string;
    description: string;
    designQuestion: string;
    context: string;
    teamSlug: string;
    projectSlug: string | null;
    url: string;
    tint: [string, string];
    image?: { filename: string; bytes: ArrayBuffer };
  },
) {
  const slug = slugify(input.name, "prototype");
  const existing = await readJsonFile(session, prototypePath(slug));
  if (existing) throw new GitHubError(`There is already a prototype called "${input.name}".`);

  let imagePath: string | undefined;
  if (input.image) {
    const extension = input.image.filename.split(".").pop()?.toLowerCase() ?? "png";
    imagePath = `public/previews/${slug}.${extension}`;
    await writeBinaryFile(
      session,
      `registry: preview image for ${input.name.trim()}`,
      imagePath,
      input.image.bytes,
    );
  }

  const preview = {
    tint: input.tint,
    caption: input.name.trim(),
    ...(input.url ? { url: input.url } : {}),
    ...(imagePath ? { image: imagePath.replace(/^public/, "") } : {}),
  };

  const versionId = `${slug}-main-v0.1`;
  const version: VersionRecord = versionSchema.parse({
    id: versionId,
    prototypeSlug: slug,
    explorationId: "main",
    version: "v0.1",
    title: "First version",
    summary: input.description.trim() || "Added to the studio.",
    why: input.context.trim(),
    author: author(session),
    createdAt: today(),
    preview,
    deployment: input.url ? { url: input.url, status: "ready" } : null,
  });

  const prototype: PrototypeRecord = prototypeSchema.parse({
    slug,
    teamSlug: input.teamSlug,
    projectSlug: input.projectSlug,
    name: input.name.trim(),
    description: input.description.trim(),
    designQuestion: input.designQuestion.trim(),
    context: input.context.trim(),
    owner: author(session),
    collaborators: [],
    status: "exploring",
    tags: [],
    preview,
    explorations: [
      {
        id: "main",
        title: "Main",
        premise: input.designQuestion.trim(),
        author: author(session),
        status: "selected",
        preview,
      },
    ],
    selected: {
      explorationId: "main",
      versionId,
      by: author(session),
      at: today(),
    },
    created: { by: author(session), at: today() },
    updatedAt: today(),
    archived: false,
  });

  await writeFile(session, `registry: add prototype "${input.name.trim()}" v0.1`, {
    path: versionPath(slug, "main", "v0.1"),
    content: stringify(version),
  });
  await writeFile(session, `registry: add prototype "${input.name.trim()}"`, {
    path: prototypePath(slug),
    content: stringify(prototype),
  });

  return slug;
}
