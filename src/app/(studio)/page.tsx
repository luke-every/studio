"use client";

import { FeedGrid } from "@/components/home/feed-grid";
import { FeedTile } from "@/components/home/feed-tile";
import { latestPrototypes } from "@/lib/registry/select";
import { useStudio } from "@/lib/data/studio-store";

/**
 * Home.
 *
 * The feed: every prototype, most recently changed first, one tile each.

 */
export default function HomePage() {
  const { teams, prototypes } = useStudio();

  const feed = latestPrototypes(prototypes.length, prototypes);

  return (
    <div className="w-full px-5 pb-8 pt-4 sm:px-8 sm:pb-10">
      {feed.length === 0 ? (
        <p className="py-10 text-sm text-foreground-muted">
          Nothing here yet. Push a prototype and it will show up first.
        </p>
      ) : (
        <FeedGrid>
          {feed.map((prototype) => (
            <FeedTile
              key={prototype.slug}
              prototype={prototype}
              team={teams.find((team) => team.slug === prototype.teamSlug)}
            />
          ))}
        </FeedGrid>
      )}
    </div>
  );
}
