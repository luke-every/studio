"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Viewer } from "@/lib/auth/session";

/**
 * Who is looking, according to GitHub.
 *
 * Null means signed out: the studio still shows everything, but nothing can
 * be changed, because a change has to be attributable to somebody.
 */
const ViewerContext = createContext<Viewer | null | undefined>(undefined);

export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: Viewer | null;
  children: ReactNode;
}) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer | null {
  const context = useContext(ViewerContext);
  if (context === undefined) throw new Error("useViewer must be used inside ViewerProvider");
  return context;
}
