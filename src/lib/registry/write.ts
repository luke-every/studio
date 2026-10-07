import "server-only";

import { revalidatePath } from "next/cache";

import { linkProblem, type LinkKind } from "@/lib/links";

import { isStoreConfigured, readRegistryDocument, writeRegistryDocument, type RegistryDocument } from "./store";
import { commitPrototypeVersion, fetchPrototypeFile, verifyPrototypeVersion, versionPrefix } from "./github";
import { applierScript, describeEdits, mergeEdits, type Edit, type EditsFile } from "@/lib/edits";
import { compareVersions, readSeed } from "./read";
import { prototypeSchema, versionSchema } from "./schema";
import type { PrototypeRecord, VersionRecord } from "./schema";

/**
 * Changing the registry.
 *
 * Read the document, apply one change, validate the result against the same
 * schemas the application reads through, write it back. Nothing is deployed:
 * a change is live as soon as the cache is revalidated, which happens here.
 *
 * Validating before writing is what keeps one bad change from becoming a
 * broken studio for everybody.
 */

export class StoreError extends Error {}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** With the time, for the things people want to know the minute of. */
function now() {
  return new Date().toISOString();
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
 * There are no accounts, so authorship is whatever name was given — by the
 * person at the keyboard, or by Claude Code from the local git identity.
 * A login is derived so avatars and grouping have something stable to key on.
 */
function named(name: string | undefined, fallback = "Someone") {
  const trimmed = name?.trim() || fallback;
  return { login: slugify(trimmed, "person"), name: trimmed };
}

async function load(): Promise<RegistryDocument> {
  if (!isStoreConfigured()) {
    throw new StoreError(
      "No content repository is connected, so nothing can be saved. Set STUDIO_GITHUB_TOKEN and STUDIO_CONTENT_REPO in Vercel.",
    );
  }
  // First write into a fresh store starts from the seed, so the teams that
  // ship with the studio exist without anybody running a migration.
  return (await readRegistryDocument()) ?? readSeed();
}

async function save(document: RegistryDocument) {
  await writeRegistryDocument(document);
  // The pages are prerendered, so they hold the old registry until they are
  // told to regenerate. They read the document fresh when they do.
  revalidatePath("/", "layout");
}

/**
 * A link somebody typed or pasted, checked before it is kept. The dialog has
 * already checked it; this is the check that counts.
 */
export function cleanLink(kind: LinkKind, value: string) {
  const problem = linkProblem(kind, value);
  if (problem) throw new StoreError(problem);
  return new URL(value.trim()).toString();
}

export async function createTeam(input: {
  name: string;
  remit: string;
  description: string;
  /** Optional: nobody signs in, and a team is not work anybody claims. */
  by?: string;
}) {
  const document = await load();
  const slug = slugify(input.name, "team");

  if (document.teams.some((team) => team.slug === slug)) {
    throw new StoreError(`There is already a team called "${input.name}".`);
  }

  const person = named(input.by, "Prototype Studio");
  document.teams.push({
    slug,
    name: input.name.trim(),
    remit: input.remit.trim(),
    description: input.description.trim(),
    lead: person,
    members: [person],
    created: { by: person, at: today() },
    archived: false,
  });

  await save(document);
  return slug;
}

export async function createProject(input: {
  teamSlug: string;
  name: string;
  by?: string;
}) {
  const document = await load();
  const slug = slugify(input.name, "project");

  if (!document.teams.some((team) => team.slug === input.teamSlug)) {
    throw new StoreError(`No team called "${input.teamSlug}".`);
  }
  if (document.projects.some((project) => project.slug === slug)) {
    throw new StoreError(`There is already a project called "${input.name}".`);
  }

  document.projects.push({
    slug,
    teamSlug: input.teamSlug,
    name: input.name.trim(),
    created: { by: named(input.by, "Prototype Studio"), at: today() },
  });

  await save(document);
  return slug;
}

export async function filePrototype(input: {
  prototypeSlug: string;
  projectSlug: string | null;
}) {
  const document = await load();
  const prototype = document.prototypes.find((item) => item.slug === input.prototypeSlug);
  if (!prototype) throw new StoreError(`No prototype called "${input.prototypeSlug}".`);

  prototype.projectSlug = input.projectSlug;
  prototypeSchema.parse(prototype);

  await save(document);
}

/** "v0.10" follows "v0.9", which a string sort would get backwards. */
function nextVersion(existing: VersionRecord[]) {
  const highest = existing.reduce((top, version) => {
    const value = Number((version.label ?? version.version).replace(/^v/, ""));
    return Number.isNaN(value) ? top : Math.max(top, value);
  }, 0);
  return `v${(highest + 0.1).toFixed(1)}`;
}

type VersionNotes = {
  name: string;
  slug?: string;
  /** A number chosen by hand. Left out, it is the next one after the highest. */
  version?: string;
  teamSlug?: string;
  projectSlug?: string | null;
  description?: string;
  title?: string;
  changes?: string;
  by: string;
  tint?: [string, string];
  figmaUrl?: string;
  notionUrl?: string;
};

/**
 * Which prototype and version a save would become — the slug, the next
 * version number, and whether the team exists for a prototype that's new.
 * Checked before anything is written anywhere.
 */
function plan(
  document: RegistryDocument,
  input: { name: string; slug?: string; teamSlug?: string; version?: string },
) {
  const slug = slugify(input.slug ?? input.name, "prototype");
  const existing = document.prototypes.find((prototype) => prototype.slug === slug);
  const mine = document.versions.filter((version) => version.prototypeSlug === slug);

  if (!existing) {
    if (!input.teamSlug) {
      throw new StoreError(`"${input.name}" is new, so it needs a team.`);
    }
    if (!document.teams.some((team) => team.slug === input.teamSlug)) {
      throw new StoreError(`No team called "${input.teamSlug}".`);
    }
  }

  let version = nextVersion(mine);
  if (input.version) {
    if (!/^v\d+\.\d+$/.test(input.version)) {
      throw new StoreError(`"${input.version}" isn't a version number. They look like v0.8.`);
    }
    // A number is taken if it is a version's name on screen or where its
    // files are stored, so a rename can't collide with a later push.
    if (mine.some((other) => other.version === input.version || other.label === input.version)) {
      throw new StoreError(`${slug} already has ${input.version}. Versions are never replaced — pick another number, or leave it out.`);
    }
    version = input.version;
  }

  return { slug, version, existing, isLatest: mine.every((other) => compareVersions(version, other.label ?? other.version) > 0) };
}

/** Write the version record, and the prototype too if it's the first one. */
async function record(document: RegistryDocument, input: VersionNotes, url: string) {
  const { slug, version, existing, isLatest } = plan(document, input);
  const person = named(input.by);
  const versionId = `${slug}-${version}`;

  const entry: VersionRecord = versionSchema.parse({
    id: versionId,
    prototypeSlug: slug,
    version,
    title: input.title?.trim() || (version === "v0.1" ? "First version" : `Version ${version}`),
    changes: input.changes?.trim() ?? "",
    author: person,
    createdAt: now(),
    url,
  });
  document.versions.push(entry);

  const preview = {
    tint: input.tint ?? existing?.preview.tint ?? (["#e8e6e1", "#8b8880"] as [string, string]),
    caption: input.name.trim(),
    url,
  };

  if (existing) {
    // A version numbered below the latest (filling in history) is recorded
    // but doesn't take over as the one people see.
    if (isLatest) {
      existing.preview = preview;
      existing.currentVersion = versionId;
      existing.updatedAt = now();
      // Pushing to something that was removed brings it back.
      existing.archived = false;
    }
    if (input.description?.trim()) existing.description = input.description.trim();
    if (input.figmaUrl) existing.figmaUrl = cleanLink("figma", input.figmaUrl);
    if (input.notionUrl) existing.notionUrl = cleanLink("notion", input.notionUrl);
    prototypeSchema.parse(existing);
  } else {
    const prototype: PrototypeRecord = prototypeSchema.parse({
      slug,
      teamSlug: input.teamSlug,
      projectSlug: input.projectSlug ?? null,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      owner: person,
      preview,
      currentVersion: versionId,
      created: { by: person, at: today() },
      updatedAt: now(),
      archived: false,
      figmaUrl: input.figmaUrl ? cleanLink("figma", input.figmaUrl) : undefined,
      notionUrl: input.notionUrl ? cleanLink("notion", input.notionUrl) : undefined,
    });
    document.prototypes.push(prototype);
  }

  await save(document);
  return { slug, version, url };
}

/**
 * Save a version.
 *
 * Creates the prototype if this is the first one. Every version is one
 * commit to the content repository and is never replaced, so every version
 * stays viewable — that is what makes the history real rather than nominal.
 *
 * The entry isn't required to be self-contained. Whatever else the folder
 * held is committed alongside it, at the same relative paths, so a local
 * reference to a stylesheet, a script, an image, or something only a
 * stylesheet itself references, still resolves once served — nothing is
 * inlined and nothing is rewritten.
 *
 * This path carries the files through the studio, so it's bound by a
 * Vercel Function's 4.5MB request limit. It's for "Add prototype" in the
 * app; /push commits to GitHub itself and uses `reserveVersion` and
 * `recordPushedVersion` instead.
 */
export async function saveVersion(
  input: VersionNotes & {
    html: ArrayBuffer | string;
    /** Every other file in the folder, at its relative path. */
    assets?: { path: string; content: ArrayBuffer }[];
  },
) {
  const document = await load();
  const { slug, version } = plan(document, input);

  const { entryUrl } = await commitPrototypeVersion(slug, version, [
    { path: "index.html", content: input.html },
    ...(input.assets ?? []),
  ]);

  return record(document, input, entryUrl);
}

/**
 * Save visual edits as the next version of a prototype.
 *
 * The new version starts as a copy of the one the edits were made on, so it
 * keeps its own files and the old one is untouched. Added to it are
 * `edits.json` (what changed, and which version it was made on), a script
 * that applies it, and any replaced images; the page loads that script.
 * Edits already on the version being edited are kept underneath.
 */
export async function saveEditedVersion(input: {
  slug: string;
  baseVersionId: string;
  edits: Edit[];
  images: { path: string; content: ArrayBuffer }[];
  by: string;
}) {
  const document = await load();
  const prototype = document.prototypes.find((item) => item.slug === input.slug);
  const base = document.versions.find((item) => item.id === input.baseVersionId && item.prototypeSlug === input.slug);
  if (!prototype || !base) throw new StoreError("That version isn't in the studio any more.");
  if (!input.edits.length) throw new StoreError("There's nothing to save yet.");
  if (!input.by.trim()) throw new StoreError("Add your name so the studio knows who made these edits.");

  const { slug, version } = plan(document, { name: prototype.name, slug: input.slug });
  const segment = base.version.replace(".", "-");

  const entry = await fetchPrototypeFile(slug, segment, [], null);
  if (!entry) throw new StoreError(`Couldn't read the files of ${base.label ?? base.version}.`);
  const html = await entry.text();

  const earlier = await fetchPrototypeFile(slug, segment, ["edits.json"], null);
  const before = earlier ? ((await earlier.json().catch(() => null)) as EditsFile | null) : null;
  const edits = mergeEdits(before?.edits ?? [], input.edits);
  const file: EditsFile = { base: base.label ?? base.version, edits };

  const tag = '<script src="studio-edits.js"></script>';
  const page = html.includes("studio-edits.js")
    ? html
    : /<\/body>/i.test(html)
      ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}</body>`)
      : `${html}${tag}`;

  const { entryUrl } = await commitPrototypeVersion(
    slug,
    version,
    [
      { path: "index.html", content: page },
      { path: "studio-edits.js", content: applierScript(edits) },
      { path: "edits.json", content: `${JSON.stringify(file, null, 2)}\n` },
      ...input.images,
    ],
    base.version,
  );

  return record(
    document,
    {
      name: prototype.name,
      slug,
      title: "Visual edits",
      changes: describeEdits(input.edits),
      by: input.by,
    },
    entryUrl,
  );
}

/**
 * The first half of /push: which version this will be, and where its files
 * go. Nothing is written — /push commits the files to the content
 * repository itself, then calls `recordPushedVersion`.
 */
export async function reserveVersion(input: {
  name: string;
  slug?: string;
  teamSlug?: string;
  version?: string;
}) {
  const document = await load();
  const { slug, version } = plan(document, input);
  return { slug, version, prefix: versionPrefix(slug, version) };
}

/**
 * The second half of /push: the files are already committed, so check the
 * commit really holds them and record the version. If someone else saved
 * this prototype in between, the version number has moved on and this
 * refuses rather than recording files under the wrong number.
 */
export async function recordPushedVersion(input: VersionNotes & { version: string; commit: string }) {
  const document = await load();
  // The number was reserved before the upload. If someone else has taken it
  // since, this refuses rather than recording files under a number that now
  // means something else.
  const { slug, version } = plan(document, input);

  const { entryUrl } = await verifyPrototypeVersion(slug, version, input.commit);
  return record(document, input, entryUrl);
}

/**
 * Change what a prototype is called, where it sits, its links, or whether it is
 * shown. Anything left out is left alone; a link given as empty is removed.
 *
 * "Removing" a prototype only hides it. History is never deleted: its versions
 * and files stay where they are, and pushing to it again brings it back.
 */
export async function updatePrototype(input: {
  slug: string;
  name?: string;
  teamSlug?: string;
  projectSlug?: string | null;
  figmaUrl?: string;
  notionUrl?: string;
  archived?: boolean;
}) {
  const document = await load();
  const prototype = document.prototypes.find((item) => item.slug === input.slug);
  if (!prototype) throw new StoreError(`No prototype called "${input.slug}".`);

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new StoreError("A prototype needs a name.");
    prototype.name = input.name.trim();
  }

  if (input.teamSlug !== undefined || input.projectSlug !== undefined) {
    const teamSlug = input.teamSlug ?? prototype.teamSlug;
    if (!document.teams.some((team) => team.slug === teamSlug)) {
      throw new StoreError(`No team called "${teamSlug}".`);
    }
    // Moving to another team without choosing a project leaves it unfiled.
    const projectSlug =
      input.projectSlug !== undefined
        ? input.projectSlug
        : teamSlug === prototype.teamSlug
          ? prototype.projectSlug
          : null;
    if (projectSlug && !document.projects.some((p) => p.slug === projectSlug && p.teamSlug === teamSlug)) {
      throw new StoreError("That project isn't in that team.");
    }
    prototype.teamSlug = teamSlug;
    prototype.projectSlug = projectSlug;
  }

  if (input.figmaUrl !== undefined) {
    prototype.figmaUrl = input.figmaUrl.trim() ? cleanLink("figma", input.figmaUrl) : undefined;
  }
  if (input.notionUrl !== undefined) {
    prototype.notionUrl = input.notionUrl.trim() ? cleanLink("notion", input.notionUrl) : undefined;
  }
  if (input.archived !== undefined) prototype.archived = input.archived;

  prototypeSchema.parse(prototype);
  await save(document);
}

/**
 * Rename a version, for people. Only the name shown changes: the files stay
 * under the number they were saved as, so every link to the version keeps
 * working.
 */
export async function renameVersion(input: { slug: string; versionId: string; label: string }) {
  const document = await load();
  const target = document.versions.find(
    (version) => version.id === input.versionId && version.prototypeSlug === input.slug,
  );
  if (!target) throw new StoreError("No such version.");

  const label = input.label.trim();
  if (!/^v\d+\.\d+$/.test(label)) {
    throw new StoreError(`"${label}" isn't a version number. They look like v0.8.`);
  }

  const taken = document.versions.some(
    (other) => other !== target && other.prototypeSlug === input.slug && (other.label ?? other.version) === label,
  );
  if (taken) throw new StoreError(`${input.slug} already has a version called ${label}.`);

  // Back to the number it was saved as is the same as no rename.
  target.label = label === target.version ? undefined : label;
  versionSchema.parse(target);
  await save(document);
}
