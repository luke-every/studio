"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { MotionModal } from "@/components/motion";
import { SetupDialog } from "@/components/onboarding/setup-dialog";
import { IconButton } from "@/components/ui/button";
import { useActivity } from "@/lib/use-activity";

import { Breadcrumbs } from "./breadcrumbs";
import { MobileMenu } from "./mobile-menu";
import { EditProfileModal } from "./profile-modal";
import { SettingsDialog } from "./settings-dialog";
import { SearchIcon } from "./nav-icons";
import { NotificationList } from "./notification-list";
import { NotificationsMenu } from "./notifications-menu";
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const feed = useActivity();

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] bg-background lg:transition-[translate,margin] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] lg:in-data-fullscreen:-mt-[var(--nav-height)] lg:in-data-fullscreen:-translate-y-full">
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
          <NotificationsMenu feed={feed} />
          <UserMenu onSwitch={onSwitchUser} onSetup={() => setSetupOpen(true)} onSettings={() => setSettingsOpen(true)} onEditProfile={() => setProfileOpen(true)} />
        </nav>
        <div className="sm:hidden">
          <MobileMenu unread={feed.unread} onNotifications={() => setNotificationsOpen(true)} onSearch={() => setSearchOpen(true)} onSetup={() => setSetupOpen(true)} onSettings={() => setSettingsOpen(true)} onSwitch={onSwitchUser} onEditProfile={() => setProfileOpen(true)} />
        </div>
      </div>

      {/* On a phone there is no room beside the name, so where you are gets a row of its own. */}
      <div className="px-4 pb-2 empty:hidden sm:hidden">{pathname === "/" ? <TeamRow /> : <Breadcrumbs />}</div>

      <MotionModal
        open={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          feed.readAll();
        }}
        label="Notifications"
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">Notifications</h2>
          <NotificationList
            feed={feed}
            onNavigate={() => {
              setNotificationsOpen(false);
              feed.readAll();
            }}
          />
        </div>
      </MotionModal>
      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSetup={() => setSetupOpen(true)} />
      <EditProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SearchDialog open={searchOpen} onOpen={() => setSearchOpen(true)} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
