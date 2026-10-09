"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import { useUser } from "@/lib/use-user";

import { BellIcon, MenuIcon, SearchIcon } from "./nav-icons";

const item =
  "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-nav text-foreground hover:bg-surface-hover";

/**
 * On a phone there isn't room for search, notifications and the user as three
 * buttons, so they share one menu.
 */
export function MobileMenu({ onSearch, onSetup, onSwitch }: { onSearch: () => void; onSetup: () => void; onSwitch: () => void }) {
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
          <MenuIcon className="size-5" />
        </IconButton>
      }
    >
      <div role="menu" aria-label="Menu" className="flex flex-col">
        <button type="button" role="menuitem" onClick={choose(onSearch)} className={item}>
          <SearchIcon />
          Search
        </button>
        <button type="button" role="menuitem" onClick={choose(() => {})} className={item}>
          <BellIcon />
          Notifications
        </button>

        {ready ? (
          <div className="mt-1 flex flex-col border-t border-divider pt-1">
            <p className="px-2.5 py-1.5 text-xs text-foreground-muted">
              {name ? `Signed in as ${name}` : "Browsing as a guest"}
            </p>
            <button type="button" role="menuitem" onClick={choose(onSetup)} className={item}>
              Setup
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
