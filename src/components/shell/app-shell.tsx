"use client";

import { useState, type ReactNode } from "react";

import { MotionSheet, RouteTransition } from "@/components/motion";

import { SideNav } from "./side-nav";

/**
 * The studio frame: a fixed rail on the left, content on the right.
 *
 * The rail persists across every navigation, which is what lets the active
 * indicator travel and keeps the content area as the only thing that changes.
 * Below the medium breakpoint the rail is not shrunk — it becomes a sheet,
 * summoned from a bar that carries the same information at a different
 * density.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[15rem] shrink-0 border-r border-border bg-background md:block">
        <SideNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-[var(--z-sticky)] flex h-12 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl md:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-[var(--r-sm)] border border-border px-2.5 py-1 text-xs text-foreground-muted"
          >
            Menu
          </button>
          <span className="text-sm font-medium">Prototype Studio</span>
        </div>

        <main className="min-w-0 flex-1">
          <RouteTransition>{children}</RouteTransition>
        </main>
      </div>

      <MotionSheet
        open={navOpen}
        onClose={() => setNavOpen(false)}
        label="Navigation"
        side="right"
        className="p-0"
      >
        <div onClick={() => setNavOpen(false)}>
          <SideNav />
        </div>
      </MotionSheet>
    </div>
  );
}
