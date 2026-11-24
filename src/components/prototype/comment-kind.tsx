"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon } from "@/components/shell/nav-icons";
import { Chip, Dot, type Tone } from "@/components/ui/chip";
import { menuItem } from "@/components/ui/menu-item";
import { COMMENT_KINDS, KIND_LABEL, type CommentKind } from "@/lib/comments";

/** The colour that goes with each sort: nothing for plain feedback, then quiet to loud. */
export const KIND_TONE: Record<CommentKind, Tone> = { feedback: "quiet", thought: "existing", bug: "near", critical: "exception" };

/** A comment's sort as a tag, for where it is read. Plain feedback is what a comment is, so it gets none. */
export function KindChip({ kind }: { kind?: CommentKind }) {
  return kind && kind !== "feedback" ? <Chip tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Chip> : null;
}

/**
 * The sort of comment being written: a small tag in the composer's corner that opens a list of them. Feedback to begin with;
 * a passing thought for what isn't important but is worth saying, a bug, or something critical.
 */
export function KindPicker({ value, onChange }: { value: CommentKind; onChange: (kind: CommentKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      above
      align="start"
      className="w-44"
      trigger={
        <button
          type="button"
          aria-label="Type of comment"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((now) => !now)}
          className="inline-flex items-center gap-1 rounded-[var(--r-full)] py-0.5 pr-1.5 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <Chip tone={KIND_TONE[value]}>{KIND_LABEL[value]}</Chip>
          <ChevronDownIcon className="size-3 text-foreground-subtle" />
        </button>
      }
    >
      <div role="menu" className="flex flex-col">
        {COMMENT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="menuitemradio"
            aria-checked={kind === value}
            onClick={() => {
              onChange(kind);
              setOpen(false);
            }}
            className={`${menuItem} justify-between text-foreground`}
          >
            <span className="flex items-center gap-2.5">
              <Dot tone={KIND_TONE[kind]} />
              {KIND_LABEL[kind]}
            </span>
            {kind === value ? <CheckIcon className="size-4 text-foreground-muted" /> : null}
          </button>
        ))}
      </div>
    </MotionPopover>
  );
}
