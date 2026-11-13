"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { Spot } from "@/lib/anchor";
import type { Anchor } from "@/lib/comments";

import { Card, CommentCard, Composer, DraftPin, Pin, PIN, PinTarget, type CommentsUi } from "./comment-parts";
import { pageOf } from "./frame-page";
import { useGlass } from "./use-glass";
import { usePinWatch } from "./use-pin-watch";

const MISSING = "This looks different for you, so it can't be pinned where it was left.";

/**
 * Comments over a prototype: the pins, the card for the one that is open, and
 * while placing, a sheet of glass that takes the click and turns it into an
 * anchor. It is the studio's own layer above the frame, never inside the
 * prototype's document, so the prototype itself is not touched.
 *
 * Pin positions are read from the prototype whenever something could have
 * moved them (`usePinWatch`), so they follow it as it scrolls, resizes or
 * moves things about; a state is only set when somebody's pin actually moved.
 * The prototype is read through `pageOf`, so a live version on its own dev
 * server works the same as one the studio serves.
 */
export function CommentLayer({
  frame,
  scale,
  comments: ui,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  scale: number;
  comments: CommentsUi;
}) {
  const {
    list: comments,
    replies,
    visible,
    placing,
    focus,
    onFocus,
    onAdd,
    onReply,
    onResolve,
    onLike,
    onDelete,
    onCopy,
    onUndo,
  } = ui;

  const [draft, setDraft] = useState<Anchor | null>(null);
  const [retry, setRetry] = useState({ text: "" });
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  // The ask whose element never turned up on the screen it ended on.
  const [missing, setMissing] = useState<number | null>(null);
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

  const last = useRef("");
  const read = () => {
    const element = frame.current;
    if (!element) return;
    const anchors: Record<string, Anchor> = Object.fromEntries(comments.map((comment) => [comment.id, comment.anchor]));
    if (shownDraft) anchors.draft = shownDraft;
    const next = pageOf(element).spots(anchors);
    if (!next) return;
    const box = root.current?.getBoundingClientRect();
    const moved = { left: box?.left ?? 0, top: box?.top ?? 0 };
    const signature = JSON.stringify([next, moved]);
    if (signature !== last.current) {
      last.current = signature;
      setSpots(next);
      setOrigin(moved);
    }
  };
  usePinWatch(() => [frame.current], read, visible, [comments, shownDraft]);

  // Asked for a comment: put the prototype back where it was left (its page and its own address), bring it into view, and
  // say so if it isn't there. Run again when the comment arrives in the list (it is on another setup, which has just been
  // put on screen), since the prototype may still be getting there.
  const known = !!focus && comments.some((item) => item.id === focus.id);
  useEffect(() => {
    if (!focus) return;
    const comment = latest.current.find((item) => item.id === focus.id);
    const element = frame.current;
    if (!comment || !element) return;
    // If it never can be pinned, the card says so rather than nothing showing at all.
    return pageOf(element).reveal(comment.anchor, (found) => {
      if (!found) setMissing(focus.at);
    });
  }, [focus, frame, known]);

  // While placing, the element a click would pin to is outlined under the pointer, and a wheel over the glass scrolls the prototype.
  const { target, point, glass } = useGlass(frame, scale, placing);

  const place = async (event: React.MouseEvent<HTMLDivElement>) => {
    const element = frame.current;
    if (!element) return;
    const box = event.currentTarget.getBoundingClientRect();
    const anchor = await pageOf(element).anchorAt((event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
    if (!anchor) return;
    onFocus(null);
    setDraft(anchor);
  };

  const windowAt = (spot: { x: number; y: number }) => ({
    left: origin.left + spot.x * scale,
    top: origin.top + spot.y * scale,
  });
  // The comment asked for opens by its pin. Its element not there, it opens at the frame's corner and says so; found but
  // scrolled out of sight, it waits until it is back.
  const open = comments.find((item) => item.id === focus?.id);
  const openSpot = open ? spots[open.id] : undefined;
  const openAs = openSpot
    ? { at: windowAt(openSpot), note: undefined }
    : missing !== null && missing === focus?.at
      ? { at: { left: origin.left, top: origin.top + PIN }, note: MISSING }
      : null;

  return (
    <div
      ref={root}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: "var(--z-raised)" }}
    >
      {placing ? (
        <div
          onClick={(event) => void place(event)}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            point(event.clientX - box.left, event.clientY - box.top);
          }}
          onPointerLeave={() => point(null)}
          ref={glass}
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
        />
      ) : null}

      {/* Not while a comment is being written: its pin marks the spot then. */}
      {placing && target && !shownDraft ? (
        <PinTarget left={target.left * scale} top={target.top * scale} width={target.width * scale} height={target.height * scale} />
      ) : null}

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
                onClick={() =>
                  onFocus(focus?.id === comment.id ? null : comment.id)
                }
              />
            );
          })
        : null}

      {visible && open && openAs ? (
        <CommentCard
          comment={open}
          replies={replies[open.id] ?? []}
          at={openAs.at}
          note={openAs.note}
          onClose={() => onFocus(null)}
          onReply={onReply}
          onResolve={(comment, resolved) => {
            // Resolving closes it at once.
            if (resolved) onFocus(null);
            onResolve(comment, resolved);
          }}
          onLike={onLike}
          onDelete={onDelete}
          onCopy={onCopy}
          onUndo={onUndo}
        />
      ) : null}

      {shownDraft && spots.draft ? (
        <>
          <DraftPin left={spots.draft.x * scale} top={spots.draft.y * scale} />
          <Card at={windowAt(spots.draft)}>
            <Composer
              key={`${shownDraft.selector}${shownDraft.fx}${shownDraft.fy}`}
              onCancel={() => {
                setDraft(null);
                setRetry({ text: "" });
              }}
              initialText={retry.text}
              onPost={(text) => {
                // Closed at once; the comment is on the page, breathing, until it is saved. If it isn't, what was written comes back.
                const anchor = shownDraft;
                setDraft(null);
                setRetry({ text: "" });
                void onAdd(text, anchor).then((saved) => {
                  if (saved) return;
                  setRetry({ text });
                  setDraft(anchor);
                });
              }}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
