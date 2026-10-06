import Link from "next/link";

import { ProjectOrb } from "./project-orb";

/**
 * A folder inside a team: its orb, its name, how much is in it. Small enough
 * to sit in a row above the work rather than compete with it.
 */
export function ProjectTile({
  href,
  slug,
  name,
  count,
}: {
  href: string;
  slug: string;
  name: string;
  count: number;
}) {
  return (
    <Link href={href} className="group flex w-[9.5rem] shrink-0 flex-col gap-2">
      <ProjectOrb seed={slug} className="w-full" />
      <div className="min-w-0">
        <p className="truncate text-base text-foreground">{name}</p>
        <p className="truncate text-sm text-foreground-subtle">
          {count} {count === 1 ? "prototype" : "prototypes"}
        </p>
      </div>
    </Link>
  );
}
