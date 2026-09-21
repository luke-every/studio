"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";

import { ProjectStrip } from "@/components/project/project-strip";
import { PrototypeTile } from "@/components/prototype/prototype-tile";
import { TeamThumbnail } from "@/components/team/team-thumbnail";
import { Collection } from "@/components/ui/collection";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { prototypesInTeam } from "@/lib/data/teams";
import { useStudio } from "@/lib/data/studio-store";
import { formatUpdated, teamStatusLabel } from "@/lib/format";
import { useViewMode } from "@/lib/use-view-mode";

/** A team, and the prototypes inside it. */
export default function TeamPage() {
  const params = useParams<{ slug: string }>();
  const { teams, prototypes } = useStudio();
  const [mode, setMode] = useViewMode("prototypes");

  const team = teams.find((candidate) => candidate.slug === params.slug);
  if (!team) notFound();

  const contents = prototypesInTeam(team.slug, prototypes);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <Link
        href="/"
        className="text-xs text-foreground-subtle transition-colors duration-[var(--dur-fast)] hover:text-foreground"
      >
        ← Teams
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 items-end gap-4">
          <TeamThumbnail previews={team.previews} compact className="aspect-[5/3] w-28 shrink-0" />
          <div className="min-w-0">
            <p className="text-eyebrow">{team.remit}</p>
            <h1 className="mt-1.5 text-xl font-medium tracking-[var(--tracking-tight)] text-foreground">
              {team.name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2.5 text-xs text-foreground-subtle">
              <span>{teamStatusLabel[team.status]}</span>
              <span aria-hidden>·</span>
              <span>Led by {team.lead.name}</span>
              <span aria-hidden>·</span>
              <span>{formatUpdated(team.updatedAt)}</span>
            </p>
          </div>
        </div>

        {contents.length > 0 ? (
          <ViewSwitcher mode={mode} onChange={setMode} scope="prototypes" />
        ) : null}
      </header>

      <p className="mt-6 max-w-[62ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
        {team.description}
      </p>

      <div className="mt-9">
        <ProjectStrip teamSlug={team.slug} />
      </div>

      <div className="mt-11 border-t border-divider pt-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-eyebrow">All prototypes</h2>
        </div>
        {contents.length > 0 ? (
          <Collection mode={mode}>
            {contents.map((prototype) => (
              <PrototypeTile key={prototype.slug} prototype={prototype} mode={mode} />
            ))}
          </Collection>
        ) : (
          <div className="max-w-[40ch] py-10">
            <p className="text-md text-foreground">Nothing in here yet.</p>
            <p className="mt-2 text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
              {team.name} is an empty room with a good question in it. The first
              prototype will show up here once there is something to look at.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
