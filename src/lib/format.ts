import type { PrototypeStatus } from "./data/types";

export const statusLabel: Record<PrototypeStatus, string> = {
  exploring: "Exploring",
  "in-review": "In review",
  shipped: "Shipped",
  parked: "Parked",
};

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
