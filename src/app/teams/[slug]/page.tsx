"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";

import { ProjectStrip } from "@/components/project/project-strip";
import { AddPrototype } from "@/components/prototype/add-prototype";
import { PrototypeTile } from "@/components/prototype/prototype-tile";
import { Collection } from "@/components/ui/collection";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { prototypesInTeam } from "@/lib/registry/select";
import { useStudio } from "@/lib/data/studio-store";
import { matchesPrototype, useSearch } from "@/lib/search-store";
import { useViewMode } from "@/lib/use-view-mode";

/** A team, and the prototypes inside it. */
export default function TeamPage() {
  const params = useParams<{ slug: string }>();
  const { teams, prototypes, opened } = useStudio();
  const [mode, setMode] = useViewMode("prototypes");
  const { query } = useSearch();

  const team = teams.find((candidate) => candidate.slug === params.slug);
  if (!team) notFound();

  const contents = prototypesInTeam(team.slug, prototypes, opened).filter((prototype) =>
    matchesPrototype(prototype, query),
  );

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <Link
        href="/"
        className="text-xs text-foreground-subtle transition-colors duration-[var(--dur-fast)] hover:text-foreground"
      >
        ← Teams
      </Link>

      <h1 className="mt-5 text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
        {team.name}
      </h1>

      <div className="mt-8">
        <ProjectStrip teamSlug={team.slug} />
      </div>

      <div className="mt-11 border-t border-divider pt-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-eyebrow">
            {query.trim() ? `Matching “${query.trim()}”` : "All prototypes"}
          </h2>
          <div className="flex items-center gap-2">
            <AddPrototype teamSlug={team.slug} trigger="button" />
            {contents.length > 0 ? (
              <ViewSwitcher mode={mode} onChange={setMode} scope="prototypes" />
            ) : null}
          </div>
        </div>
        {contents.length > 0 ? (
          <Collection mode={mode}>
            {contents.map((prototype) => (
              <PrototypeTile key={prototype.slug} prototype={prototype} mode={mode} />
            ))}
            {mode === "grid" && !query.trim() ? (
              <AddPrototype teamSlug={team.slug} />
            ) : null}
          </Collection>
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
