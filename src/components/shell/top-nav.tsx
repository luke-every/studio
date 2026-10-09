"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SetupDialog } from "@/components/onboarding/setup-dialog";
import { IconButton } from "@/components/ui/button";

import { Breadcrumbs } from "./breadcrumbs";
import { MobileMenu } from "./mobile-menu";
import { BellIcon, SearchIcon } from "./nav-icons";
import { SearchDialog } from "./search-dialog";
import { TeamMenu, TeamRow } from "./team-menu";
import { UserMenu } from "./user-menu";

/**
 * The studio's one bar: the name and where you are on the left (a Home menu of
 * teams on Home, breadcrumbs everywhere else), and on the
 * right search, notifications and the user, whose menu holds setup. On a
 * phone those three share one menu, and where you are drops to a row below: breadcrumbs, or on Home a scrolling row of the teams. It sticks to the
 * top of the window while the page scrolls under it. Search is a button that
 * opens a floating search over the page.
 */
export function TopNav({ onSwitchUser }: { onSwitchUser: () => void }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] bg-background">
      <div className="flex h-[var(--nav-height)] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 justify-self-start">
          <Link href="/" className="shrink-0 text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
            Test Kitchen
          </Link>
          <div className="max-sm:hidden">{pathname === "/" ? <TeamMenu /> : <Breadcrumbs />}</div>
        </div>

        <nav aria-label="Studio" className="flex items-center gap-1 max-sm:hidden">
          <IconButton label="Search" variant="ghost" tooltipAlign="end" onClick={() => setSearchOpen(true)}>
            <SearchIcon className="size-[1.125rem]" />
          </IconButton>
          <IconButton label="Notifications" variant="ghost" tooltipAlign="end">
            <BellIcon className="size-[1.125rem]" />
          </IconButton>
          <UserMenu onSwitch={onSwitchUser} onSetup={() => setSetupOpen(true)} />
        </nav>
        <div className="sm:hidden">
          <MobileMenu onSearch={() => setSearchOpen(true)} onSetup={() => setSetupOpen(true)} onSwitch={onSwitchUser} />
        </div>
      </div>

      {/* On a phone there is no room beside the name, so where you are gets a row of its own. */}
      <div className="px-4 pb-2 empty:hidden sm:hidden">{pathname === "/" ? <TeamRow /> : <Breadcrumbs />}</div>

      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      <SearchDialog open={searchOpen} onOpen={() => setSearchOpen(true)} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
