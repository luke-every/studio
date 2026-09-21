import type { ReactNode } from "react";

import type { ViewMode } from "@/lib/use-view-mode";

/**
 * The container both browsing surfaces share.
 *
 * Prototypes are phone screens, so their grid is many narrow columns; teams
 * are wide tiles, so theirs is few. List is one column of rows in both cases.
 */
const arrangement = {
  prototypes: {
    grid: "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
    list: "flex flex-col",
  },
  teams: {
    grid: "grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3",
    list: "flex flex-col",
  },
} as const;

export function Collection({
  mode,
  of = "prototypes",
  children,
}: {
  mode: ViewMode;
  of?: keyof typeof arrangement;
  children: ReactNode;
}) {
  return <div className={arrangement[of][mode]}>{children}</div>;
}
