"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import { useUser } from "@/lib/use-user";

import { UserAvatar } from "./user-avatar";

const item =
  "flex w-full items-center rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover";

/** The person at the top right: who you are, and a way to switch or leave. */
export function UserMenu({ onSwitch }: { onSwitch: () => void }) {
  const { ready, name, leave } = useUser();
  const [open, setOpen] = useState(false);

  if (!ready) return null;

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      className="w-44"
      trigger={
        <IconButton
          label={name || "Guest"}
          variant="ghost"
          tooltipAlign="end"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <UserAvatar name={name} className="size-6" />
        </IconButton>
      }
    >
      <div role="menu" aria-label="User" className="flex flex-col">
        <p className="px-2.5 py-1.5 text-xs text-foreground-muted">
          {name ? `Signed in as ${name}` : "Browsing as a guest"}
        </p>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onSwitch();
          }}
          className={item}
        >
          Switch user
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            leave();
          }}
          className={item}
        >
          Log out
        </button>
      </div>
    </MotionPopover>
  );
}
