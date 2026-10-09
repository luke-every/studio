"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useStudio } from "@/lib/data/studio-store";

import { ChevronDownIcon } from "./nav-icons";

/**
 * Where you are, beside the wordmark, lined up with the Home button it replaces: Home, then the team, project and
 * prototype you have gone into. Nothing on Home itself. Every step but the last
 * is a way back.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const { teams, projects, prototypes } = useStudio();
  const [section, slug, , projectSlug] = pathname.split("/").filter(Boolean);

  const trail: { label: string; href?: string }[] = [];
  const team = (teamSlug: string) => {
    const found = teams.find((candidate) => candidate.slug === teamSlug);
    if (found) trail.push({ label: found.name, href: `/teams/${found.slug}` });
  };
  const project = (teamSlug: string, projectSlug: string) => {
    const found = projects.find((candidate) => candidate.teamSlug === teamSlug && candidate.slug === projectSlug);
    if (found) trail.push({ label: found.name, href: `/teams/${teamSlug}/projects/${found.slug}` });
  };

  if (section === "teams" && slug) {
    team(slug);
    if (projectSlug) project(slug, projectSlug);
  } else if (section === "prototypes" && slug) {
    const prototype = prototypes.find((candidate) => candidate.slug === slug);
    if (prototype) {
      team(prototype.teamSlug);
      if (prototype.projectSlug) project(prototype.teamSlug, prototype.projectSlug);
      trail.push({ label: prototype.name });
    }
  }
  if (!trail.length) return null;

  const all = [{ label: "Home", href: "/" }, ...trail];

  return (
    <nav aria-label="Breadcrumbs" className="min-w-0 sm:pl-3">
      <ol className="flex min-w-0 items-center gap-2 text-nav">
        {all.map((crumb, index) => (
          <li key={crumb.label} className="flex min-w-0 items-center gap-2">
            {index ? <ChevronDownIcon className="size-3 shrink-0 -rotate-90 text-foreground-subtle" /> : null}
            {crumb.href && index < all.length - 1 ? (
              <Link href={crumb.href} className="truncate text-foreground-muted hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
