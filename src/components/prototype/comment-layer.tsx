"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { addressFor, anchorAt, bringIntoView, elementOf, ownedBy, pageKey, spotOf, type Spot } from "@/lib/anchor";
import type { Anchor } from "@/lib/comments";

import { Card, CommentCard, Composer, DraftPin, Pin, PIN, type CommentsUi } from "./comment-parts";
import { usePinWatch } from "./use-pin-watch";

const MISSING = "This looks different for you, so it can't be pinned where it was left.";
/** How long a comment's element is waited for once its setup is on screen: the prototype may still be moving there. */
const WAIT_FOR = 2000;

/**
 * Comments over a prototype: the pins, the card for the one that is open, and
 * while placing, a sheet of glass that takes the click and turns it into an
 * anchor. It is the studio's own layer above the frame, never inside the
 * prototype's document, so the prototype itself is not touched.
 *
 * Pin positions are read from the prototype whenever something could have
 * moved them (`usePinWatch`), so they follow it as it scrolls, resizes or
 * moves things about; a state is only set when somebody's pin actually moved.
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
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
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
    const win = element?.contentWindow;
    if (!comment || !element || !win) return;

    let timer = 0;
    let since = 0;
    const reveal = () => {
      const doc = element.contentDocument;
      if (!doc) return;
      since ||= Date.now();
      if (!comment.anchor.selector) {
        win.scrollTo(0, comment.anchor.fy * doc.documentElement.scrollHeight - win.innerHeight / 2);
        return;
      }
      const target = elementOf(doc, comment.anchor);
      if (target) {
        bringIntoView(doc, target, comment.anchor);
        return;
      }
      if (Date.now() - since < WAIT_FOR) timer = window.setTimeout(reveal, 100);
      else setMissing(focus.at);
    };

    // A frame that is still loading has no address to compare yet.
    // Ready once its markup is in, without waiting for its images: a frame that has only just been given its address is
    // still on a blank page, or still reading, and is looked at again in a moment.
    const start = () => {
      if (
        win.location.href === "about:blank" ||
        element.contentDocument?.readyState === "loading"
      ) {
        timer = window.setTimeout(start, 30);
        return;
      }
      const to = addressFor(win.location, comment.anchor, ownedBy(element));
      if (!to) {
        reveal();
        return;
      }
      // Only the hash changing loads nothing; the prototype's own router takes it, and is given a moment.
      if (to.reload) element.addEventListener("load", reveal, { once: true });
      else timer = window.setTimeout(reveal, 100);
      win.location.assign(to.href);
    };

    start();
    return () => {
      window.clearTimeout(timer);
      element.removeEventListener("load", reveal);
    };
  }, [focus, frame, known]);

  // The glass takes clicks, not scrolling: a wheel over it scrolls whatever in the prototype is under the pointer and can
  // still move that way, else the page, by the distance it moved on screen.
  const scroll = (event: WheelEvent) => {
    // The browser would scroll the page the glass is in as well, so it is told not to; this does the scrolling.
    event.preventDefault();
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow;
    if (!doc || !win) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = event.deltaX / scale;
    const dy = event.deltaY / scale;
    let element: Element | null = doc.elementFromPoint(
      (event.clientX - box.left) / scale,
      (event.clientY - box.top) / scale,
    );
    for (
      ;
      element && element !== doc.documentElement && element !== doc.body;
      element = element.parentElement
    ) {
      const style = win.getComputedStyle(element);
      const canY =
        /auto|scroll|overlay/.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight;
      const canX =
        /auto|scroll|overlay/.test(style.overflowX) &&
        element.scrollWidth > element.clientWidth;
      const roomY =
        dy < 0
          ? element.scrollTop > 0
          : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      const roomX =
        dx < 0
          ? element.scrollLeft > 0
          : element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      if ((canY && dy && roomY) || (canX && dx && roomX)) {
        element.scrollBy(dx, dy);
        return;
      }
    }
    win.scrollBy(dx, dy);
  };

  // Listened to by hand: React's wheel handlers are passive, which can't stop the page scrolling too.
  const glass = useRef<HTMLDivElement>(null);
  const scrolling = useRef(scroll);
  useEffect(() => {
    scrolling.current = scroll;
  });
  useEffect(() => {
    const element = glass.current;
    if (!placing || !element) return undefined;
    const onWheel = (event: WheelEvent) => scrolling.current(event);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [placing]);

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const box = event.currentTarget.getBoundingClientRect();
    onFocus(null);
    setDraft(
      anchorAt(
        doc,
        (event.clientX - box.left) / scale,
        (event.clientY - box.top) / scale,
        ownedBy(frame.current!),
      ),
    );
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
          onClick={place}
          ref={glass}
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
        />
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
