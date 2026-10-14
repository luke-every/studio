import "server-only";

import { anchorSchema, commentsFileSchema, type Anchor, type Comment } from "@/lib/comments";

import { isStoreConfigured, readStoreFileShared, updateStoreFile } from "./store";
import { VERSION_PATTERN, versionSegment } from "./version";
import { announceComment, announceLike } from "./push";
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
  const text = await readStoreFileShared(pathFor(slug, version));
  return text ? commentsFileSchema.parse(JSON.parse(text)) : [];
}

/**
 * Change a version's comments from whatever the file holds now, retrying on a
 * fresh copy if somebody else saved first (see `updateStoreFile`). `change`
 * must be re-runnable and free of side effects; it returns the new list, the
 * commit message and whatever the caller wants back.
 */
async function update<T>(
  slug: string,
  version: string,
  change: (comments: Comment[]) => { comments: Comment[]; message: string; result: T },
): Promise<T> {
  if (!isStoreConfigured()) {
    throw new Error("No content repository is connected, so nothing can be saved.");
  }
  let result!: T;
  await updateStoreFile(pathFor(slug, version), (text) => {
    const done = change(text ? commentsFileSchema.parse(JSON.parse(text)) : []);
    result = done.result;
    return { content: JSON.stringify(done.comments), message: done.message };
  });
  return result;
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
  /** The commenter's chosen face, for the notification only; it is not kept. */
  avatar?: number;
}) {
  const text = input.text.trim();
  if (!text) throw new Error("Write something first.");
  const id = crypto.randomUUID();
  const at = new Date().toISOString();

  const comment = await update(input.slug, input.version, (comments) => {
    const parent = input.parentId ? comments.find((item) => item.id === input.parentId) : undefined;
    if (input.parentId && (!parent || parent.parentId)) throw new Error("That comment isn't there to reply to.");
    const anchor = parent?.anchor ?? (input.anchor ? anchorSchema.parse(input.anchor) : null);
    if (!anchor) throw new Error("A comment has to be left somewhere.");

    const variant = parent ? parent.variant : input.variant;
    const comment: Comment = {
      id,
      // A reply shares its comment's number: it is part of that thread, not a new one.
      n: parent?.n ?? Math.max(0, ...comments.filter((item) => item.variant === variant).map((item) => item.n)) + 1,
      author: named(input.by),
      at,
      text,
      anchor,
      variant,
      parentId: parent?.id,
    };
    return {
      comments: [...comments, comment],
      message: `${parent ? "Reply to" : "Comment"} #${comment.n} on ${input.slug} ${input.version}`,
      result: comment,
    };
  });
  await announceComment({ slug: input.slug, version: input.version, comment, avatar: input.avatar });
  return comment;
}

/** Replaces one comment by id with what `change` makes of it. */
function changeOne(
  input: { slug: string; version: string; id: string },
  change: (found: Comment) => { next: Comment; message: string },
) {
  return update(input.slug, input.version, (comments) => {
    const found = comments.find((item) => item.id === input.id);
    if (!found) throw new Error("That comment isn't there any more.");
    const { next, message } = change(found);
    return {
      comments: comments.map((item) => (item.id === next.id ? next : item)),
      message: `${message} on ${input.slug} ${input.version}`,
      result: { next, found },
    };
  });
}

/** Likes or unlikes a comment for somebody, by name: nobody signs in, so a name is who a like is from. */
export async function setLiked(input: { slug: string; version: string; id: string; by: string; liked: boolean; avatar?: number }) {
  const by = input.by.trim();
  if (!by) throw new Error("Choose who you are to like a comment.");
  const { next, found } = await changeOne(input, (found) => {
    const others = (found.likes ?? []).filter((name) => name !== by);
    return {
      next: { ...found, likes: input.liked ? [...others, by] : others },
      message: `${input.liked ? "Like" : "Unlike"} comment #${found.n}`,
    };
  });
  // Only a new like of somebody else's comment is news.
  if (input.liked && !found.likes?.includes(by) && by.toLowerCase() !== found.author.name.toLowerCase()) {
    await announceLike({ slug: input.slug, version: input.version, comment: next, by, avatar: input.avatar });
  }
  return next;
}

export async function setResolved(input: { slug: string; version: string; id: string; resolved: boolean }) {
  const { next } = await changeOne(input, (found) => ({
    next: { ...found, resolvedAt: input.resolved ? new Date().toISOString() : undefined },
    message: `${input.resolved ? "Resolve" : "Reopen"} comment #${found.n}`,
  }));
  return next;
}

/** Records which flow screen a comment is on, found after it was left. Only ever fills it in; the anchor is otherwise kept as it is. */
export async function setFlowScreen(input: { slug: string; version: string; id: string; flowScreen: string }) {
  const { next } = await changeOne(input, (found) => ({
    next: { ...found, anchor: anchorSchema.parse({ ...found.anchor, flowScreen: input.flowScreen }) },
    message: `Place comment #${found.n}`,
  }));
  return next;
}

/** Takes a comment away, and the replies that answer it. */
export async function removeComment(input: { slug: string; version: string; id: string }) {
  return update(input.slug, input.version, (comments) => {
    const found = comments.find((item) => item.id === input.id);
    if (!found) throw new Error("That comment isn't there any more.");
    return {
      // A reply goes one level deep, so what answers a comment is everything pointing at it.
      comments: comments.filter((item) => item.id !== found.id && item.parentId !== found.id),
      message: `Delete comment #${found.n} on ${input.slug} ${input.version}`,
      result: found.id,
    };
  });
}
