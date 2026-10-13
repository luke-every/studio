import "server-only";

import { anchorSchema, commentsFileSchema, type Anchor, type Comment } from "@/lib/comments";

import { isStoreConfigured, readStoreFile, writeStoreFile } from "./store";
import { VERSION_PATTERN, versionSegment } from "./version";
import { named } from "./write";

/**
 * Comments, one file per version beside the registry. Read-modify-write like
 * the registry itself: fine for a handful of people commenting by hand.
 */

function pathFor(slug: string, version: string) {
  // These come from the browser and become a path, so they are checked here.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !VERSION_PATTERN.test(version)) {
    throw new Error("That isn't a prototype version.");
  }
  return `comments/${slug}/${versionSegment(version)}.json`;
}

async function load(slug: string, version: string) {
  const text = await readStoreFile(pathFor(slug, version));
  return text ? commentsFileSchema.parse(JSON.parse(text)) : [];
}

async function save(slug: string, version: string, comments: Comment[], message: string) {
  if (!isStoreConfigured()) {
    throw new Error("No content repository is connected, so nothing can be saved.");
  }
  await writeStoreFile(pathFor(slug, version), `${JSON.stringify(comments, null, 2)}\n`, message);
}

export const readComments = load;

export async function addComment(input: {
  slug: string;
  version: string;
  text: string;
  /** Where it is left. A reply takes its comment's place, so it needs none. */
  anchor?: Anchor;
  /** The comment this answers. Replies go one level deep. */
  parentId?: string;
  /** The setup it is left on (see `Comment`), if any. A reply takes its comment's. */
  variant?: string;
  by?: string;
}) {
  const text = input.text.trim();
  if (!text) throw new Error("Write something first.");

  const comments = await load(input.slug, input.version);
  const parent = input.parentId ? comments.find((item) => item.id === input.parentId) : undefined;
  if (input.parentId && (!parent || parent.parentId)) throw new Error("That comment isn't there to reply to.");
  const anchor = parent?.anchor ?? (input.anchor ? anchorSchema.parse(input.anchor) : null);
  if (!anchor) throw new Error("A comment has to be left somewhere.");

  const variant = parent ? parent.variant : input.variant;
  const comment: Comment = {
    id: crypto.randomUUID(),
    // A reply shares its comment's number: it is part of that thread, not a new one.
    n: parent?.n ?? Math.max(0, ...comments.filter((item) => item.variant === variant).map((item) => item.n)) + 1,
    author: named(input.by),
    at: new Date().toISOString(),
    text,
    anchor,
    variant,
    parentId: parent?.id,
  };
  await save(
    input.slug,
    input.version,
    [...comments, comment],
    `${parent ? "Reply to" : "Comment"} #${comment.n} on ${input.slug} ${input.version}`,
  );
  return comment;
}

export async function setResolved(input: { slug: string; version: string; id: string; resolved: boolean }) {
  const comments = await load(input.slug, input.version);
  const found = comments.find((item) => item.id === input.id);
  if (!found) throw new Error("That comment isn't there any more.");

  const next: Comment = { ...found, resolvedAt: input.resolved ? new Date().toISOString() : undefined };
  await save(
    input.slug,
    input.version,
    comments.map((item) => (item.id === next.id ? next : item)),
    `${input.resolved ? "Resolve" : "Reopen"} comment #${found.n} on ${input.slug} ${input.version}`,
  );
  return next;
}

/** Records which flow screen a comment is on, found after it was left. Only ever fills it in; the anchor is otherwise kept as it is. */
export async function setFlowScreen(input: { slug: string; version: string; id: string; flowScreen: string }) {
  const comments = await load(input.slug, input.version);
  const found = comments.find((item) => item.id === input.id);
  if (!found) throw new Error("That comment isn't there any more.");
  const next: Comment = { ...found, anchor: anchorSchema.parse({ ...found.anchor, flowScreen: input.flowScreen }) };
  await save(
    input.slug,
    input.version,
    comments.map((item) => (item.id === next.id ? next : item)),
    `Place comment #${found.n} on ${input.slug} ${input.version}`,
  );
  return next;
}

/** Takes a comment away, and the replies that answer it. */
export async function removeComment(input: { slug: string; version: string; id: string }) {
  const comments = await load(input.slug, input.version);
  const found = comments.find((item) => item.id === input.id);
  if (!found) throw new Error("That comment isn't there any more.");
  // A reply goes one level deep, so what answers a comment is everything pointing at it.
  const left = comments.filter((item) => item.id !== found.id && item.parentId !== found.id);
  await save(input.slug, input.version, left, `Delete comment #${found.n} on ${input.slug} ${input.version}`);
  return found.id;
}
