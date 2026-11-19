import type { ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
/** What ends a sentence rather than an address. */
const TRAILING = /[.,;:!?)\]'"]+$/;

/** Words with any web address in them made a link, in the selection blue: opened in a new tab, and a press on it is not a press on whatever holds the words. */
export function LinkedText({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const address = match[0].replace(TRAILING, "");
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a
        key={start}
        href={address.startsWith("www.") ? `https://${address}` : address}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-[var(--selection)] hover:underline"
      >
        {address}
      </a>,
    );
    last = start + address.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
