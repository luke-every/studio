"use client";

import { AnimatePresence, motion as m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { HeartIcon } from "@/components/shell/nav-icons";
import type { Comment } from "@/lib/comments";
import { motionRegister, stagger } from "@/lib/motion";
import { useUser } from "@/lib/use-user";

/** The dots that burst off a like: a pair per spoke, in the studio's own colours. */
const DOTS = ["--avatar-bg-1", "--avatar-bg-2", "--avatar-bg-3", "--avatar-bg-4", "--avatar-bg-5", "--destructive", "--review"];
const SPOKES = DOTS.length;

/**
 * The count, as an odometer: only the digits that change turn, each a beat
 * after the one to its right. Liking rolls the new digit up from below,
 * unliking rolls it back down. Digits are keyed by their place, so one that
 * doesn't change is the same element and never moves.
 */
function Roll({ value, up }: { value: number; up: boolean }) {
  const reduced = useReducedMotion();
  const digits = String(value).split("");

  return (
    <span aria-hidden className="relative inline-flex overflow-hidden tabular-nums leading-[1.4]">
      {digits.map((digit, index) => {
        const place = digits.length - 1 - index;
        return (
          <span key={place} className="relative inline-flex">
            <AnimatePresence initial={false} mode="popLayout">
              <m.span
                key={digit}
                initial={{ y: up ? "100%" : "-100%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                exit={{ y: up ? "-100%" : "100%", opacity: 0 }}
                transition={reduced ? { duration: 0 } : { ...motionRegister.emphasis, delay: place * stagger.normal }}
              >
                {digit}
              </m.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A heart and a count under a comment. Who liked it is a list of names kept
 * on the comment, since nobody signs in; a guest has no name to like with.
 */
export function LikeButton({ comment, onLike }: { comment: Comment; onLike: (comment: Comment, liked: boolean) => void }) {
  const { name } = useUser();
  const liked = !!name && !!comment.likes?.includes(name);
  const count = comment.likes?.length ?? 0;
  // Counts presses that liked, so each one plays the burst afresh and a comment that loads already liked plays none.
  const [beat, setBeat] = useState(0);
  const [up, setUp] = useState(true);

  const press = () => {
    const next = !liked;
    setUp(next);
    if (next) setBeat((now) => now + 1);
    onLike(comment, next);
  };

  return (
    <button
      type="button"
      disabled={!name}
      title={name ? undefined : "Choose who you are to like a comment"}
      aria-pressed={liked}
      aria-label={`Like. ${count} ${count === 1 ? "like" : "likes"}`}
      onClick={(event) => {
        // Whatever holds the comment (a row that opens it) must not hear presses meant for the heart.
        event.stopPropagation();
        press();
      }}
      className={`-ml-1 inline-flex items-center gap-1.5 rounded-[var(--r-full)] px-1 py-0.5 text-xs transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] disabled:opacity-40 ${
        liked ? "text-like" : "text-foreground-subtle hover:text-foreground"
      }`}
    >
      <span className="like-heart">
        <span key={liked ? `on${beat}` : "off"} className="like-glyph" data-pop={(liked && beat > 0) || undefined}>
          <HeartIcon filled={liked} className="size-[var(--like-heart)]" />
        </span>
        {liked && beat > 0 ? (
          <span key={beat} aria-hidden className="like-burst">
            <span className="like-bloom" />
            {DOTS.map((_, spoke) => (
              <span key={spoke} className="like-spoke" style={{ "--a": `${(360 / SPOKES) * spoke - 90}deg` } as React.CSSProperties}>
                <i style={{ "--c": `var(${DOTS[spoke]})` } as React.CSSProperties} />
                <i style={{ "--c": `var(${DOTS[(spoke + 3) % SPOKES]})` } as React.CSSProperties} />
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {count > 0 ? <Roll value={count} up={up} /> : null}
    </button>
  );
}
