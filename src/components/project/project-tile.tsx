import Link from "next/link";

import { TeamThumbnail } from "@/components/team/team-thumbnail";
import type { PreviewSource } from "@/lib/data/types";

/**
 * A folder inside a team, shown the way a team is shown on home — the screens
 * it holds, stacked — but small enough to sit in a row above the work rather
 * than compete with it.
 */
export function ProjectTile({
  href,
  name,
  count,
  previews,
}: {
  href: string;
  name: string;
  count: number;
  previews: PreviewSource[];
}) {
  return (
    <Link href={href} className="group flex w-[9.5rem] shrink-0 flex-col gap-2">
      <TeamThumbnail
        previews={previews}
        compact
        className="aspect-[5/3] w-full transition-colors duration-[var(--dur-fast)] group-hover:border-border-strong"
      />
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{name}</p>
        <p className="truncate text-xs text-foreground-subtle">
          {count} {count === 1 ? "prototype" : "prototypes"}
        </p>
      </div>
    </Link>
  );
}
