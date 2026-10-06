"use client";

import { FeedGrid } from "@/components/home/feed-grid";
import { FeedTile } from "@/components/home/feed-tile";
import { latestPrototypes } from "@/lib/registry/select";
import { useStudio } from "@/lib/data/studio-store";
import { matchesPrototype, useSearch } from "@/lib/search-store";

/**
 * Home.
 *
 * The feed: every prototype, most recently changed first, one tile each.
 *
 * While there is a search query the page becomes the results. Nothing
 * navigates, nothing opens: the view the user is already looking at narrows
 * as they type, and emptying the field puts it back.
 */
export default function HomePage() {
  const { teams, prototypes } = useStudio();
  const { query, clear } = useSearch();

  if (query.trim()) {
    return <SearchResults query={query} onClear={clear} />;
  }

  const feed = latestPrototypes(prototypes.length, prototypes);

  return (
    <div className="w-full px-5 py-8 sm:px-8 sm:py-10">
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

function SearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  const { teams, prototypes } = useStudio();

  const matched = prototypes
    .filter((prototype) => !prototype.archived && matchesPrototype(prototype, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="w-full px-5 py-8 sm:px-8 sm:py-10">
      {matched.length === 0 ? (
        <div className="max-w-[44ch] py-10">
          <p className="text-md text-foreground">Nothing matches that.</p>
          <p className="mt-2 text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
            Search looks at names, descriptions and the notes on each version, so a
            half-remembered phrase is usually enough.{" "}
            <button
              type="button"
              onClick={onClear}
              className="text-foreground underline underline-offset-2"
            >
              Clear the search
            </button>{" "}
            to go back to the feed.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-6 text-sm text-foreground-muted">
            {matched.length} {matched.length === 1 ? "prototype" : "prototypes"} matching “{query.trim()}”
          </p>
          <FeedGrid>
            {matched.map((prototype) => (
              <FeedTile
                key={prototype.slug}
                prototype={prototype}
                team={teams.find((team) => team.slug === prototype.teamSlug)}
              />
            ))}
          </FeedGrid>
        </>
      )}
    </div>
  );
}
