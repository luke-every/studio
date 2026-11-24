"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { IconButton } from "@/components/ui/button";
import { useFlag } from "@/lib/use-flag";

/** While testing: on a share link the card comes every time, and Dismiss doesn't remember. Set false to make it once per person there too. */
export const ALWAYS_ON_SHARE_LINKS = false;

/**
 * Tells a person, once, that the canvas is new: a card that rises from the bottom left corner of the window a moment after the page is
 * there, with a picture of the canvas, and a way to go there or let it go. Either way it goes back down into the corner.
 * It is remembered per person (`proto.canvas-hint`), so it is never shown again once it has been answered.
 */
export function CanvasIntro({ onOpen, quiet, always = false }: { onOpen: () => void; /** The canvas is open already: nothing to announce. */ quiet: boolean; /** Shown every time, and never remembered as seen. */ always?: boolean }) {
  const [seen, markSeen] = useFlag("proto.canvas-hint");
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  // It belongs to the window, not to the page it was asked for in (which may be a tile that scrolls or moves): drawn on the body, once the browser is there.
  const browser = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!browser || (!leaving && (gone || (seen && !always) || quiet))) return null;

  const leave = (open: boolean) => {
    if (open) onOpen();
    // Remembered the moment it is answered, not once its exit has played: a page left, or reloaded, or an animation that never reports back
    // must not bring it round again.
    if (!always) markSeen();
    setLeaving(true);
  };

  return createPortal(
    <aside
      aria-label="Canvas mode"
      inert={leaving}
      onAnimationEnd={(event) => {
        if (!leaving || event.target !== event.currentTarget) return;
        setLeaving(false);
        // Said once per visit when it is always shown, so it does not come back at once.
        if (always) setGone(true);
      }}
      style={{ zIndex: "var(--z-popover)" }}
      className={`${leaving ? "intro-card-out" : "intro-card-in"} fixed bottom-8 left-8 origin-bottom-left flex w-80 flex-col gap-4 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-2 shadow-floating max-sm:hidden`}
    >
      {/* The picture bleeds off the bottom of its colour, as a window onto something bigger. */}
      <div style={{ background: "var(--intro-backdrop)" }} className="relative h-44 overflow-hidden rounded-[var(--r-control)]">
        <Image
          src="/canvas-intro.png"
          alt=""
          width={960}
          height={540}
          priority
          className="absolute left-10 top-8 w-[calc(100%-5rem)] max-w-none rounded-t-[var(--r-md)] shadow-floating"
        />
      </div>
      <div className="flex flex-col gap-1 px-2">
        <h2 className="text-base font-medium text-foreground">Introducing canvas mode</h2>
        <p className="text-sm text-foreground-muted">See every screen side by side, and edit them right where they stand.</p>
      </div>
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <IconButton variant="ghost" onClick={() => leave(false)}>
          Dismiss
        </IconButton>
        <IconButton variant="primary" onClick={() => leave(true)}>
          Go to canvas
        </IconButton>
      </div>
    </aside>,
    document.body,
  );
}
