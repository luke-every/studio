import "server-only";

import { InfraError } from "./errors";
import { readStoreFile, updateStoreFile } from "./store";

/**
 * Slack: how the studio reaches a person outside it.
 *
 * Nobody signs in, so a person is a name. Each person says once which Slack
 * member they are (Settings), and that is kept in one small file beside the
 * registry, keyed by lower-case name. The studio's own Slack app sends the
 * message as a direct message; it needs only the permission to post
 * (`chat:write`). Slack is optional: with no token set, or no id for a person,
 * nothing is sent and nothing else is affected.
 */
const PATH = "people/slack.json";
const MEMBER_ID = /^[UW][A-Z0-9]{6,}$/;

const token = () => process.env.SLACK_BOT_TOKEN?.trim() || "";
export const slackConnected = () => !!token();

const keyOf = (name: string) => name.trim().toLowerCase();

type Entry = { id: string; name: string };
/** An entry saved before names were kept is only an id: its key is the best name there is. */
const parse = (text: string | null): Record<string, Entry> =>
  Object.fromEntries(
    Object.entries(text ? (JSON.parse(text) as Record<string, string | Entry>) : {}).map(([key, value]) => [key, typeof value === "string" ? { id: value, name: key } : value]),
  );

/** Everyone who has said who they are on Slack, by lower-case name. */
export const slackPeople = async () => parse(await readStoreFile(PATH));

export type SlackMember = { id: string; name: string; image?: string };

let remembered: { at: number; members: SlackMember[] } | null = null;
const REMEMBER_MS = 5 * 60_000;

/** Everyone in the workspace who can be asked: not bots, not people who have left. Needs the app to have `users:read`. Kept for a few minutes. */
export async function slackMembers(): Promise<SlackMember[]> {
  if (!token()) throw new Error("Slack isn't connected.");
  if (remembered && Date.now() - remembered.at < REMEMBER_MS) return remembered.members;
  type Listed = { ok?: boolean; error?: string; members?: { id: string; name?: string; real_name?: string; deleted?: boolean; is_bot?: boolean; profile?: { real_name?: string; display_name?: string; image_72?: string; is_custom_image?: boolean } }[]; response_metadata?: { next_cursor?: string } };
  const members: SlackMember[] = [];
  let cursor = "";
  do {
    const url = new URL("https://slack.com/api/users.list");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    const result = (await response.json().catch(() => null)) as Listed | null;
    if (!result?.ok) {
      throw new Error(result?.error === "missing_scope" ? "Slack needs the users:read permission. Add it to the app and reinstall it." : `Slack refused it: ${result?.error ?? `no answer (${response.status})`}.`);
    }
    for (const member of result.members ?? []) {
      if (member.deleted || member.is_bot || member.id === "USLACKBOT") continue;
      const name = member.profile?.real_name?.trim() || member.real_name?.trim() || member.profile?.display_name?.trim() || member.name || member.id;
      // Only a photo they chose: Slack's stand-in is a letter on a colour, which the studio's own default does better.
      members.push({ id: member.id, name, image: member.profile?.is_custom_image ? member.profile.image_72 : undefined });
    }
    cursor = result.response_metadata?.next_cursor ?? "";
  } while (cursor);
  members.sort((a, b) => a.name.localeCompare(b.name));
  remembered = { at: Date.now(), members };
  return members;
}

/** Who a studio name is on Slack: the full name, or a first name that only one person has. */
export function matchMember(name: string, members: SlackMember[]) {
  const wanted = keyOf(name);
  const exact = members.filter((member) => keyOf(member.name) === wanted);
  if (exact.length === 1) return exact[0];
  const first = members.filter((member) => keyOf(member.name).split(/\s+/)[0] === wanted);
  return first.length === 1 ? first[0] : undefined;
}

/** A person's Slack id: the one they saved, else who they are in the workspace. */
async function slackIdFor(name: string) {
  const saved = (await slackPeople())[keyOf(name)]?.id;
  if (saved) return saved;
  return matchMember(name, await slackMembers().catch(() => []))?.id;
}

/** Sets a person's Slack member id, or takes it away when it is empty. */
export async function setSlackId(name: string, id: string) {
  const key = keyOf(name);
  const value = id.trim();
  if (!key) throw new Error("Choose who you are first.");
  if (value && !MEMBER_ID.test(value)) throw new Error("That doesn't look like a member ID. It starts with U or W.");
  await updateStoreFile(PATH, (text) => {
    const rest = Object.fromEntries(Object.entries(parse(text)).filter(([other]) => other !== key));
    return { content: JSON.stringify(value ? { ...rest, [key]: { id: value, name: name.trim() } } : rest), message: "Update Slack members" };
  });
}

/** Sends a direct message. Says what Slack answered if it refuses. */
async function post(memberId: string, text: string) {
  if (!token()) throw new Error("Slack isn't connected.");
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token()}` },
    // A user's id as the channel opens the app's direct message with them.
    body: JSON.stringify({ channel: memberId, text, unfurl_links: false }),
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!result?.ok) throw new Error(`Slack refused it: ${result?.error ?? `no answer (${response.status})`}.`);
}

/** The test button: tells the person exactly what happened. */
export async function sendSlackTest(name: string) {
  const id = (await slackPeople())[keyOf(name)]?.id;
  if (!id) throw new Error("Save your member ID first.");
  await post(id, "Slack is connected to the studio.");
}

/**
 * Tells somebody something on Slack if they can be told. Never throws: what happened is already saved, and a message
 * that didn't arrive is logged, not an error for the person who caused it.
 */
export async function tellOnSlack(name: string, text: string) {
  try {
    if (!slackConnected()) return;
    const id = await slackIdFor(name);
    if (id) await post(id, text);
  } catch (error) {
    console.error("slack failed", error instanceof InfraError ? error.message : error);
  }
}

/** Tells somebody on Slack by their id, when it was picked from the workspace. Never throws, like `tellOnSlack`. */
export async function tellSlackId(id: string, text: string) {
  try {
    if (slackConnected()) await post(id, text);
  } catch (error) {
    console.error("slack failed", error instanceof InfraError ? error.message : error);
  }
}

/**
 * A line with a link into the studio, for a Slack message: always the live studio, never this machine, whoever asked from where.
 * Its address is `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets itself; run on a machine, put the same in `.env.local`. When it
 * isn't known the message goes without the line, rather than with one that leads nowhere.
 */
export function linkLine(path: string, text: string) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!host) {
    console.warn("slack: no live address to link to; set VERCEL_PROJECT_PRODUCTION_URL");
    return "";
  }
  return `\n<https://${host}${path}|${text}>`;
}
