"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { useCurrentUser } from "@/lib/current-user";

/**
 * Who you are, for attribution.
 *
 * There is no sign-in yet, so you say who you are and the studio remembers
 * it in this browser. Everything you create is recorded against that person,
 * which is the whole point of the Hub existing — a shared link should say
 * who made the thing and who chose it.
 */
export function UserSwitcher() {
  const { user, users, setUser } = useCurrentUser();
  const [open, setOpen] = useState(false);

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-44"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-1 py-1 text-left text-xs text-foreground-muted hover:bg-surface-hover hover:text-foreground"
        >
          <span
            aria-hidden
            className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-inset text-2xs text-foreground-muted"
          >
            {user.initials}
          </span>
          <span className="truncate">{user.name}</span>
        </button>
      }
    >
      <div role="menu">
        <p className="px-2.5 py-1.5 text-eyebrow">Signed in as</p>
        {users.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="menuitemradio"
            aria-checked={candidate.id === user.id}
            onClick={() => {
              setUser(candidate.id);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-sm text-foreground-muted hover:bg-surface-hover hover:text-foreground"
          >
            <span className="truncate">{candidate.name}</span>
            {candidate.id === user.id ? (
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
            ) : null}
          </button>
        ))}
      </div>
    </MotionPopover>
  );
}
