"use client";

import { createContext, useContext } from "react";

/**
 * Present on a shared page: comments are read and written with the share
 * link's token instead of the studio's door, and a visitor can add, reply and
 * like but not resolve or delete.
 */
export const SharedCommentsContext = createContext<{ token: string; /** On a review link: who the link is for, who comments are left as, whoever was chosen in this browser. */ as?: string; /** And the request it is for: only that review's comments are read. */ review?: string } | null>(null);

export function useSharedComments() {
  return useContext(SharedCommentsContext);
}
