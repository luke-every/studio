import "server-only";

import {
  GitHubError,
  readJsonFile,
  tokenOwner,
  writeBinaryFile,
  writeFile,
} from "./github";
import { prototypeSchema, teamsFileSchema, versionSchema } from "./schema";
import type { PrototypeRecord, ProjectRecord, TeamRecord, VersionRecord } from "./schema";

/**
 * Changing the registry.
 *
 * Each of these reads the current file from GitHub, applies one change,
 * validates the result against the same schema the application reads
 * through, and commits it. Validating before committing is what keeps one
 * bad write from becoming a broken studio for everybody.
 *
 * Work made in Claude Code does not come through here — it is committed by
 * whoever made it, so its authorship is real. These are the changes made by
 * hand in the app, where the name has to be asked for.
 */

const TEAMS_PATH = "registry/teams.json";

const prototypePath = (slug: string) => `registry/prototypes/${slug}/prototype.json`;
const versionPath = (slug: string, version: string) =>
  `registry/prototypes/${slug}/versions/${version}.json`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(name: string, fallback: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `${fallback}-${Date.now()}`;
}

/**
 * The person, as stored.
 *
 * There are no accounts, so authorship comes from one of two places. A
 * prototype added by hand carries the name typed on the form, because only
 * the person at the keyboard knows it. Everything else — a team, a filing,
 * a change of direction — is attributed to whoever owns the studio's token,
 * which is a real person rather than "the system".
 */
function named(name: string) {
  const trimmed = name.trim() || "Someone";
  return { login: slugify(trimmed, "person"), name: trimmed };
}

const stringify = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

type TeamsFile = { teams: TeamRecord[]; projects: ProjectRecord[] };

async function loadTeamsFile() {
  const file = await readJsonFile<TeamsFile>(TEAMS_PATH);
  if (!file) throw new GitHubError(`${TEAMS_PATH} is missing from the repository.`);
  return { value: teamsFileSchema.parse(file.value), sha: file.sha };
}

async function loadPrototype(slug: string) {
  const file = await readJsonFile<PrototypeRecord>(prototypePath(slug));
  if (!file) throw new GitHubError(`No prototype called "${slug}" in the registry.`);
  return { value: prototypeSchema.parse(file.value), sha: file.sha };
}

export async function createTeam(input: {
  name: string;
  remit: string;
  description: string;
}) {
  const { value, sha } = await loadTeamsFile();
  const slug = slugify(input.name, "team");

  if (value.teams.some((team) => team.slug === slug)) {
    throw new GitHubError(`There is already a team called "${input.name}".`);
  }

  const person = await tokenOwner();
  const next: TeamsFile = {
    ...value,
    teams: [
      ...value.teams,
      {
        slug,
        name: input.name.trim(),
        remit: input.remit.trim(),
        description: input.description.trim(),
        lead: person,
        members: [person],
        created: { by: person, at: today() },
        archived: false,
      },
    ],
  };

  teamsFileSchema.parse(next);
  await writeFile(`registry: add team "${input.name.trim()}"`, {
    path: TEAMS_PATH,
    content: stringify(next),
    sha,
  });

  return slug;
}

export async function createProject(input: { teamSlug: string; name: string }) {
  const { value, sha } = await loadTeamsFile();
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
        created: { by: await tokenOwner(), at: today() },
      },
    ],
  };

  teamsFileSchema.parse(next);
  await writeFile(`registry: add project "${input.name.trim()}"`, {
    path: TEAMS_PATH,
    content: stringify(next),
    sha,
  });

  return slug;
}

export async function filePrototype(input: {
  prototypeSlug: string;
  projectSlug: string | null;
}) {
  const { value, sha } = await loadPrototype(input.prototypeSlug);
  const next: PrototypeRecord = { ...value, projectSlug: input.projectSlug };

  prototypeSchema.parse(next);
  await writeFile(
    input.projectSlug
      ? `registry: file ${value.name} into ${input.projectSlug}`
      : `registry: remove ${value.name} from its project`,
    { path: prototypePath(input.prototypeSlug), content: stringify(next), sha },
  );
}

/**
 * Adding a prototype by hand.
 *
 * The usual route is Claude Code — /push writes the files and the version
 * notes together. This is the other route: someone has an HTML file and
 * wants it in the studio. The file is committed alongside the record and
 * served from the deployment, so the prototype is genuinely here.
 */
export async function createPrototype(input: {
  name: string;
  description: string;
  changes: string;
  teamSlug: string;
  projectSlug: string | null;
  by: string;
  tint: [string, string];
  html: { bytes: ArrayBuffer };
}) {
  const slug = slugify(input.name, "prototype");
  if (await readJsonFile(prototypePath(slug))) {
    throw new GitHubError(`There is already a prototype called "${input.name}".`);
  }

  const person = named(input.by);
  const url = `/p/${slug}/v0-1`;
  const versionId = `${slug}-v0.1`;

  await writeBinaryFile(
    `prototype(${slug}): add files`,
    `public/p/${slug}/v0-1/index.html`,
    input.html.bytes,
  );

  const version: VersionRecord = versionSchema.parse({
    id: versionId,
    prototypeSlug: slug,
    version: "v0.1",
    title: "First version",
    changes: input.changes.trim() || "Added to the studio.",
    author: person,
    createdAt: today(),
    url,
  });

  const prototype: PrototypeRecord = prototypeSchema.parse({
    slug,
    teamSlug: input.teamSlug,
    projectSlug: input.projectSlug,
    name: input.name.trim(),
    description: input.description.trim(),
    owner: person,
    preview: { tint: input.tint, caption: input.name.trim(), url },
    currentVersion: versionId,
    created: { by: person, at: today() },
    updatedAt: today(),
    archived: false,
    repositoryPath: `public/p/${slug}`,
  });

  await writeFile(`registry: add prototype "${input.name.trim()}" v0.1`, {
    path: versionPath(slug, "v0.1"),
    content: stringify(version),
  });
  await writeFile(`registry: add prototype "${input.name.trim()}"`, {
    path: prototypePath(slug),
    content: stringify(prototype),
  });

  return slug;
}
