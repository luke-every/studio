"use client";

import { useState } from "react";

import { CommentIcon, SlidersIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/dialog-form";
import { menuItem } from "@/components/ui/menu-item";

import { AboutSheet } from "./about-sheet";

/** About how big the menu is, for putting it by the finger without measuring it. */
const MENU_WIDTH = 176;
const MENU_HEIGHT = 96;
const EDGE = 12;

/**
 * What a press and hold on a phone offers: Comment, or Controls. Drawn here, in the page around the prototype, at the finger (`at`, in the
 * screen's own pixels): the prototype's page is as tall as the prototype, so anything it drew would sit by its own idea of "the screen".
 * Above the finger where there is room, else below it, and kept inside the screen. Tapping anywhere else lets it go.
 */
export function HoldMenu({ at, onComment, onControls, onClose }: { at: { x: number; y: number }; onComment: () => void; onControls: () => void; onClose: () => void }) {
  const left = Math.min(Math.max(EDGE, at.x - MENU_WIDTH / 2), window.innerWidth - MENU_WIDTH - EDGE);
  const above = at.y - MENU_HEIGHT - 20;
  const top = above >= EDGE ? above : Math.min(at.y + 28, window.innerHeight - MENU_HEIGHT - EDGE);

  return (
    <div className="fixed inset-0" style={{ zIndex: "var(--z-popover)" }}>
      <div aria-hidden className="absolute inset-0" onPointerDown={onClose} />
      <div role="menu" style={{ left, top, width: MENU_WIDTH }} className="absolute flex flex-col rounded-[var(--r-popover)] border border-border bg-surface-elevated p-1.5 shadow-floating">
        <button type="button" role="menuitem" onClick={onComment} className={`${menuItem} h-11 text-foreground`}>
          <CommentIcon />
          Comment
        </button>
        <button type="button" role="menuitem" onClick={onControls} className={`${menuItem} h-11 text-foreground`}>
          <SlidersIcon />
          Controls
        </button>
      </div>
    </div>
  );
}

/**
 * The comment box, a sheet at the bottom of the screen like the rest: it is the page's own, so the keyboard and the browser's bars are
 * the browser's to deal with, not something measured and followed. It is opened by the tap that chose Comment, which is what lets the
 * keyboard come up with it. Stays open, with what was written, if it didn't save.
 */
export function PhoneComposer({ open, author, onPost, onCancel }: { open: boolean; author: string; onPost: (text: string) => Promise<string | null>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const post = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setProblem(null);
    const found = await onPost(text);
    setBusy(false);
    if (found) return setProblem(found);
    setText("");
  };

  return (
    <AboutSheet open={open} onClose={onCancel} label="Leave a comment" focus="textarea" lockScroll={false}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void post();
        }}
        className="flex flex-col gap-4"
      >
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} maxLength={2000} autoFocus placeholder="Leave a comment" aria-label="Comment" className={`${fieldClass} resize-none font-normal`} />
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!text.trim()} loading={busy}>
            Post
          </Button>
        </div>
        <p className="text-sm text-foreground-muted">Commenting as {author}</p>
      </form>
    </AboutSheet>
  );
}
