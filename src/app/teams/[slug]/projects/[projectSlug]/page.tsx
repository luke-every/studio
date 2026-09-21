"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";

import { AddPrototype } from "@/components/prototype/add-prototype";
import { PrototypeTile } from "@/components/prototype/prototype-tile";
import { Collection } from "@/components/ui/collection";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { useStudio } from "@/lib/data/studio-store";
import { prototypesInProject } from "@/lib/registry/select";
import { formatUpdated } from "@/lib/format";
import { matchesPrototype, useSearch } from "@/lib/search-store";
import { useViewMode } from "@/lib/use-view-mode";

/** A project folder: the prototypes filed into it, most recently opened first. */
export default function ProjectPage() {
  const params = useParams<{ slug: string; projectSlug: string }>();
  const { teams, projects, prototypes, opened } = useStudio();
  const [mode, setMode] = useViewMode("prototypes");
  const { query } = useSearch();

  const team = teams.find((candidate) => candidate.slug === params.slug);
  const project = projects.find(
    (candidate) => candidate.slug === params.projectSlug && candidate.teamSlug === params.slug,
  );
  if (!team || !project) notFound();

  const contents = prototypesInProject(project.slug, prototypes, opened).filter((prototype) =>
    matchesPrototype(prototype, query),
  );

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <Link
        href={`/teams/${team.slug}`}
        className="text-xs text-foreground-subtle transition-colors duration-[var(--dur-fast)] hover:text-foreground"
      >
        ← {team.name}
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-eyebrow">{team.name} · Project</p>
          <h1 className="mt-1.5 text-xl font-medium tracking-[var(--tracking-tight)] text-foreground">
            {project.name}
          </h1>
          <p className="mt-2 text-xs text-foreground-subtle">
            {contents.length} {contents.length === 1 ? "prototype" : "prototypes"}
            {contents[0] ? ` · ${formatUpdated(contents[0].updatedAt)}` : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <AddPrototype teamSlug={team.slug} projectSlug={project.slug} trigger="button" />
          {contents.length > 0 ? (
            <ViewSwitcher mode={mode} onChange={setMode} scope="prototypes" />
          ) : null}
        </div>
      </header>

      <div className="mt-8 border-t border-divider pt-7">
        {contents.length > 0 ? (
          <Collection mode={mode}>
            {contents.map((prototype) => (
              <PrototypeTile key={prototype.slug} prototype={prototype} mode={mode} />
            ))}
          </Collection>
        ) : (
          <div className="max-w-[44ch] py-10">
            <p className="text-md text-foreground">Nothing filed in here yet.</p>
            <p className="mt-2 text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
              Use the menu on any prototype in {team.name} to file it into {project.name}.
              Nothing moves — a project is a way of looking at the team&rsquo;s work, not a
              place things disappear into.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
