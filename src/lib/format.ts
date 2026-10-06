/**
 * Dates are written the way a person would say them out loud, because this is
 * a studio, not an audit log.
 */
export function formatUpdated(iso: string, now = new Date("2026-09-21")): string {
  const date = new Date(iso);
  const days = Math.round((now.getTime() - date.getTime()) / 86_400_000);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 35) return `${Math.round(days / 7)} weeks ago`;

  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/**
 * An exact moment, for where the minute matters: "4 Oct, 14:32". A record
 * that only has a date shows just the date. The year appears only when it
 * isn't this one.
 *
 * `local` is the reader's own time zone, which only the browser knows. The
 * pages are prerendered, so the server's rendering is the date in UTC with
 * no time — `Stamp` swaps in the local one once it is on screen.
 */
export function formatStamp(iso: string, local = true): string {
  const timeZone = local ? undefined : "UTC";
  const date = new Date(iso);
  const hasTime = local && iso.includes("T");
  const sameYear =
    date.toLocaleDateString("en-GB", { year: "numeric", timeZone }) ===
    new Date().toLocaleDateString("en-GB", { year: "numeric", timeZone });

  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  });
  if (!hasTime) return day;

  return `${day}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * When something last changed, the way you'd say it: "Today, 14:00",
 * "Yesterday, 09:30", and from the day before that the date, "3 Oct, 14:00".
 * Days are the reader's own, so like `formatStamp` this is for the browser;
 * `local = false` gives the server's date-only version.
 */
export function formatWhen(iso: string, local = true): string {
  if (!local) return formatStamp(iso, false);

  const date = new Date(iso);
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (daysAgo !== 0 && daysAgo !== 1) return formatStamp(iso, true);

  const day = daysAgo === 0 ? "Today" : "Yesterday";
  if (!iso.includes("T")) return day;
  return `${day}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
