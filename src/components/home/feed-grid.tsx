import type { ReactNode } from "react";

/** The feed's columns: one on a phone, two on a tablet, three from there up. */
export function FeedGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-y-8 sm:grid-cols-2 sm:gap-x-4 md:grid-cols-3 md:gap-x-6 md:gap-y-10">{children}</div>;
}
