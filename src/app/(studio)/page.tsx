"use client";

import { LatestStrip } from "@/components/home/latest-strip";
import { PrototypeTile } from "@/components/prototype/prototype-tile";
import { NewTeamTile } from "@/components/team/new-team";
import { TeamCard } from "@/components/team/team-card";
import { Collection } from "@/components/ui/collection";
import { PageHeader } from "@/components/ui/page-header";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { latestPrototypes } from "@/lib/registry/select";
import { useStudio } from "@/lib/data/studio-store";
import { matchesPrototype, matchesTeam, useSearch } from "@/lib/search-store";
import { useViewMode } from "@/lib/use-view-mode";

/**
 * Home.
 *
 * Two deliberately unequal bands: a quiet strip of recent prototypes for
 * picking up where you left off, and beneath it the teams — the structure of
 * the studio, and the reason to be on this page.
 *
 * While there is a search query the page becomes the results. Nothing
 * navigates, nothing opens: the view the user is already looking at narrows
 * as they type, and emptying the field puts it back.
 */
export default function HomePage() {
  const { teams, prototypes } = useStudio();
  const [mode, setMode] = useViewMode("teams");
  const { query, clear } = useSearch();

  if (query.trim()) {
    return <SearchResults query={query} onClear={clear} />;
  }

  const recent = latestPrototypes(10, prototypes);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <LatestStrip prototypes={recent} />

      <div className="mt-12 border-t border-divider pt-8 sm:mt-14">
        <PageHeader
          title="Teams"
          description="Every part of the business we are making things for."
          actions={<ViewSwitcher mode={mode} onChange={setMode} scope="teams" />}
        />

        <div className="mt-7">
          <Collection mode={mode} of="teams">
            {teams.map((team) => (
              <TeamCard key={team.slug} team={team} mode={mode} />
            ))}
            <NewTeamTile mode={mode} />
          </Collection>
        </div>
      </div>
    </div>
  );
}

function SearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  const { teams, prototypes } = useStudio();
  const [mode, setMode] = useViewMode("prototypes");

  const matchedPrototypes = prototypes
    .filter((prototype) => !prototype.archived && matchesPrototype(prototype, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const matchedTeams = teams.filter((team) => matchesTeam(team, query));
  const nothing = matchedPrototypes.length === 0 && matchedTeams.length === 0;

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Search"
        title={`“${query.trim()}”`}
        description={
          nothing
            ? undefined
            : `${matchedPrototypes.length} ${
                matchedPrototypes.length === 1 ? "prototype" : "prototypes"
              }${matchedTeams.length > 0 ? `, ${matchedTeams.length} ${matchedTeams.length === 1 ? "team" : "teams"}` : ""}`
        }
        actions={
          matchedPrototypes.length > 0 ? (
            <ViewSwitcher mode={mode} onChange={setMode} scope="prototypes" />
          ) : null
        }
      />

      {nothing ? (
        <div className="max-w-[44ch] py-10">
          <p className="text-md text-foreground">Nothing matches that.</p>
          <p className="mt-2 text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
            Search looks at names, descriptions, the question each prototype is asking
            and the reasoning in its versions — so a half-remembered phrase is usually
            enough.{" "}
            <button
              type="button"
              onClick={onClear}
              className="text-foreground underline underline-offset-2"
            >
              Clear the search
            </button>{" "}
            to go back to the teams.
          </p>
        </div>
      ) : (
        <div className="mt-7 flex flex-col gap-11">
          {matchedPrototypes.length > 0 ? (
            <Collection mode={mode}>
              {matchedPrototypes.map((prototype) => (
                <PrototypeTile key={prototype.slug} prototype={prototype} mode={mode} />
              ))}
            </Collection>
          ) : null}

          {matchedTeams.length > 0 ? (
            <section>
              <h2 className="text-eyebrow">Teams</h2>
              <div className="mt-3">
                <Collection mode="list" of="teams">
                  {matchedTeams.map((team) => (
                    <TeamCard key={team.slug} team={team} mode="list" />
                  ))}
                </Collection>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
