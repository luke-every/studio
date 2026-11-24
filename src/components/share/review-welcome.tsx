"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { MotionModal } from "@/components/motion";
import { ReviewIcon } from "@/components/shell/nav-icons";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { dueLabel, type ReviewRequest } from "@/lib/reviews";

/**
 * The first thing somebody sees on a review: who is asking, and by when, said the way a person would. It is let go of with Continue (or by
 * leaving it), and what comes next is the page's: a tip beside the prototype on a computer, how to press and hold on a phone.
 */
export function ReviewWelcome({ open, request, onContinue }: { open: boolean; request: ReviewRequest; onContinue: () => void }) {
  return (
    <MotionModal open={open} onClose={onContinue} label="Welcome to review mode">
      <div className="flex flex-col items-center gap-6 pt-2 text-center">
        <span aria-hidden className="grid size-20 place-items-center rounded-[var(--r-tile)] bg-surface-inset text-foreground">
          <ReviewIcon className="size-10" />
        </span>
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl font-medium tracking-[var(--tracking-tight)]">Welcome to review mode</h2>
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-base text-foreground-muted">
            <UserAvatar name={request.by} className="size-5" />
            <span>
              {request.by} has requested your feedback
              {request.due ? ` by ${dueLabel(request.due, request.dueBy)}` : ""}.
            </span>
          </p>
        </div>
        <Button variant="primary" className="w-full" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </MotionModal>
  );
}

const key = "inline-flex min-w-7 items-center justify-center rounded-[var(--r-xs)] border border-border bg-surface-inset px-1.5 py-0.5 text-xs font-medium text-foreground";

/**
 * A small note that comes out of the left side of the prototype, once the welcome has gone: how to leave feedback with the keyboard. It is
 * the prototype's neighbour, not a lid on it, and is gone for good with Got it, or as soon as they start commenting.
 */
export function ReviewTip({ open, anchor, onClose }: { open: boolean; /** The prototype's tile: the tip comes out of its left side, halfway down. */ anchor: RefObject<HTMLElement | null>; onClose: () => void }) {
  const [mounted, setMounted] = useState(open);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // Kept on screen while it slides back.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return undefined;
    const place = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (box) setAt({ left: box.left + 16, top: box.top + box.height / 2 });
    };
    // Asked after the first frame, and again whenever the window changes shape.
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
    };
  }, [mounted, anchor]);

  if (!mounted || !at) return null;

  return createPortal(
    <aside
      role="note"
      aria-label="How to leave feedback"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !open) setMounted(false);
      }}
      style={{ left: at.left, top: at.top, zIndex: "var(--z-popover)" }}
      className={`${open ? "tip-in" : "tip-out pointer-events-none"} fixed w-64 origin-left -translate-y-1/2 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-4 shadow-floating`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium">Leave your feedback</p>
          <p className="flex items-center gap-2 text-sm text-foreground-muted">
            <kbd className={key}>C</kbd>
            then click anywhere on the prototype
          </p>
          <p className="flex items-center gap-2 text-sm text-foreground-muted">
            <kbd className={key}>Esc</kbd>
            when you&rsquo;re done commenting
          </p>
        </div>
        <Button className="w-full" onClick={onClose}>
          Got it
        </Button>
      </div>
    </aside>,
    document.body,
  );
}
