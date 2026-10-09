import { AppShell } from "@/components/shell/app-shell";
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
 * Nothing in this layout may read a cookie or a header. Doing so opts every
 * page underneath out of prerendering; the door is checked in middleware for
 * exactly that reason.
 */
export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const snapshot = await getRegistrySnapshot();

  return (
    <StudioProvider snapshot={snapshot}>
      <MotionProvider>
        <AppShell>{children}</AppShell>
      </MotionProvider>
    </StudioProvider>
  );
}
