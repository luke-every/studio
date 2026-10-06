import type { ReactNode } from "react";

/** The feed's columns: two on a phone, three from tablet up. */
export function FeedGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10">{children}</div>;
}
