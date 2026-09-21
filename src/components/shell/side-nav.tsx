"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";

import { UserSwitcher } from "./user-switcher";
import { useStudio } from "@/lib/data/studio-store";

import { HomeIcon, TeamDot } from "./nav-icons";
import { SearchField } from "./search-field";

const destinations = [{ href: "/", label: "Home", icon: HomeIcon }];

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-1.5 text-sm ${
        active
          ? "bg-surface-hover text-foreground"
          : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <span className={active ? "text-foreground" : "text-foreground-subtle"}>{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

/**
 * The fixed frame of the studio. It never unmounts, so the content area is
 * the only thing that changes on navigation.
 */
export function SideNav() {
  const pathname = usePathname();
  const { teams, writable, error, dismissError } = useStudio();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="flex h-full flex-col gap-7 px-3 py-5">
      <Link href="/" className="px-2.5 text-sm font-medium tracking-[var(--tracking-tight)]">
        Prototype Studio
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
            {destinations.map((destination) => {
            const Icon = destination.icon;
            return (
              <NavLink
                key={destination.href}
                href={destination.href}
                active={isActive(destination.href)}
                icon={<Icon />}
              >
                {destination.label}
              </NavLink>
            );
          })}
        </div>

        <SearchField />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <p className="px-2.5 text-eyebrow">Teams</p>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {teams.map((team) => (
            <NavLink
              key={team.slug}
              href={`/teams/${team.slug}`}
              active={pathname === `/teams/${team.slug}`}
              icon={
                <span className="grid size-4 place-items-center">
                  <TeamDot tint={team.previews[0]?.tint[1] ?? "var(--border-strong)"} />
                </span>
              }
            >
              {team.name}
            </NavLink>
          ))}
        </div>
      </div>

      {error ? (
        <button
          type="button"
          onClick={dismissError}
          className="rounded-[var(--r-sm)] border border-border bg-surface-hover px-2.5 py-2 text-left text-xs leading-[var(--leading-normal)] text-foreground"
        >
          {error}
          <span className="mt-1 block text-foreground-subtle">Tap to dismiss</span>
        </button>
      ) : !writable ? (
        <p className="rounded-[var(--r-sm)] bg-surface-hover px-2.5 py-2 text-xs leading-[var(--leading-normal)] text-foreground-subtle">
          Reading from the registry files. Changes cannot be saved until the
          database is connected.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-divider px-1.5 pt-3">
        <UserSwitcher />
        <ThemeSwitcher />
      </div>
    </nav>
  );
}
