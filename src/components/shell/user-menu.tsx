"use client";

import { MotionPopover } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import { useHoverOpen } from "@/lib/use-hover-open";
import { useUser } from "@/lib/use-user";

import { UserAvatar } from "./user-avatar";

const item =
  "flex w-full items-center rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover";

/** The person at the top right: who you are, how to get set up, and a way to switch or leave. */
export function UserMenu({ onSwitch, onSetup, onEditProfile }: { onSwitch: () => void; onSetup: () => void; onEditProfile: () => void }) {
  const { ready, name, leave } = useUser();
  const { open, setOpen, hoverProps } = useHoverOpen();

  if (!ready) return null;

  return (
    <div {...hoverProps}>
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      className="w-44"
      trigger={
        <IconButton
          label={name || "Guest"}
          variant="ghost"
          // Hovering opens the menu, which says who you are, so no label as well.
          tooltip={false}
          // The face is 24px against the others' 18px glyphs, so less padding keeps the button the same width as theirs.
          className="!px-[0.5625rem]"
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
        {name ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEditProfile();
            }}
            className={item}
          >
            Edit profile
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onSetup();
          }}
          className={item}
        >
          Setup
        </button>

        <div className="mt-1 flex flex-col border-t border-divider pt-1">
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
      </div>
    </MotionPopover>
    </div>
  );
}
