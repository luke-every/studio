"use client";

import { LatestStrip } from "@/components/home/latest-strip";
import { NewTeamTile } from "@/components/team/new-team";
import { TeamCard } from "@/components/team/team-card";
import { Collection } from "@/components/ui/collection";
import { PageHeader } from "@/components/ui/page-header";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { latestPrototypes } from "@/lib/data/teams";
import { useStudio } from "@/lib/data/studio-store";
import { useViewMode } from "@/lib/use-view-mode";

/**
 * Home.
 *
 * Two deliberately unequal bands: a quiet strip of recent prototypes for
 * picking up where you left off, and beneath it the teams — the structure of
 * the studio, and the reason to be on this page.
 */
export default function HomePage() {
  const { teams, prototypes } = useStudio();
  const [mode, setMode] = useViewMode("teams");
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
