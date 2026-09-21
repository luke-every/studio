import Link from "next/link";

import { TeamThumbnail } from "@/components/team/team-thumbnail";
import type { TeamSummary } from "@/lib/registry/select";
import { formatUpdated } from "@/lib/format";
import type { ViewMode } from "@/lib/use-view-mode";

/** One team, in either view mode. */
export function TeamCard({ team, mode }: { team: TeamSummary; mode: ViewMode }) {
  const grid = mode === "grid";

  return (
    <article>
      <Link
        href={`/teams/${team.slug}`}
        className={`group flex gap-4 rounded-[var(--r-md)] ${
          grid ? "flex-col" : "flex-row items-center border-b border-divider py-3"
        }`}
      >
        <TeamThumbnail
          previews={team.previews}
          compact={!grid}
          className={grid ? "aspect-[5/3] w-full" : "aspect-[5/3] w-28 shrink-0"}
        />

        <div
          className={`flex min-w-0 gap-1 ${grid ? "flex-col" : "flex-1 flex-col sm:flex-row sm:items-center sm:gap-6"}`}
        >
          <div className={grid ? "" : "sm:w-48"}>
            <h3 className="truncate text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
              {team.name}
            </h3>
            {grid ? (
              <p className="mt-0.5 truncate text-xs text-foreground-subtle">{team.remit}</p>
            ) : null}
          </div>

          <p
            className={`text-sm leading-[var(--leading-normal)] text-foreground-muted ${
              grid ? "mt-1 line-clamp-2" : "hidden flex-1 truncate sm:block"
            }`}
          >
            {team.description}
          </p>

          <div
            className={`flex items-center gap-2.5 text-xs text-foreground-subtle ${grid ? "mt-2" : "shrink-0"}`}
          >
            <span>
              {team.prototypeCount} {team.prototypeCount === 1 ? "prototype" : "prototypes"}
            </span>
            <span aria-hidden>·</span>
            <span>{formatUpdated(team.updatedAt)}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
