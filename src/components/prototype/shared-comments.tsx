"use client";

import { createContext, useContext } from "react";

/**
 * Present on a shared page: comments are read and written with the share
 * link's token instead of the studio's door, and a visitor can add, reply and
 * like but not resolve or delete.
 */
export const SharedCommentsContext = createContext<{ token: string } | null>(null);

export function useSharedComments() {
  return useContext(SharedCommentsContext);
}
