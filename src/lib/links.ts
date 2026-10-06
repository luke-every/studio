/**
 * The links a prototype can carry, and what counts as one.
 *
 * Plain functions with no server code in them, so the dialog can say a link is
 * wrong before anything is sent, and the server can check it again — it never
 * trusts what the browser says it checked.
 */
export const LINK_HOSTS = {
  figma: ["figma.com"],
  notion: ["notion.so", "notion.site", "notion.com"],
} as const;

export type LinkKind = keyof typeof LINK_HOSTS;

export const LINK_NAMES: Record<LinkKind, string> = { figma: "Figma", notion: "Notion" };

/** Why `value` can't be used as a link of this kind, or null if it can. Empty is fine: it removes the link. */
export function linkProblem(kind: LinkKind, value: string): string | null {
  if (!value.trim()) return null;
  const name = LINK_NAMES[kind];

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return `That doesn't look like a link. Paste the ${name} address.`;
  }

  const allowed = LINK_HOSTS[kind].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  return url.protocol === "https:" && allowed ? null : `That isn't a ${name} link.`;
}
