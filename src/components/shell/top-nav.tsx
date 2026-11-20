"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SetupDialog } from "@/components/onboarding/setup-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { useStarts } from "@/lib/terminal";
import type { ActivityFeed } from "@/lib/use-activity";

import { Breadcrumbs } from "./breadcrumbs";
import { Logo } from "./logo";
import { NewPrototypeDialog } from "./new-prototype-dialog";
import { EditProfileModal } from "./profile-modal";
import { SettingsDialog } from "./settings-dialog";
import { PlusIcon, SearchIcon } from "./nav-icons";
import { NotificationsMenu } from "./notifications-menu";
import { SearchDialog } from "./search-dialog";
import { DesignQaLink, PulseLink, StorybookLink, TeamMenu, TeamRow } from "./team-menu";
import { UserMenu } from "./user-menu";

/**
 * The studio's one bar: the name and where you are on the left (a Home menu of
 * teams on Home, breadcrumbs everywhere else), and on the
 * right search, notifications and the user, whose menu holds setup. On a
 * phone those three share one menu, and where you are drops to a row below: breadcrumbs, or on Home a scrolling row of the teams. It sticks to the
 * top of the window while the page scrolls under it. Search is a button that
 * opens a floating search over the page.
 */
export function TopNav({ feed, onSwitchUser }: { feed: ActivityFeed; onSwitchUser: () => void }) {
  const pathname = usePathname();
  const atHome = pathname === "/" || pathname === "/pulse" || pathname === "/storybook" || pathname === "/design-qa";
  const onPrototype = pathname.startsWith("/prototypes/");
  // Starting a prototype is something the helper on this machine does, so the button is only there when it is reachable.
  const starts = useStarts();
  const [newOpen, setNewOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] bg-background max-lg:in-data-fullscreen:hidden lg:transition-[translate,margin] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] lg:in-data-fullscreen:-mt-[var(--nav-height)] lg:in-data-fullscreen:-translate-y-full">
      <div className="flex h-[var(--nav-height)] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 justify-self-start">
          <Link href="/" aria-label="Every Studio home" className="shrink-0">
            <Logo />
          </Link>
          <div className="flex min-w-0 items-center gap-1 max-sm:hidden">
            {atHome ? (
              <>
                <TeamMenu />
                <DesignQaLink />
                <PulseLink />
                <StorybookLink />
              </>
            ) : (
              <Breadcrumbs />
            )}
            <div data-nav-slot className="flex shrink-0 items-center gap-1 empty:hidden" />
          </div>
        </div>

        <nav aria-label="Studio" className="flex items-center gap-1 max-sm:hidden">
          {starts && !onPrototype ? (
            <Button icon={<PlusIcon className="size-4" />} onClick={() => setNewOpen(true)}>
              New prototype
            </Button>
          ) : null}
          <IconButton label="Search" variant="ghost" tooltipAlign="end" onClick={() => setSearchOpen(true)}>
            <SearchIcon className="size-[1.125rem]" />
          </IconButton>
          <NotificationsMenu feed={feed} />
          <UserMenu onSwitch={onSwitchUser} onSetup={() => setSetupOpen(true)} onSettings={() => setSettingsOpen(true)} onEditProfile={() => setProfileOpen(true)} />
        </nav>
      </div>

      {/* On a phone there is no room beside the name, so where you are gets a row of its own. */}
      <div className="flex min-w-0 items-center gap-1 px-4 pb-2 empty:hidden sm:hidden">
        {atHome ? <TeamRow /> : <Breadcrumbs />}
        <div data-nav-slot className="flex shrink-0 items-center gap-1 empty:hidden" />
      </div>

      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSetup={() => setSetupOpen(true)} />
      <EditProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      {newOpen && starts ? <NewPrototypeDialog starts={starts} onClose={() => setNewOpen(false)} /> : null}
      <SearchDialog open={searchOpen} onOpen={() => setSearchOpen(true)} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
