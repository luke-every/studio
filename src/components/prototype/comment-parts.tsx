"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { MotionPopover } from "@/components/motion";
import {
  CheckIcon,
  EllipsisIcon,
  ReplyIcon,
  SendIcon,
} from "@/components/shell/nav-icons";
import { UserAvatar } from "@/components/shell/user-avatar";
import { useUser } from "@/lib/use-user";
import { IconButton } from "@/components/ui/button";
import { ConfirmPopover } from "@/components/ui/confirm-popover";
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
  /** Asked for a comment that isn't to be found on the screen showing: find the screen it is on and show that. */
  onLocate?: (comment: Comment) => void;
  /** What has been said back to each comment, oldest first. */
  replies: Record<string, Comment[]>;
  /** `setup` puts it on a particular setup of the prototype (see `Comment`); an empty one is the version as it is, and none is the setup on screen. */
  onAdd: (text: string, anchor: Anchor, setup?: string) => Promise<boolean>;
  onReply: (parent: Comment, text: string) => Promise<boolean>;
  onResolve: (comment: Comment, resolved: boolean) => void;
  /** Deletes it, once the comment's own menu has asked. */
  onDelete: (comment: Comment) => void;
  /** Copies it, as a prompt for Claude Code. */
  onCopy: (comment: Comment) => void;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const snippet = (element: Element) =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * What a page is saying, in a few words: the start of its visible text, with
 * numbers and punctuation left out so a counter or a clock doesn't change it.
 * Steps of a flow share one address and often one layout, so this is what
 * tells them apart.
 */
