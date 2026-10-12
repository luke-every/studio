"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { Anchor } from "@/lib/comments";

import { anchorAt, Card, CommentCard, Composer, DraftPin, elementOf, pageKey, Pin, spotOf, type CommentsUi, type Spot } from "./comment-parts";

/**
 * Comments over a prototype: the pins, the card for the one that is open, and
 * while placing, a sheet of glass that takes the click and turns it into an
 * anchor. It is the studio's own layer above the frame, never inside the
 * prototype's document, so the prototype itself is not touched.
 *
 * Pin positions are read from the prototype every frame while any are on
 * screen, so they follow it as it scrolls, resizes or moves things about; a
 * state is only set when somebody's pin actually moved.
 */
export function CommentLayer({ frame, scale, comments: ui }: { frame: RefObject<HTMLIFrameElement | null>; scale: number; comments: CommentsUi }) {
  const { list: comments, replies, visible, placing, focus, onFocus, onAdd, onReply, onResolve } = ui;

  const [draft, setDraft] = useState<Anchor | null>(null);
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  // Where the layer is in the window, so a card can be drawn outside the frame's clipping and still sit by its pin.
  const [origin, setOrigin] = useState({ left: 0, top: 0 });
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(comments);
  useEffect(() => {
    latest.current = comments;
  });

  // Leaving comment mode drops a comment that was never posted.
  const stillPlacing = placing && draft;
  const shownDraft = stillPlacing ? draft : null;

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = "";
    const tick = () => {
      const doc = frame.current?.contentDocument;
      if (doc?.body) {
        const next: Record<string, Spot> = {};
        const page = pageKey(doc);
        for (const comment of comments) {
          const spot = spotOf(doc, comment.anchor, page);
          if (spot) next[comment.id] = spot;
        }
        const draftSpot = shownDraft ? spotOf(doc, shownDraft, page) : null;
        if (draftSpot) next.draft = draftSpot;
        const box = root.current?.getBoundingClientRect();
        const moved = { left: box?.left ?? 0, top: box?.top ?? 0 };
        const signature = JSON.stringify([next, moved]);
        if (signature !== last) {
          last = signature;
          setSpots(next);
          setOrigin(moved);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [visible, comments, shownDraft, frame]);

  // Asked for a comment: go to its screen if it is on another, and bring it into view.
  useEffect(() => {
    if (!focus) return;
    const comment = latest.current.find((item) => item.id === focus.id);
    const element = frame.current;
    const win = element?.contentWindow;
    if (!comment || !element || !win) return;

    const reveal = () => {
      const doc = element.contentDocument;
      if (!doc) return;
      const target = elementOf(doc, comment.anchor);
      if (target) target.scrollIntoView({ block: "nearest", inline: "nearest" });
      else if (!comment.anchor.selector) win.scrollTo(0, comment.anchor.fy * doc.documentElement.scrollHeight - win.innerHeight / 2);
    };

    if (win.location.pathname === comment.anchor.screen) {
      reveal();
      return;
    }
    element.addEventListener("load", reveal, { once: true });
    win.location.assign(comment.anchor.screen);
    return () => element.removeEventListener("load", reveal);
  }, [focus, frame]);

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const box = event.currentTarget.getBoundingClientRect();
    onFocus(null);
    setDraft(anchorAt(doc, (event.clientX - box.left) / scale, (event.clientY - box.top) / scale));
  };

  const open = comments.find((item) => item.id === focus?.id);
  const windowAt = (spot: Spot) => ({ left: origin.left + spot.x * scale, top: origin.top + spot.y * scale });

  return (
    <div ref={root} className="pointer-events-none absolute inset-0" style={{ zIndex: "var(--z-raised)" }}>
      {placing ? <div onClick={place} className="pointer-events-auto absolute inset-0 cursor-crosshair" /> : null}

      {visible
        ? comments.map((comment) => {
            const spot = spots[comment.id];
            if (!spot) return null;
            return (
              <Pin
                key={comment.id}
                comment={comment}
                left={spot.x * scale}
                top={spot.y * scale}
                selected={focus?.id === comment.id}
                onClick={() => onFocus(focus?.id === comment.id ? null : comment.id)}
              />
            );
          })
        : null}

      {visible && open && spots[open.id] ? (
        <CommentCard comment={open} replies={replies[open.id] ?? []} at={windowAt(spots[open.id])} onClose={() => onFocus(null)} onReply={onReply} onResolve={onResolve} />
      ) : null}

      {shownDraft && spots.draft ? (
        <>
          <DraftPin left={spots.draft.x * scale} top={spots.draft.y * scale} />
          <Card at={windowAt(spots.draft)}>
            <Composer
              key={`${shownDraft.selector}${shownDraft.fx}${shownDraft.fy}`}
              onCancel={() => setDraft(null)}
              onPost={async (text) => {
                if (await onAdd(text, shownDraft)) setDraft(null);
              }}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
