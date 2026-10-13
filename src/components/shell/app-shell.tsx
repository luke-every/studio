"use client";

import { useEffect, useState, type ReactNode } from "react";

import { RouteTransition } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";
import { useUser } from "@/lib/use-user";

import { TopNav } from "./top-nav";
import { UserPicker } from "./user-picker";

/**
 * The studio frame: a sticky bar across the top, content beneath it.
 *
 * The bar persists across every navigation, so the content area is the only
 * thing that changes.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { error, dismissError } = useStudio();
  const { ready, current } = useUser();
  const [switching, setSwitching] = useState(false);

  // A tapped notification can ask this page to go to a comment (see public/sw.js).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data?.open === "string") window.location.assign(event.data.open);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.startMessages?.();
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav onSwitchUser={() => setSwitching(true)} />

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

      <UserPicker open={ready && (current === null || switching)} onClose={() => setSwitching(false)} />
    </div>
  );
}
