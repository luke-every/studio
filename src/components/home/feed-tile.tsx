import Link from "next/link";

import type { Prototype, Team } from "@/lib/registry/types";

import { TilePicture } from "./tile-picture";

/**
 * One prototype in the feed: a tall tile with the prototype at its centre
 * and its version in the corner, then who it belongs to and what it is,
 * underneath.
 *
 * The phone holds a picture of the prototype, taken when it was pushed, or the
 * prototype itself, running but untouchable, until that picture exists. The
 * team's icon links to the team; everything else opens the prototype. They
 * are siblings, never nested.
 */
export function FeedTile({ prototype, team }: { prototype: Prototype; team: Team | undefined }) {
  const href = `/prototypes/${prototype.slug}`;

  return (
    <article className="flex min-w-0 flex-col gap-4">
      <Link
        href={href}
        aria-label={prototype.name}
        className="relative flex items-center justify-center rounded-[var(--r-tile)] bg-tile px-[25%] py-14 hover-lift md:h-[var(--tile-height)] md:py-0"
      >
        <span className="absolute left-3 top-3 md:left-4 md:top-4 rounded-[var(--r-tag)] bg-surface px-2.5 py-1 text-xs font-medium text-foreground">
          {prototype.current.version}
        </span>
        <div
          aria-hidden
          className="relative aspect-[9/19.5] w-[min(100%,var(--tile-device-width))] overflow-hidden rounded-[var(--r-device)]"
        >
          {prototype.current.url ? (
            <TilePicture url={prototype.current.url} title={`${prototype.name} ${prototype.current.version}`} />
          ) : null}
        </div>
      </Link>

      <div className="flex items-center gap-3 px-1">
        <Link
          href={team ? `/teams/${team.slug}` : href}
          aria-label={team?.name ?? "Team"}
          className="grid size-10 shrink-0 place-items-center rounded-[var(--r-lg)] bg-tile text-sm font-medium text-foreground"
        >
          {team?.name.charAt(0).toUpperCase() ?? "?"}
        </Link>
        <Link href={href} className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">{prototype.name}</p>
          <p className="truncate text-sm text-foreground-muted">{prototype.description}</p>
        </Link>
      </div>
    </article>
  );
}
