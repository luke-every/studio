"use client";

import type { ReactNode } from "react";

import { RouteTransition } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";

import { TopNav } from "./top-nav";

/**
 * The studio frame: a sticky bar across the top, content beneath it.
 *
 * The bar persists across every navigation, so the content area is the only
 * thing that changes.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { error, dismissError } = useStudio();

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />

      {error ? (
        <button
          type="button"
          onClick={dismissError}
          className="border-b border-border bg-surface-hover px-6 py-2 text-left text-xs text-foreground"
        >
          {error} <span className="text-foreground-subtle">Tap to dismiss</span>
        </button>
      ) : null}

      <main className="min-w-0 flex-1">
        <RouteTransition>{children}</RouteTransition>
      </main>
    </div>
  );
}
