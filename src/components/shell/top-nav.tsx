"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";

import { BellIcon, SettingsIcon } from "./nav-icons";
import { SearchField } from "./search-field";
import { ThemeMenu } from "./theme-menu";

function TeamLinks({ className }: { className: string }) {
  const pathname = usePathname();
  const { teams } = useStudio();

  return (
    <nav aria-label="Teams" className={className}>
      {teams
        .filter((team) => !team.archived)
        .map((team) => {
          const active = pathname === `/teams/${team.slug}` || pathname.startsWith(`/teams/${team.slug}/`);
          return (
            <Link
              key={team.slug}
              href={`/teams/${team.slug}`}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-[var(--r-full)] px-3 py-1.5 text-nav ${
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {team.name}
            </Link>
          );
        })}
    </nav>
  );
}

/**
 * The studio's one bar: logo on the left, search in the middle, and on the
 * right notifications, theme and settings. It sticks to the top of the
 * window while the page scrolls under it.
 */
export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] bg-background">
      <div className="grid h-[var(--nav-height)] grid-cols-[1fr_minmax(0,var(--search-width))_1fr] items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <Link href="/" aria-label="Prototype Studio" className="shrink-0">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-[22%] bg-accent text-base font-semibold text-accent-foreground"
            >
              P
            </span>
          </Link>
          <TeamLinks className="hidden items-center gap-0.5 md:flex" />
        </div>

        <SearchField />

        <nav aria-label="Studio" className="flex items-center gap-1 justify-self-end">
          <IconButton label="Notifications" variant="ghost" tooltipAlign="end">
            <BellIcon className="size-[1.125rem]" />
          </IconButton>
          <ThemeMenu />
          <IconButton
            label="Settings"
            variant="ghost"
            href="/settings"
            tooltipAlign="end"
            className={pathname.startsWith("/settings") ? "bg-surface-hover !text-foreground" : ""}
          >
            <SettingsIcon className="size-[1.125rem]" />
          </IconButton>
        </nav>
      </div>

      {/* No room beside the logo on a phone, so the teams get a row of their own. */}
      <TeamLinks className="flex items-center gap-0.5 overflow-x-auto px-4 pb-2 sm:px-6 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />
    </header>
  );
}
