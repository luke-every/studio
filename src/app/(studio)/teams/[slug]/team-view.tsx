"use client";

import { notFound, useParams } from "next/navigation";

import { FeedGrid } from "@/components/home/feed-grid";
import { FeedTile } from "@/components/home/feed-tile";
import { ProjectStrip } from "@/components/project/project-strip";
import { AddPrototype } from "@/components/prototype/add-prototype";
import { prototypesInTeam } from "@/lib/registry/select";
import { useStudio } from "@/lib/data/studio-store";
import { matchesPrototype, useSearch } from "@/lib/search-store";

/**
 * A team, and the prototypes inside it.
 *
 * A client view over the snapshot the layout already loaded, so opening a
 * team costs nothing: no fetch, no server render, no wait.
 */
export function TeamView() {
  const params = useParams<{ slug: string }>();
  const { teams, prototypes, opened } = useStudio();
  const { query } = useSearch();

  const team = teams.find((candidate) => candidate.slug === params.slug);
  if (!team) notFound();

  const contents = prototypesInTeam(team.slug, prototypes, opened).filter((prototype) =>
    matchesPrototype(prototype, query),
  );

  return (
    <div className="w-full px-5 py-8 sm:px-8 sm:py-10">
      <div>
        <ProjectStrip teamSlug={team.slug} />
      </div>

      <div className="mt-11 border-t border-divider pt-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-eyebrow">
            {query.trim() ? `Matching “${query.trim()}”` : "All prototypes"}
          </h2>
          <div className="flex items-center gap-2">
            <AddPrototype teamSlug={team.slug} trigger="button" />
          </div>
        </div>
        {contents.length > 0 ? (
          <FeedGrid>
            {contents.map((prototype) => (
              <FeedTile key={prototype.slug} prototype={prototype} team={team} />
            ))}
          </FeedGrid>
        ) : (
          <div className="max-w-[44ch] py-10">
            <p className="text-md text-foreground">
              {query.trim() ? "Nothing here matches that." : "Nothing in here yet."}
            </p>
            <p className="mt-2 text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
              {query.trim()
                ? `No prototype in ${team.name} matches what you typed. Clear the search to see the team again.`
                : `${team.name} is an empty room with a good question in it. The first prototype will show up here once there is something to look at.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
