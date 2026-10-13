"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import { useUser } from "@/lib/use-user";

import { UnreadBadge } from "./notifications-menu";
import { FirstSteps } from "./first-steps";
import { BellIcon, MenuIcon, SearchIcon } from "./nav-icons";

const item =
  "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-nav text-foreground hover:bg-surface-hover";

/**
 * On a phone there isn't room for search, notifications and the user as three
 * buttons, so they share one menu.
 */
export function MobileMenu({ unread, onNotifications, onSearch, onSetup, onSettings, onSwitch, onEditProfile }: { unread: number; onNotifications: () => void; onSearch: () => void; onSetup: () => void; onSettings: () => void; onSwitch: () => void; onEditProfile: () => void }) {
  const { ready, name, leave } = useUser();
  const [open, setOpen] = useState(false);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      className="w-56"
      trigger={
        <IconButton
          label="Menu"
          variant="ghost"
          tooltipAlign="end"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="relative">
            <MenuIcon className="size-5" />
            {unread ? <span aria-label={`${unread} unread`} className="absolute -right-1 -top-1 size-2.5 rounded-full bg-destructive" /> : null}
          </span>
        </IconButton>
      }
    >
      <div role="menu" aria-label="Menu" className="flex flex-col">
        <FirstSteps className={item} onSetup={choose(onSetup)} />
        <button type="button" role="menuitem" onClick={choose(onSearch)} className={item}>
          <SearchIcon />
          Search
        </button>
        <button type="button" role="menuitem" onClick={choose(onNotifications)} className={item}>
          <BellIcon />
          Notifications
          <UnreadBadge count={unread} className="ml-auto" />
        </button>

        {ready ? (
          <div className="mt-1 flex flex-col border-t border-divider pt-1">
            <p className="px-2.5 py-1.5 text-xs text-foreground-muted">
              {name ? `Signed in as ${name}` : "Browsing as a guest"}
            </p>
            {name ? (
              <button type="button" role="menuitem" onClick={choose(onEditProfile)} className={item}>
                Edit profile
              </button>
            ) : null}
            <button type="button" role="menuitem" onClick={choose(onSettings)} className={item}>
              Settings
            </button>
            <button type="button" role="menuitem" onClick={choose(onSwitch)} className={item}>
              Switch user
            </button>
            <button type="button" role="menuitem" onClick={choose(leave)} className={item}>
              Log out
            </button>
          </div>
        ) : null}
      </div>
    </MotionPopover>
  );
}
