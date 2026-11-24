"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";

import { MotionModal, MotionPopover } from "@/components/motion";
import { PlusIcon, ReviewIcon } from "@/components/shell/nav-icons";
import { UserAvatar } from "@/components/shell/user-avatar";
import { IconButton } from "@/components/ui/button";
import type { Prototype } from "@/lib/registry/types";
import { dueLabel, pastDue, type Review } from "@/lib/reviews";

import { RequestReviewDialog } from "./request-review-dialog";
import { ReviewCards, useReviews } from "./review-list";
import { ReviewState } from "./review-state";
import { useReviewChoices } from "./use-review-choices";

/** How many requests the menu lists before the rest are behind See all. */
const SHOWN = 5;

const rowClass = "flex w-full items-center gap-2.5 rounded-[var(--r-control)] px-2.5 py-1.5 text-left text-nav text-foreground hover:bg-menu-hover";

/**
 * The review control beside Share. On hover (a tap on a touch screen) it lists the latest requests for this prototype, each with how
 * many are in and where each person is, then asks for a new one. Past five, the rest are behind See all, which opens them in full.
 */
export function ReviewMenu({ prototype, version }: { prototype: Prototype; version: string }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"request" | "all" | null>(null);
  const { reviews } = useReviews(prototype.slug, { active: open });
  // What the version offers to look at is read now, so the request dialog opens straight onto the right step instead of working it out in front of you.
  const pushed = prototype.versions.filter((one) => !one.live && !one.blank);
  useReviewChoices((pushed.find((one) => one.version === version) ?? pushed[0])?.url, prototype.name);
  const [wasOpen, setWasOpen] = useState(false);
  if (open) !wasOpen && setWasOpen(true);

  const choose = (next: "request" | "all") => {
    setOpen(false);
    setDialog(next);
  };

  return (
    <>
      <MotionPopover
        open={open}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        className="max-h-[min(32rem,70dvh)] w-80 overflow-y-auto"
        trigger={
          <IconButton label="Reviews" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((now) => !now)}>
            <ReviewIcon />
          </IconButton>
        }
      >
        <div role="menu" className="flex flex-col">
          {reviews === null ? (
            wasOpen ? <p className="px-2.5 py-1.5 text-sm text-foreground-muted">Loading</p> : null
          ) : (
            <>
              {reviews.slice(0, SHOWN).map((review, index) => {
                const done = review.reviewers.filter((one) => one.doneAt).length;
                const overdue = !!review.due && pastDue(review.due, review.dueBy) && done < review.reviewers.length;
                return (
                  <div key={review.id} role="group" aria-label={review.version}>
                    {index ? <div role="separator" className="my-1 h-px bg-border" /> : null}
                    <Link role="menuitem" href={`/prototypes/${prototype.slug}?${new URLSearchParams({ v: review.version, comments: "1" })}`} onClick={() => setOpen(false)} className={`${rowClass} !flex-col !items-stretch !gap-1`}>
                      {/* Who first, each with where they have got to; the version and its count are the quiet line over them. */}
                      <span className="flex items-center justify-between gap-3 text-sm text-foreground-muted">
                        <span>
                          {review.version} · {done} of {review.reviewers.length} in
                        </span>
                        {review.due ? <span className={overdue ? "text-tone-exception" : ""}>{overdue ? "Overdue · " : ""}{dueLabel(review.due, review.dueBy)}</span> : null}
                      </span>
                      {review.reviewers.map((person) => (
                        <span key={person.name} className="flex items-center justify-between gap-3 py-0.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <UserAvatar name={person.name} className="size-6" />
                            <span className="truncate">{person.name}</span>
                          </span>
                          <ReviewState person={person} />
                        </span>
                      ))}
                    </Link>
                  </div>
                );
              })}
              {reviews.length > SHOWN ? (
                <button type="button" role="menuitem" aria-haspopup="dialog" onClick={() => choose("all")} className={`${rowClass} text-foreground-muted`}>
                  See all {reviews.length}
                </button>
              ) : null}
              {reviews.length ? <div role="separator" className="my-1 h-px bg-border" /> : null}
            </>
          )}
          <button type="button" role="menuitem" aria-haspopup="dialog" onClick={() => choose("request")} className={`${rowClass} font-medium`}>
            <PlusIcon />
            Request review
          </button>
        </div>
      </MotionPopover>

      {/* Drawn on the body: inside the bar they would sit in the frame's own stacking, under its resize handle. */}
      {dialog === "request" ? createPortal(<RequestReviewDialog prototype={prototype} version={version} onClose={() => setDialog(null)} />, document.body) : null}
      {dialog === "all" ? createPortal(<AllReviews slug={prototype.slug} onClose={() => setDialog(null)} />, document.body) : null}
    </>
  );
}

/** Every request, in full, in a dialog. */
function AllReviews({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { reviews, left, problem } = useReviews(slug, { comments: true });
  return (
    <MotionModal open onClose={onClose} label="Reviews">
      <div className="flex flex-col gap-5">
        <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">Reviews</h2>
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : reviews === null ? (
          <p className="text-sm text-foreground-muted">Loading</p>
        ) : (
          <ReviewCards slug={slug} reviews={reviews} left={left} />
        )}
      </div>
    </MotionModal>
  );
}
