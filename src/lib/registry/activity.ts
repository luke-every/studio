import "server-only";

import type { Activity } from "@/lib/activity";

import { readStoreFile, writeStoreFile } from "./store";

/**
 * What the bell in the nav lists: the latest comments and replies across the
 * studio, newest first, in one small file beside the registry. It is a feed,
 * not a record; the comments themselves are kept per version as always.
 */
const PATH = "activity.json";
const KEEP = 30;

export async function readActivity(): Promise<Activity[]> {
  const text = await readStoreFile(PATH);
  return text ? (JSON.parse(text) as Activity[]) : [];
}

export async function recordActivity(entry: Activity) {
  const next = [entry, ...(await readActivity())].slice(0, KEEP);
  await writeStoreFile(PATH, `${JSON.stringify(next, null, 2)}\n`, "Note a comment");
}
