"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { addressFor, anchorAt, bringIntoView, elementOf, nearestOf, ownedBy, pageKey, spotOf, type Found } from "@/lib/anchor";
import type { Anchor } from "@/lib/comments";

import { Card, CommentCard, Composer, DraftPin, Pin, PIN, type CommentsUi } from "./comment-parts";
import { usePinWatch } from "./use-pin-watch";

const NEAREST = "This screen looks different for you, so it is pinned to the nearest match.";
const LOOKING = "Finding where this was left…";
const MISSING = "Couldn't find where this was left. The prototype may have changed since.";

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
    onLocate,
    searching = false,
    onAdd,
    onReply,
    onResolve,
    onLike,
    onDelete,
    onCopy,
  } = ui;

  const [draft, setDraft] = useState<Anchor | null>(null);
  const [retry, setRetry] = useState({ text: "" });
  const [spots, setSpots] = useState<Record<string, Found>>({});
  // How going to the comment asked for ended, once it has: `missing` when nothing of it was on the screen it ended on.
  const [settled, setSettled] = useState<{ at: number; missing: boolean } | null>(null);
  // The ask the flow was searched for: it says it is still looking until it has settled, not only while the search runs.
  const [searched, setSearched] = useState<number | null>(null);
  if (searching && focus && searched !== focus.at) setSearched(focus.at);
  // Where the layer is in the window, so a card can be drawn outside the frame's clipping and still sit by its pin.
  const [origin, setOrigin] = useState({ left: 0, top: 0 });
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(comments);
  const locate = useRef(onLocate);
  useEffect(() => {
    latest.current = comments;
    locate.current = onLocate;
  });

  // Leaving comment mode drops a comment that was never posted.
  const stillPlacing = placing && draft;
  const shownDraft = stillPlacing ? draft : null;

  const focusId = focus?.id;
  const last = useRef("");
  const read = () => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const next: Record<string, Found> = {};
    const page = pageKey(doc);
    for (const comment of comments) {
      // The one asked for is shown at the nearest thing there when its own element isn't.
      const spot = spotOf(doc, comment.anchor, page, comment.id === focusId);
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
  usePinWatch(() => [frame.current], read, visible, [comments, shownDraft, focusId]);

  // Asked for a comment: put the prototype back where it was left (its page and its own address), go to its flow screen if
  // it is on another, bring it into view, and say how that ended. Run again when a search of the flow ends, and when the
  // comment arrives in the list (it is on another setup, which has just been put on screen).
  const known = !!focus && comments.some((item) => item.id === focus.id);
  useEffect(() => {
    if (!focus || searching) return;
    const comment = latest.current.find((item) => item.id === focus.id);
    const element = frame.current;
    const win = element?.contentWindow;
    if (!comment || !element || !win) return;

    let check = 0;
    const reveal = () => {
      const doc = element.contentDocument;
      if (!doc) return;
      const exact = elementOf(doc, comment.anchor);
      // Not on this screen at all: it is on another step, so ask for that one straight away rather than waiting to see.
      if (comment.anchor.selector && !exact && locate.current?.(comment)) return;
      // Looked for already and not found as it was: the nearest thing there.
      const target = exact ?? nearestOf(doc, comment.anchor)?.element;
      if (target) bringIntoView(doc, target, comment.anchor);
      else
        win.scrollTo(
          0,
          comment.anchor.fy * doc.documentElement.scrollHeight -
            win.innerHeight / 2,
        );
      // There, but not as it was (another step drawn the same way): once it has settled, ask for the screen that has it.
      check = window.setTimeout(() => {
        const now = element.contentDocument;
        if (!now) return;
        if (!spotOf(now, comment.anchor) && locate.current?.(comment)) return;
        // Missing is nothing of it there at all; one that is there but out of sight is only waiting to be scrolled back to.
        setSettled({ at: focus.at, missing: !!comment.anchor.selector && !nearestOf(now, comment.anchor) });
      }, 350);
    };

    // A frame that is still loading has no address to compare yet.
    // Ready once its markup is in, without waiting for its images: a frame that has only just been given its address is
    // still on a blank page, or still reading, and is looked at again in a moment.
    let wait = 0;
    const start = () => {
      if (
        win.location.href === "about:blank" ||
        element.contentDocument?.readyState === "loading"
      ) {
        wait = window.setTimeout(start, 30);
        return;
      }
      const to = addressFor(win.location, comment.anchor, ownedBy(element));
      if (!to) {
        reveal();
        return;
      }
      // Only the hash changing loads nothing; the prototype's own router takes it, and is given a moment.
      if (to.reload) element.addEventListener("load", reveal, { once: true });
      else wait = window.setTimeout(reveal, 100);
      win.location.assign(to.href);
    };

    start();
    return () => {
      window.clearTimeout(check);
      window.clearTimeout(wait);
      element.removeEventListener("load", reveal);
    };
  }, [focus, frame, searching, known]);

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
  // The comment asked for opens wherever it is, and says so when that isn't where it was left. Not found, or still being
  // looked for, it opens at the frame's corner; found but scrolled out of sight, it waits until it is back.
  const open = comments.find((item) => item.id === focus?.id);
  const openSpot = open ? spots[open.id] : undefined;
  const ended = settled && settled.at === focus?.at ? settled : null;
  const openAs = openSpot
    ? { at: windowAt(openSpot), note: openSpot.exact ? undefined : NEAREST }
    : ended?.missing || searching || (searched === focus?.at && !ended)
      ? { at: { left: origin.left, top: origin.top + PIN }, note: ended?.missing ? MISSING : LOOKING }
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
