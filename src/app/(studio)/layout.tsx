import { Suspense, type ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { StudioProvider } from "@/lib/data/studio-store";
import { MotionProvider } from "@/lib/motion";
import { getRegistrySnapshot } from "@/lib/registry";

/**
 * The studio, behind the door.
 *
 * The registry is read once here, at build time, and handed to the client as
 * a snapshot — which is what lets every page below be prerendered and every
 * navigation be instant, with no server round trip.
 *
 * Where it isn't prerendered (the local studio reads the registry on every request), the read happens inside a
 * Suspense boundary, so the frame — wordmark, tabs, tiles holding their place — is on screen at once and the data
 * fills in behind it.
 *
 * Nothing in this layout may read a cookie or a header. Doing so opts every
 * page underneath out of prerendering; the door is checked in middleware for
 * exactly that reason.
 */
export default function StudioLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Studio>{children}</Studio>
    </Suspense>
  );
}

async function Studio({ children }: { children: ReactNode }) {
  const snapshot = await getRegistrySnapshot();

  return (
    <StudioProvider snapshot={snapshot}>
      <MotionProvider>
        <AppShell>{children}</AppShell>
      </MotionProvider>
    </StudioProvider>
  );
}