export function pageKey(doc: Document) {
  return (doc.body?.innerText ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .slice(0, 40);
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
  if (
    !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  )
    return null;
  if (anchor.text && snippet(element) !== anchor.text) return null;
  return element;
}

/**
 * Where an anchor is in a document, in its own pixels, or null when it isn't
 * on this screen right now. A prototype can swap one step for another without
 * changing page, or draw a step over the one before, so a comment shows only
 * where its element is there, uncovered, and the page reads as it did.
 */
export function spotOf(
  doc: Document,
  anchor: Anchor,
  page = pageKey(doc),
): Spot | null {
  if (anchor.screen !== doc.location.pathname) return null;
  if (anchor.page && anchor.page !== page) return null;
  if (!anchor.selector) {
    const root = doc.documentElement;
    const win = doc.defaultView!;
    return {
      x: anchor.fx * root.scrollWidth - win.scrollX,
      y: anchor.fy * root.scrollHeight - win.scrollY,
    };
  }
  const element = elementOf(doc, anchor);
  const rect = element?.getBoundingClientRect();
  if (!element || !rect || !(rect.width || rect.height)) return null;
  const spot = {
    x: rect.left + anchor.x * rect.width,
    y: rect.top + anchor.y * rect.height,
  };
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

/** The pin is 2rem square; an opened pin or card is 16rem wide. Both are drawn from the pin's point. */
const PIN = 32;
const WIDTH = 256;
const EDGE = 8;

type Tip = { left: number; top: number };

/**
 * Where an opened pin or comment card goes: out from the pin's point, up and to
 * the right, unless there isn't room, then to the left and/or down. The one
 * rule for both, so a card opens exactly where the pin did. Each side that
 * can't be used is left out, so the box stays fixed to the corner it grows from.
 */
function cornerOf(tip: Tip, height: number) {
  const root = document.documentElement;
  const left = tip.left + WIDTH > root.clientWidth - EDGE;
  const down = tip.top - height < EDGE;
  return {
    left,
    down,
    style: {
      ...(left
        ? { right: root.clientWidth - (tip.left + PIN) }
        : { left: tip.left }),
      ...(down
        ? { top: tip.top - PIN }
        : { bottom: root.clientHeight - tip.top }),
      zIndex: "var(--z-popover)",
    },
    // Whichever corner is at the pin stays square.
    square: down
      ? left
        ? "rounded-tr-none"
        : "rounded-tl-none"
      : left
        ? "rounded-br-none"
        : "rounded-bl-none",
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
  // Hovering opens the pin out to show what was said, without opening the comment itself. The opened pin is drawn on the page,
  // at the pin's place in the window, so the frame the prototype is in can't clip it. `at` is where it is while it is on
  // screen; `open` is whether it is out, and goes first so it can close before it is taken away.
  const [at, setAt] = useState<Tip | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const enter = (event: React.PointerEvent<HTMLButtonElement>) => {
    window.clearTimeout(timer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    setAt({ left: rect.left, top: rect.bottom });
    // A couple of frames later, so it is first drawn closed and the opening is seen.
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  };
  const leave = () => {
    setOpen(false);
    timer.current = window.setTimeout(() => setAt(null), 300);
  };

  return (
    <button
      type="button"
      aria-label={`Comment ${comment.n} by ${comment.author.name}`}
      data-pin=""
      onClick={() => {
        // Choosing it replaces the hover: once the comment is closed again the pin is at rest until the pointer comes back.
        window.clearTimeout(timer.current);
        setOpen(false);
        setAt(null);
        onClick();
      }}
      onPointerEnter={enter}
      onPointerLeave={leave}
      style={{ left, top }}
      className={`pointer-events-auto absolute -translate-y-full ${comment.resolvedAt ? "opacity-60" : ""}`}
    >
      <PinFace name={comment.author.name} selected={selected} />
      {at && !selected ? (
        <PinPill comment={comment} tip={at} expanded={open} />
      ) : null}
    </button>
  );
}

/**
 * The pin opened out. It is a real box that grows from the pin's own size to
 * its full width and the height its text needs (found before it is first
 * painted), anchored at the pin's point, so it rises and spreads from there
 * with the avatar fixed to its top corner. Its shadow is a plain box-shadow,
 * which a growing box carries with it, and only deepens a little as it opens.
 */
function PinPill({
  comment,
  tip,
  expanded,
}: {
  comment: Comment;
  tip: Tip;
  expanded: boolean;
}) {
  const inner = useRef<HTMLSpanElement>(null);
  const [height, setHeight] = useState(PIN);
  useLayoutEffect(() => {
    if (inner.current) setHeight(Math.max(PIN, inner.current.offsetHeight));
  }, [comment.text]);
  const corner = cornerOf(tip, height);
  const side = corner.left ? "right" : "left";

  return createPortal(
    <span
      style={{
        ...corner.style,
        width: expanded ? WIDTH : PIN,
        height: expanded ? height : PIN,
      }}
      className={`fixed block overflow-hidden rounded-2xl ${corner.square} bg-surface transition-[width,height,box-shadow] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${
        expanded
          ? "shadow-[0_1px_3px_var(--alpha-ink-12),0_6px_16px_var(--alpha-ink-12)]"
          : "shadow-[0_1px_3px_var(--alpha-ink-08),0_4px_10px_var(--alpha-ink-08)]"
      }`}
    >
      {/* Set in from the corner as the box opens, by the same padding as the text, so the padding is around all of it. */}
      <span
        className={`absolute transition-[top,left,right] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${
          expanded ? "top-3" : "top-0.5"
        } ${side === "left" ? (expanded ? "left-3" : "left-0.5") : expanded ? "right-3" : "right-0.5"}`}
      >
        <UserAvatar name={comment.author.name} className="size-7" />
      </span>
      {/* Laid out at full width whatever the box is doing, so its height can be read; what is revealed slides in from the pin's side. */}
      <span
        ref={inner}
        className={`absolute top-0 block w-64 py-3 transition-[opacity,translate] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${
          side === "left"
            ? "left-0 pl-[3.125rem] pr-3"
            : "right-0 pl-3 pr-[3.125rem]"
        } ${expanded ? "translate-x-0 opacity-100" : side === "left" ? "-translate-x-3 opacity-0" : "translate-x-3 opacity-0"}`}
      >
        <span className="flex items-baseline justify-between gap-3 text-sm font-medium text-foreground">
          <span className="truncate">{comment.author.name}</span>
          <span className="shrink-0 text-xs font-normal text-foreground-subtle">
            <Stamp iso={comment.at} relative />
          </span>
        </span>
        <span className="line-clamp-4 block whitespace-pre-wrap pt-1 text-base leading-[var(--leading-relaxed)] text-foreground">
          {comment.text}
        </span>
      </span>
    </span>,
    document.body,
  );
}

/** A pin is its author's face in a circle with one square corner, which is where it points. */
function PinFace({ name, selected }: { name: string; selected?: boolean }) {
  return (
    <span
      className={`block rounded-full rounded-bl-none bg-surface p-0.5 shadow-[0_1px_3px_var(--alpha-ink-08),0_4px_10px_var(--alpha-ink-08)] ${
        selected ? "ring-2 ring-[var(--focus-ring)]" : ""
      }`}
    >
      <UserAvatar name={name} className="size-7" />
    </span>
  );
}

/** The pin of a comment that hasn't been posted yet. */
export function DraftPin({ left, top }: { left: number; top: number }) {
  const { current } = useUser();
  return (
    <span style={{ left, top }} className="absolute -translate-y-full">
      <PinFace name={current ?? ""} />
    </span>
  );
}

/**
 * An open comment, or the box for a new one: where the pin opens out to, from
 * its point (see `cornerOf`). It is drawn on the page, at a position in the
 * window, rather than inside whatever holds the pin, which would clip it at its edge.
 */
export function Card({
  at,
  children,
  onOutside,
}: {
  at: Tip;
  children: ReactNode;
  /** Pressing anywhere else, in the studio or in the prototype, calls this. */ onOutside?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(PIN);
  // Its height decides whether it fits above the pin, and changes as it is written in, so it is watched.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    setHeight(element.offsetHeight);
    const watch = new ResizeObserver(() => setHeight(element.offsetHeight));
    watch.observe(element);
    return () => watch.disconnect();
  }, []);
  const outside = useRef(onOutside);
  useEffect(() => {
    outside.current = onOutside;
  });
  useEffect(() => {
    if (!outside.current) return undefined;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // A pin is its own way of closing (and opening), so it is left to decide.
      if (box.current?.contains(target) || target?.closest("[data-pin]"))
        return;
      outside.current?.();
    };
    // A press inside the prototype never reaches this page, but it does take the focus from it.
    const left = () => outside.current?.();
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("blur", left);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("blur", left);
    };
  }, []);
  const corner = cornerOf(at, height);

  return createPortal(
    <div
      ref={box}
      style={corner.style}
      className={`fixed flex w-64 flex-col gap-2 rounded-2xl ${corner.square} border border-border bg-surface p-3 shadow-floating`}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * Resolving, as a small tick that sits beside the time. Filled once it is done.
 * Resolving asks first, in a small card that grows out of the tick itself so
 * the answer is right under the finger; reopening is easily undone, so it
 * doesn't ask.
 */
export function ResolveToggle({
  resolved,
  onToggle,
}: {
  resolved: boolean;
  onToggle: () => void;
}) {
  const [asking, setAsking] = useState(false);

  return (
    // Whatever holds the comment (a row that opens it) must not hear presses meant for the tick or its question.
    <div onClick={(event) => event.stopPropagation()}>
      <ConfirmPopover
        open={asking}
        onClose={() => setAsking(false)}
        message="Are you sure you want to resolve this comment?"
        confirmLabel="Resolve"
        onConfirm={onToggle}
        trigger={
          <button
            type="button"
            aria-label={resolved ? "Reopen" : "Resolve"}
            title={resolved ? "Reopen" : "Resolve"}
            aria-pressed={resolved}
            aria-haspopup={resolved ? undefined : "dialog"}
            aria-expanded={resolved ? undefined : asking}
            onClick={() => (resolved ? onToggle() : setAsking((now) => !now))}
            className={`grid size-5 shrink-0 place-items-center rounded-[var(--r-full)] transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
              resolved
                ? "bg-accent text-accent-foreground"
                : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            <CheckIcon className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

/**
 * What has been said back to a comment, and the button to say something more.
 * `extra` sits in the same row, before it.
 */
export function Replies({
  replies,
  onReply,
  startWriting = false,
  onEscape,
}: {
  replies: Comment[];
  onReply: (text: string) => Promise<boolean>;
  /** Open with the reply box ready, cursor in it. */
  startWriting?: boolean;
  /** Escape in the box, besides closing it. */
  onEscape?: () => void;
}) {
  const [writing, setWriting] = useState(startWriting);
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
    <div
      onClick={(event) => event.stopPropagation()}
      className="flex flex-col gap-2"
    >
      {replies.map((reply) => (
        <div
          key={reply.id}
          className="flex flex-col gap-0.5 border-t border-divider pt-2"
        >
          <p className="flex items-center justify-between gap-3 text-xs text-foreground-subtle">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <UserAvatar name={reply.author.name} className="size-5" />
              <span className="truncate">{reply.author.name}</span>
            </span>
            <span className="shrink-0">
              <Stamp iso={reply.at} relative />
            </span>
          </p>
          <p className="whitespace-pre-wrap text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
            {reply.text}
          </p>
        </div>
      ))}
      {writing ? (
        <div className="relative">
          <textarea
            autoFocus
            value={text}
            disabled={posting}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // The studio's shortcuts stay out of it while somebody is typing.
              event.stopPropagation();
              if (event.key === "Escape") {
                setWriting(false);
                onEscape?.();
              } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void post();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Reply"
            aria-label="Reply"
            className="w-full resize-none rounded-[var(--r-md)] bg-surface-inset p-2 pr-10 text-sm text-foreground outline-none placeholder:text-foreground-subtle focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
          <button
            type="button"
            aria-label="Send reply"
            title="Send reply"
            disabled={!text.trim() || posting}
            onClick={() => void post()}
            className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-[var(--r-full)] bg-accent text-accent-foreground transition-opacity duration-[var(--dur-fast)] hover:bg-accent-hover disabled:opacity-30 disabled:hover:bg-accent"
          >
            <SendIcon />
          </button>
        </div>
      ) : null}
      <div className="flex gap-2 empty:hidden">
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

/** The top row of a comment: what it is, and on the right resolving it and taking it away. */
export function CommentActions({
  comment,
  onResolve,
  onDelete,
  onCopy,
  bleed,
}: {
  comment: Comment;
  onResolve: (comment: Comment, resolved: boolean) => void;
  onDelete: (comment: Comment) => void;
  onCopy: (comment: Comment) => void;
  /** Pulls the divider out to the edges of whatever holds it: the opposite of that container's side padding. */
  bleed: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-divider pb-2 ${bleed}`}
    >
      <span className="text-xs font-medium text-foreground-subtle">
        Comment
      </span>
      <div className="flex items-center gap-1">
        <ResolveToggle
          resolved={!!comment.resolvedAt}
          onToggle={() => onResolve(comment, !comment.resolvedAt)}
        />
        <CommentMenu comment={comment} onDelete={onDelete} onCopy={onCopy} />
      </div>
    </div>
  );
}

/** The ellipsis beside a comment: copy it for Claude Code, or delete it (after being asked, right under the ellipsis). */
function CommentMenu({
  comment,
  onDelete,
  onCopy,
}: {
  comment: Comment;
  onDelete: (comment: Comment) => void;
  onCopy: (comment: Comment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const item =
    "flex w-full items-center rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-nav hover:bg-surface-hover";

  return (
    // Whatever holds the comment (a row that opens it) must not hear presses meant for the menu.
    <div onClick={(event) => event.stopPropagation()}>
      <ConfirmPopover
        open={deleting}
        onClose={() => setDeleting(false)}
        message="Are you sure you want to delete this comment? Its replies go with it."
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={() => onDelete(comment)}
        trigger={
          <MotionPopover
            open={open}
            onClose={() => setOpen(false)}
            className="w-52"
            trigger={
              <button
                type="button"
                aria-label="More"
                title="More"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="grid size-5 shrink-0 place-items-center rounded-[var(--r-full)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover hover:text-foreground"
              >
                <EllipsisIcon className="size-3.5" />
              </button>
            }
          >
            <div role="menu" className="flex flex-col">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onCopy(comment);
                }}
                className={`${item} text-foreground`}
              >
                Copy to Claude Code
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setDeleting(true);
                }}
                className={`${item} text-destructive`}
              >
                Delete
              </button>
            </div>
          </MotionPopover>
        }
      />
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
  onDelete,
  onCopy,
}: {
  comment: Comment;
  replies: Comment[];
  at: { left: number; top: number };
  onClose: () => void;
  onReply: (parent: Comment, text: string) => Promise<boolean>;
  onResolve: (comment: Comment, resolved: boolean) => void;
  onDelete: (comment: Comment) => void;
  onCopy: (comment: Comment) => void;
}) {
  return (
    <Card at={at} onOutside={onClose}>
      <CommentActions
        comment={comment}
        onResolve={onResolve}
        onDelete={onDelete}
        onCopy={onCopy}
        bleed="-mx-3 px-3"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <UserAvatar name={comment.author.name} className="size-5" />
          <span className="truncate">{comment.author.name}</span>
        </p>
        <span className="shrink-0 text-xs text-foreground-subtle">
          <Stamp iso={comment.at} relative />
        </span>
      </div>
      <p className="whitespace-pre-wrap py-2 text-base leading-[var(--leading-relaxed)] text-foreground">
        {comment.text}
      </p>
      <Replies
        replies={replies}
        onReply={(text) => onReply(comment, text)}
        startWriting
        onEscape={onClose}
      />
    </Card>
  );
}

export function Composer({
  onPost,
  onCancel,
}: {
  onPost: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
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
        <IconButton
          variant="primary"
          loading={posting}
          disabled={!text.trim()}
          onClick={post}
        >
          Post
        </IconButton>
      </div>
    </>
  );
}
