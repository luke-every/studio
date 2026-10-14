import "server-only";

import type { Activity } from "@/lib/activity";

import { readStoreFileShared, updateStoreFile } from "./store";

/**
 * What the bell in the nav lists: the latest comments and replies across the
 * studio, newest first, in one small file beside the registry. It is a feed,
 * not a record; the comments themselves are kept per version as always.
 */
const PATH = "activity.json";
const KEEP = 30;

export async function readActivity(): Promise<Activity[]> {
  const text = await readStoreFileShared(PATH);
  return text ? (JSON.parse(text) as Activity[]) : [];
}

export const recordActivity = (entry: Activity) =>
  updateStoreFile(PATH, (text) => {
    const current = text ? (JSON.parse(text) as Activity[]) : [];
    const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, KEEP);
    return { content: JSON.stringify(next), message: "Note a comment" };
  });
