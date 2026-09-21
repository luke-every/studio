"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavigationDirection = "forward" | "backward" | "lateral";

function depth(pathname: string) {
  return pathname.split("/").filter(Boolean).length;
}

function compare(from: string, to: string): NavigationDirection {
  const a = depth(from);
  const b = depth(to);
  return b > a ? "forward" : b < a ? "backward" : "lateral";
}

/**
 * Which way the user moved.
 *
 * Going deeper (hub → prototype → version) reads as forward; coming back out
 * reads as backward; moving between siblings at the same level is lateral and
 * gets no directional offset, because there is no spatial claim to make.
 *
 * Implemented with the "adjust state during render" pattern rather than an
 * effect: the direction has to be known in the same render as the new route,
 * or the transition plays the wrong way round on its first frame.
 */
export function useNavigationDirection(): NavigationDirection {
  const pathname = usePathname();
  const [seen, setSeen] = useState<{ path: string; direction: NavigationDirection }>({
    path: pathname,
    direction: "lateral",
  });

  if (seen.path !== pathname) {
    setSeen({ path: pathname, direction: compare(seen.path, pathname) });
  }

  return seen.path === pathname ? seen.direction : compare(seen.path, pathname);
}
