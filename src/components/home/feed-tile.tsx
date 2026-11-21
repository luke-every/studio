import Link from "next/link";

import { FlowIcon } from "@/components/shell/nav-icons";
import { AvatarStack } from "@/components/shell/user-avatar";
import { collaborators } from "@/lib/registry/select";
import type { Prototype } from "@/lib/registry/types";

import { TilePicture } from "./tile-picture";

/**
 * One prototype in the feed: a tall tile with the prototype at its centre
 * and its version in the corner, then who worked on it and what it is,
 * underneath.
 *
 * The phone holds a picture of the prototype, taken when it was pushed, or the
 * prototype itself, running but untouchable, until that picture exists.
 * Everything opens the prototype.
 */
export function FeedTile({ prototype, priority = false }: { prototype: Prototype; priority?: boolean }) {
  const href = `/prototypes/${prototype.slug}`;
  // A project with no prototype in it yet has no picture to show: a box with the canvas icon stands in.
  const blank = !!prototype.current.blank;

  return (
    <article className="flex min-w-0 flex-col gap-4">
      <Link
        href={href}
        aria-label={prototype.name}
        className="group/tile relative flex items-center justify-center rounded-[var(--r-tile)] bg-tile px-[25%] py-14 hover-lift md:h-[var(--tile-height)] md:py-0"
      >
        {blank ? null : (
          <span className="absolute left-3 top-3 md:left-4 md:top-4 rounded-[var(--r-tag)] bg-surface px-2.5 py-1 text-xs font-medium text-foreground">
            {prototype.current.version}
          </span>
        )}
        <div
          aria-hidden
          className="relative aspect-[9/19.5] w-[min(100%,var(--tile-device-width))] overflow-hidden rounded-[var(--r-device)] transition-transform duration-[var(--lift-duration)] ease-[var(--lift-curve)] group-hover/tile:scale-[1.03]"
        >
          {blank ? (
            <div className="absolute inset-0 grid place-items-center bg-surface text-foreground-subtle">
              <FlowIcon className="size-6" />
            </div>
          ) : prototype.current.url ? (
            <TilePicture priority={priority} url={prototype.current.url} title={`${prototype.name} ${prototype.current.version}`} />
          ) : (
            <div className="absolute inset-0 bg-surface pulse-soft" />
          )}
        </div>
      </Link>

      <div className="flex items-center gap-3 px-1">
        <AvatarStack people={collaborators(prototype)} className="size-10" ring="ring-background" />
        <Link href={href} className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">{prototype.name}</p>
          {blank ? null : <p className="truncate text-sm text-foreground-muted">{prototype.description}</p>}
        </Link>
      </div>
    </article>
  );
}
