"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { IconButton } from "@/components/ui/button";
import { useMediaQuery } from "@/lib/use-media-query";
import { useSearch } from "@/lib/search-store";

import { MobileMenu } from "./mobile-menu";
import { BellIcon, SearchIcon, SettingsIcon } from "./nav-icons";
import { SearchField } from "./search-field";
import { TeamMenu } from "./team-menu";
import { ThemeMenu } from "./theme-menu";
import { UserMenu } from "./user-menu";

/**
 * The studio's one bar: the logo and a team picker on the left, search in the
 * middle, and on the right notifications, theme, settings and the user. It sticks to the top of the
 * window while the page scrolls under it.
 */
export function TopNav({ onSwitchUser }: { onSwitchUser: () => void }) {
  const pathname = usePathname();
  const { clear } = useSearch();
  const mobile = useMediaQuery("(max-width: 639px)");
  const [searchOpen, setSearchOpen] = useState(false);

  // On a phone the search is an icon until it's wanted. The field is already on
  // the page, only hidden, so it can be focused right inside the tap: iOS only
  // opens the keyboard for a focus that comes straight from a touch.
  const openSearch = () => {
    document.getElementById("studio-search")?.focus();
    setSearchOpen(true);
  };
  const closeSearch = () => {
    clear();
    setSearchOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] bg-background">
      <div className="relative flex h-[var(--nav-height)] items-center justify-between gap-3 px-4 sm:grid sm:grid-cols-[1fr_minmax(0,var(--search-width))_1fr] sm:px-6">
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <Link href="/" aria-label="Prototype Studio" className="shrink-0">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-[22%] bg-accent text-base font-semibold text-accent-foreground"
            >
              P
            </span>
          </Link>
          <TeamMenu />
        </div>

        {/* A phone covers the whole bar with it while it's open. */}
        <div
          aria-hidden={mobile && !searchOpen ? true : undefined}
          className={`${
            searchOpen ? "" : "max-sm:pointer-events-none max-sm:opacity-0"
          } max-sm:absolute max-sm:inset-0 max-sm:z-10 max-sm:flex max-sm:items-center max-sm:gap-3 max-sm:bg-background max-sm:px-4`}
        >
          <div className="min-w-0 flex-1">
            <SearchField tabIndex={mobile && !searchOpen ? -1 : undefined} />
          </div>
          <button type="button" onClick={closeSearch} className="shrink-0 text-nav text-foreground sm:hidden">
            Cancel
          </button>
        </div>

        <nav aria-label="Studio" className="hidden items-center gap-1 justify-self-end sm:flex">
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
          <UserMenu onSwitch={onSwitchUser} />
        </nav>

        <div className="flex items-center gap-1 sm:hidden">
          <IconButton label="Search" variant="ghost" tooltipAlign="end" onClick={openSearch}>
            <SearchIcon className="size-[1.125rem]" />
          </IconButton>
          <UserMenu onSwitch={onSwitchUser} />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
