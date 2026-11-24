import "server-only";

import { dueLabel, reviewsFileSchema, variantSchema, VERDICTS, type Review } from "@/lib/reviews";
import { z } from "zod";

import { isStoreConfigured, readStoreFileShared, updateStoreFile } from "./store";
import { getPrototype } from "./index";
import { linkLine, tellOnSlack, tellSlackId } from "./slack";
import { versionSegment } from "./version";
import { named } from "./write";

/** Review requests, one file per prototype beside the comments (see `lib/reviews.ts`). Read-modify-write like them. */

function pathFor(slug: string) {
  // This comes from the browser and becomes a path, so it is checked here.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("That isn't a prototype.");
  return `reviews/${slug}.json`;
}

/** Newest first. */
export async function readReviews(slug: string): Promise<Review[]> {
  const text = await readStoreFileShared(pathFor(slug));
  return text ? reviewsFileSchema.parse(JSON.parse(text)) : [];
}

type Request = { slug: string; version: string; message: string; due?: string; dueBy?: "lunch" | "eod"; reviewers: { name: string; slackId?: string }[]; by?: string; variants?: { setup: string; label: string }[] };

export async function requestReview(input: Request): Promise<Review> {
  const prototype = await getPrototype(input.slug);
  if (!prototype) throw new Error("That prototype isn't here any more.");
  const version = prototype.versions.find((one) => !one.live && !one.blank && one.version === input.version);
  if (!version) throw new Error("Choose a version that has been pushed.");

  const by = named(input.by);
  // Each person once, by who they are on Slack when that is known, else by name.
  const seen = new Set<string>();
  const people = input.reviewers.flatMap((one) => {
    const name = one.name.trim();
    const slackId = one.slackId?.trim() || undefined;
    if (slackId && !/^[UW][A-Z0-9]{6,}$/.test(slackId)) throw new Error("One of the people chosen isn't on Slack as that. Choose them again.");
    const id = slackId ?? name.toLowerCase();
    if (!name || seen.has(id)) return [];
    seen.add(id);
    return [{ name, slackId }];
  });
  if (!people.length) throw new Error("Choose who should review it.");
  const asked = z.array(variantSchema).max(20).safeParse(input.variants ?? []);
  if (!asked.success) throw new Error("Those variations couldn't be read. Choose them again.");
  if (!isStoreConfigured()) throw new Error("No content repository is connected, so nothing can be saved.");

  const review: Review = {
    id: crypto.randomUUID(),
    version: version.version,
    message: input.message.trim(),
    variants: asked.data.length ? asked.data : undefined,
    due: input.due || undefined,
    dueBy: input.due ? (input.dueBy === "lunch" ? "lunch" : "eod") : undefined,
    by: by.name,
    at: new Date().toISOString(),
    // Each has a key of their own: their link is how the review page knows who is looking, so nobody signs in.
    reviewers: people.map((one) => ({ ...one, key: crypto.randomUUID() })),
  };
  await updateStoreFile(pathFor(input.slug), (text) => ({
    content: JSON.stringify([review, ...(text ? reviewsFileSchema.parse(JSON.parse(text)) : [])]),
    message: `Review of ${input.slug} ${review.version} requested of ${people.map((one) => one.name).join(", ")}`,
  }));

  // Saved first: whether anybody hears about it is a separate matter.
  const due = review.due ? ` by ${dueLabel(review.due, review.dueBy)}` : "";
  await Promise.all(
    review.reviewers.map((one) => {
      const link = linkLine(`/r/${input.slug}/${review.id}?k=${one.key}`, "Open the review");
      const text = `*${by.name}* asked you to review *${prototype.name}* ${review.version}${due}.${review.message ? `\n>${review.message.replace(/\n/g, "\n>")}` : ""}${review.variants ? `\nLook at: ${review.variants.map((one) => one.label).join(", ")}` : ""}${link}`;
      return one.slackId ? tellSlackId(one.slackId, text) : tellOnSlack(one.name, text);
    }),
  );
  return review;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Changes one reviewer's part of a request from what the file holds now, and says what the request was before and after.
 * `change` must be re-runnable (see `updateStoreFile`). A request or reviewer that isn't there is an error the person can read.
 */
async function changeReviewer(slug: string, id: string, name: string, change: (reviewer: Review["reviewers"][number]) => Review["reviewers"][number]) {
  if (!isStoreConfigured()) throw new Error("No content repository is connected, so nothing can be saved.");
  let before!: Review;
  let after!: Review;
  await updateStoreFile(pathFor(slug), (text) => {
    const all = text ? reviewsFileSchema.parse(JSON.parse(text)) : [];
    const found = all.find((item) => item.id === id);
    if (!found) throw new Error("That review isn't here any more.");
    if (!found.reviewers.some((one) => same(one.name, name))) throw new Error("This review was asked of somebody else.");
    before = found;
    after = { ...found, reviewers: found.reviewers.map((one) => (same(one.name, name) ? change(one) : one)) };
    return { content: JSON.stringify(all.map((item) => (item.id === id ? after : item))), message: `Review of ${slug} ${found.version}: ${name}` };
  });
  return { before, after };
}

const mine = (review: Review, name: string) => review.reviewers.find((one) => same(one.name, name))!;

/** A reviewer has opened it. Only the first time is kept, and only the first time tells the person who asked. */
export async function openReview(input: { slug: string; id: string; name: string }) {
  const existing = (await readReviews(input.slug)).find((item) => item.id === input.id);
  if (existing && existing.reviewers.some((one) => same(one.name, input.name) && one.openedAt)) return;

  const { before, after } = await changeReviewer(input.slug, input.id, input.name, (one) => ({ ...one, openedAt: one.openedAt ?? new Date().toISOString() }));
  if (mine(before, input.name).openedAt) return;

  const prototype = await getPrototype(input.slug);
  await tellOnSlack(after.by, `*${mine(after, input.name).name}* opened your review of *${prototype?.name ?? input.slug}* ${after.version}.${linkLine(`/prototypes/${input.slug}/reviews`, "See the reviews")}`);
}

/** A reviewer sends their review: an overall answer and a verdict. Theirs once sent. */
export async function finishReview(input: { slug: string; id: string; name: string; response: string; verdict: string }) {
  const response = input.response.trim();
  if (!response) throw new Error("Write your overall response first.");
  if (input.verdict !== "approved" && input.verdict !== "changes") throw new Error("Choose Approved or Changes needed.");
  const verdict = input.verdict;
  const at = new Date().toISOString();

  const { after } = await changeReviewer(input.slug, input.id, input.name, (one) => {
    if (one.doneAt) throw new Error("You've already sent this review.");
    return { ...one, openedAt: one.openedAt ?? at, doneAt: at, verdict, response };
  });
  const prototype = await getPrototype(input.slug);
  const done = after.reviewers.filter((one) => one.doneAt).length;
  await tellOnSlack(
    after.by,
    `*${mine(after, input.name).name}* finished their review of *${prototype?.name ?? input.slug}* ${after.version}: *${VERDICTS[verdict]}* (${done} of ${after.reviewers.length} in).\n>${response.replace(/\n/g, "\n>")}${linkLine(`/prototypes/${input.slug}/reviews`, "See the reviews")}`,
  );
}

/** The id of the review a comment is for, if it was left by one of the people asked, on the version asked about. */
export async function reviewFor(input: { slug: string; version: string; by: string; review?: string }) {
  if (!input.review) return undefined;
  const found = (await readReviews(input.slug)).find((item) => item.id === input.review);
  if (!found || versionSegment(found.version) !== versionSegment(input.version)) return undefined;
  return found.reviewers.some((one) => same(one.name, input.by)) ? found.id : undefined;
}

/** A request without anybody's personal keys, for the studio's own pages: a key is for the one link it is in. */
export const publicReviews = (all: Review[]): Review[] =>
  all.map((review) => ({ ...review, reviewers: review.reviewers.map(({ name, slackId, openedAt, doneAt, verdict, response }) => ({ name, slackId, openedAt, doneAt, verdict, response })) }));

/** The person a personal link is for, and the request, or an error that can be read. The key is theirs alone and is looked for in the stored request. */
export async function reviewerFor(slug: string, id: string, key: string) {
  const review = (await readReviews(slug)).find((item) => item.id === id);
  const one = key ? review?.reviewers.find((person) => person.key === key) : undefined;
  if (!review || !one) throw new Error("This link isn't valid.");
  return { review, name: one.name };
}

/** Where the person a link is for has got to, and nobody else's. */
export async function reviewerState(slug: string, id: string, key: string) {
  const { review, name } = await reviewerFor(slug, id, key);
  const one = mine(review, name);
  return { name: one.name, openedAt: one.openedAt, doneAt: one.doneAt, verdict: one.verdict, response: one.response };
}

export async function openReviewAs(slug: string, id: string, key: string) {
  const { name } = await reviewerFor(slug, id, key);
  await openReview({ slug, id, name });
}

export async function finishReviewAs(slug: string, id: string, key: string, response: string, verdict: string) {
  const { name } = await reviewerFor(slug, id, key);
  await finishReview({ slug, id, name, response, verdict });
}
