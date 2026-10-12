"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CheckIcon, ReplyIcon } from "@/components/shell/nav-icons";
import { UserAvatar } from "@/components/shell/user-avatar";
import { IconButton } from "@/components/ui/button";
import { Stamp } from "@/components/ui/stamp";
import type { Anchor, Comment } from "@/lib/comments";
import { selectorFor } from "@/lib/edit-dom";

/** The pieces of commenting that the prototype frame and the flow canvas share. */

export type Spot = { x: number; y: number };

/** What a surface needs to show, add and answer comments. */
export type CommentsUi = {
  list: Comment[];
  /** Whether pins are drawn. */
  visible: boolean;
  /** Whether the next click leaves a comment. */
  placing: boolean;
  /** The comment that is open, and a count that goes up each time it is asked for, so asking again goes to it again. */
  focus: { id: string; at: number } | null;
  onFocus: (id: string | null) => void;
  /** What has been said back to each comment, oldest first. */
  replies: Record<string, Comment[]>;
  onAdd: (text: string, anchor: Anchor) => Promise<boolean>;
  onReply: (parent: Comment, text: string) => Promise<boolean>;
  onResolve: (comment: Comment, resolved: boolean) => void;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const snippet = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * What a page is saying, in a few words: the start of its visible text, with
 * numbers and punctuation left out so a counter or a clock doesn't change it.
 * Steps of a flow share one address and often one layout, so this is what
 * tells them apart.
 */
export function pageKey(doc: Document) {
  return (doc.body?.innerText ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim().slice(0, 40);
}

/** The element an anchor was made on, if it is on screen now: there, showing, and still saying what it said. */
export function elementOf(doc: Document, anchor: Anchor): Element | null {
  if (!anchor.selector) return null;
  let element: Element | null = null;
  try {
    element = doc.querySelector(anchor.selector);
  } catch {
    // A selector that no longer parses is an element that is gone.
  }
  if (!element) return null;
  if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  if (anchor.text && snippet(element) !== anchor.text) return null;
  return element;
}

/**
 * Where an anchor is in a document, in its own pixels, or null when it isn't
 * on this screen right now. A prototype can swap one step for another without
 * changing page, or draw a step over the one before, so a comment shows only
 * where its element is there, uncovered, and the page reads as it did.
 */
export function spotOf(doc: Document, anchor: Anchor, page = pageKey(doc)): Spot | null {
  if (anchor.screen !== doc.location.pathname) return null;
  if (anchor.page && anchor.page !== page) return null;
  if (!anchor.selector) {
    const root = doc.documentElement;
    const win = doc.defaultView!;
    return { x: anchor.fx * root.scrollWidth - win.scrollX, y: anchor.fy * root.scrollHeight - win.scrollY };
  }
  const element = elementOf(doc, anchor);
  const rect = element?.getBoundingClientRect();
  if (!element || !rect || !(rect.width || rect.height)) return null;
  const spot = { x: rect.left + anchor.x * rect.width, y: rect.top + anchor.y * rect.height };
  // It has to be what you would see there: a step drawn over the top of it, or the page scrolled past it, hides the pin.
  const hit = doc.elementFromPoint(spot.x, spot.y);
  if (!hit || !(element.contains(hit) || hit.contains(element))) return null;
  return spot;
}

/** The anchor for a click at (x, y) in a document's own pixels. */
export function anchorAt(doc: Document, x: number, y: number): Anchor {
  const win = doc.defaultView!;
  const root = doc.documentElement;
  const hit = doc.elementFromPoint(x, y);
  const element = hit && hit !== doc.body && hit !== root ? hit : null;
  const rect = element?.getBoundingClientRect();
  return {
    screen: doc.location.pathname,
    page: pageKey(doc),
    selector: element ? selectorFor(element) : null,
    text: element ? snippet(element) : undefined,
    x: rect && rect.width ? clamp((x - rect.left) / rect.width) : 0,
    y: rect && rect.height ? clamp((y - rect.top) / rect.height) : 0,
    fx: clamp((x + win.scrollX) / Math.max(1, root.scrollWidth)),
    fy: clamp((y + win.scrollY) / Math.max(1, root.scrollHeight)),
  };
}

/** A pin, its corner at (left, top) in whatever it is placed in. */
export function Pin({
  comment,
  left,
  top,
  selected,
  onClick,
}: {
  comment: Comment;
  left: number;
  top: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Comment ${comment.n} by ${comment.author.name}`}
      onClick={onClick}
      style={{ left, top }}
      className={`pointer-events-auto absolute grid size-6 -translate-y-full place-items-center rounded-full rounded-bl-none text-xs font-medium ${
        comment.resolvedAt ? "border border-border bg-surface text-foreground-muted" : "bg-accent text-accent-foreground"
      } ${selected ? "ring-2 ring-[var(--focus-ring)]" : ""}`}
    >
      {comment.n}
    </button>
  );
}

/** The pin of a comment that hasn't been posted yet. */
export function DraftPin({ left, top }: { left: number; top: number }) {
  return <span style={{ left, top }} className="absolute size-6 -translate-y-full rounded-full rounded-bl-none bg-accent" />;
}

/**
 * Beside a pin, on whichever side has room. It is drawn on the page, at a
 * position in the window, rather than inside whatever holds the pin, which
 * would clip it at its edge.
 */
export function Card({ at, children }: { at: { left: number; top: number }; children: ReactNode }) {
  const flipX = at.left > window.innerWidth / 2;
  // Below the pin, unless that would run off the bottom of the window.
  const flipY = at.top > window.innerHeight - 220;
  return createPortal(
    <div
      style={{ left: at.left, top: flipY ? at.top - 32 : at.top + 8, zIndex: "var(--z-popover)" }}
      className={`fixed flex w-64 flex-col gap-2 rounded-[var(--r-control)] border border-border bg-surface p-3 shadow-floating ${flipX ? "-translate-x-full" : ""} ${
        flipY ? "-translate-y-full" : ""
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Resolving, as a small tick that sits beside the time. Filled once it is done. */
export function ResolveToggle({ resolved, onToggle }: { resolved: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={resolved ? "Reopen" : "Resolve"}
      title={resolved ? "Reopen" : "Resolve"}
      aria-pressed={resolved}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`grid size-5 shrink-0 place-items-center rounded-[var(--r-full)] transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
        resolved ? "bg-accent text-accent-foreground" : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <CheckIcon className="size-3.5" />
    </button>
  );
}

/**
 * What has been said back to a comment, and the button to say something more.
 * `extra` sits in the same row, before it.
 */
export function Replies({
  replies,
  onReply,
  extra,
  align = "start",
}: {
  replies: Comment[];
  onReply: (text: string) => Promise<boolean>;
  extra?: ReactNode;
  align?: "start" | "end";
}) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    const posted = await onReply(text);
    setPosting(false);
    if (posted) {
      setText("");
      setWriting(false);
    }
  };

  return (
    // Clicking in here is for replying, not for choosing the comment it sits under.
    <div onClick={(event) => event.stopPropagation()} className="flex flex-col gap-2">
      {replies.map((reply) => (
        <div key={reply.id} className="flex flex-col gap-0.5 border-l border-divider pl-3">
          <p className="flex items-center gap-1.5 text-xs text-foreground-subtle">
            <UserAvatar name={reply.author.name} className="size-4" />
            {reply.author.name} · <Stamp iso={reply.at} relative />
          </p>
          <p className="whitespace-pre-wrap text-sm leading-[var(--leading-relaxed)] text-foreground-muted">{reply.text}</p>
        </div>
      ))}
      {writing ? (
        <textarea
          autoFocus
          value={text}
          disabled={posting}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // The studio's shortcuts stay out of it while somebody is typing.
            event.stopPropagation();
            if (event.key === "Escape") setWriting(false);
            else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void post();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Reply"
          aria-label="Reply"
          className="w-full resize-none rounded-[var(--r-md)] bg-surface-inset p-2 text-sm text-foreground outline-none placeholder:text-foreground-subtle focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        />
      ) : null}
      <div className={`flex gap-2 empty:hidden ${align === "end" ? "justify-end" : ""}`}>
        {extra}
        {writing ? null : (
          <IconButton onClick={() => setWriting(true)}>
            <ReplyIcon />
            Reply
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** An open comment: who, when, what, the replies, and a way to close or resolve it. */
export function CommentCard({
  comment,
  replies,
  at,
  onClose,
  onReply,
  onResolve,
}: {
  comment: Comment;
  replies: Comment[];
  at: { left: number; top: number };
  onClose: () => void;
  onReply: (parent: Comment, text: string) => Promise<boolean>;
  onResolve: (comment: Comment, resolved: boolean) => void;
}) {
  return (
    <Card at={at}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <UserAvatar name={comment.author.name} className="size-5" />
          <span className="truncate">{comment.author.name}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-foreground-subtle">
          <ResolveToggle resolved={!!comment.resolvedAt} onToggle={() => onResolve(comment, !comment.resolvedAt)} />
          <Stamp iso={comment.at} relative />
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-[var(--leading-relaxed)] text-foreground-muted">{comment.text}</p>
      <Replies replies={replies} onReply={(text) => onReply(comment, text)} align="end" extra={<IconButton onClick={onClose}>Close</IconButton>} />
    </Card>
  );
}

export function Composer({ onPost, onCancel }: { onPost: (text: string) => Promise<void>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    await onPost(text);
    setPosting(false);
  };

  return (
    <>
      <textarea
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // The prototype and the studio's own shortcuts stay out of it while somebody is typing.
          event.stopPropagation();
          if (event.key === "Escape") onCancel();
          else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void post();
          }
        }}
        rows={3}
        maxLength={2000}
        placeholder="Add a comment"
        aria-label="Comment"
        className="w-full resize-none rounded-[var(--r-md)] bg-surface-inset p-2 text-sm text-foreground outline-none placeholder:text-foreground-subtle focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />
      <div className="flex justify-end gap-2">
        <IconButton onClick={onCancel}>Cancel</IconButton>
        <IconButton variant="primary" loading={posting} disabled={!text.trim()} onClick={post}>
          Post
        </IconButton>
      </div>
    </>
  );
}
