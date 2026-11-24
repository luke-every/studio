import "server-only";

import { readStoreFileShared, updateStoreFile } from "./store";

/**
 * The studio's people: a name, and their Slack photo when they have one, in one small file beside the registry. Somebody
 * joins it when they are asked to review (from the Slack workspace) or ask for a review, and from then on they are there on
 * every device, with their photo. It is not a login: nobody signs in, and a name is still all that credits what they do.
 * Anybody without a photo looks as their name works out to, as everywhere else (see `lib/avatars.ts`).
 */
const PATH = "people/directory.json";

export type Listed = { name: string; slackId?: string; image?: string };

const parse = (text: string | null) => (text ? (JSON.parse(text) as Listed[]) : []);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const readDirectory = async () => parse(await readStoreFileShared(PATH));

/** Adds people, or brings an existing one up to date (the same Slack member, else the same name). */
export const rememberPeople = (people: Listed[]) =>
  updateStoreFile(PATH, (text) => {
    const all = parse(text);
    for (const person of people) {
      const name = person.name.trim();
      if (!name) continue;
      const at = all.findIndex((one) => (person.slackId && one.slackId === person.slackId) || same(one.name, name));
      const merged: Listed = { ...(at >= 0 ? all[at] : {}), name: at >= 0 ? all[at].name : name, slackId: person.slackId ?? (at >= 0 ? all[at].slackId : undefined), image: person.image ?? (at >= 0 ? all[at].image : undefined) };
      if (at >= 0) all[at] = merged;
      else all.push(merged);
    }
    return { content: JSON.stringify(all), message: "Update the studio's people" };
  });
