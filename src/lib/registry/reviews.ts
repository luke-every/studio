import "server-only";

import { dueLabel, reviewsFileSchema, variantSchema, VERDICTS, type Review } from "@/lib/reviews";
import { z } from "zod";

import { isStoreConfigured, readStoreFileShared, updateStoreFile } from "./store";
import { getPrototype } from "./index";
import { linkLine, tellOnSlack } from "./slack";
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

type Request = { slug: string; version: string; message: string; due?: string; dueBy?: "lunch" | "eod"; reviewers: string[]; by?: string; variants?: { setup: string; label: string }[] };

export async function requestReview(input: Request): Promise<Review> {
  const prototype = await getPrototype(input.slug);
  if (!prototype) throw new Error("That prototype isn't here any more.");
  const version = prototype.versions.find((one) => !one.live && !one.blank && one.version === input.version);
  if (!version) throw new Error("Choose a version that has been pushed.");

  const by = named(input.by);
  const names = [...new Set(input.reviewers.map((name) => name.trim()).filter(Boolean))];
  if (!names.length) throw new Error("Choose who should review it.");
  if (input.due && !/^\d{4}-\d{2}-\d{2}$/.test(input.due)) throw new Error("That isn't a date.");
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
    reviewers: names.map((name) => ({ name })),
  };
  await updateStoreFile(pathFor(input.slug), (text) => ({
    content: JSON.stringify([review, ...(text ? reviewsFileSchema.parse(JSON.parse(text)) : [])]),
    message: `Review of ${input.slug} ${review.version} requested of ${names.join(", ")}`,
  }));

  // Saved first: whether anybody hears about it is a separate matter.
  const link = linkLine(`/r/${input.slug}/${review.id}`, "Open the review");
  const due = review.due ? ` by ${dueLabel(review.due, review.dueBy)}` : "";
  await Promise.all(
    names.map((name) =>
      tellOnSlack(name, `*${by.name}* asked you to review *${prototype.name}* ${review.version}${due}.${review.message ? `\n>${review.message.replace(/\n/g, "\n>")}` : ""}${review.variants ? `\nLook at: ${review.variants.map((one) => one.label).join(", ")}` : ""}${link}`),
    ),
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
