import type { ReactNode } from "react";

import { RouteTransition } from "@/components/motion";

import { Masthead } from "./masthead";

/**
 * The persistent frame. It never unmounts on navigation, which is what lets
 * the active-nav indicator and any shared element travel between routes
 * instead of being torn down and rebuilt.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Masthead />
      <main className="flex-1">
        <RouteTransition>{children}</RouteTransition>
      </main>
    </div>
  );
}
