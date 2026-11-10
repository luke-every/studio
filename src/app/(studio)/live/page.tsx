"use client";

import { FeedGrid } from "@/components/home/feed-grid";
import { FeedTile } from "@/components/home/feed-tile";
import { useStudio } from "@/lib/data/studio-store";
import { latestPrototypes } from "@/lib/registry/select";

/**
 * Live, on this machine: the prototypes with a dev server running in their folder, so a change shows as soon as it is
 * saved. Which are running is read when the page loads, so refresh after starting one. The live studio has none, and
 * its tab bar has no Live tab.
 */
export default function LivePage() {
  const { prototypes } = useStudio();
  const running = latestPrototypes(prototypes.length, prototypes).filter((prototype) => prototype.current.live);

  return (
    <div className="w-full px-5 pb-8 pt-2 sm:px-8 sm:pb-10">
      {running.length === 0 ? (
        <p className="py-10 text-sm text-foreground-muted">Nothing running. Start a prototype&rsquo;s dev server and it shows up here.</p>
      ) : (
        <FeedGrid>
          {running.map((prototype, index) => (
            <FeedTile key={prototype.slug} prototype={prototype} priority={index < 3} />
          ))}
        </FeedGrid>
      )}
    </div>
  );
}
