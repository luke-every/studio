"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon, CommentIcon } from "@/components/shell/nav-icons";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button, controlOn, IconButton } from "@/components/ui/button";
import { Stamp } from "@/components/ui/stamp";
import type { Comment } from "@/lib/comments";

import { CommentMenu, ResolveToggle, WhileWorking } from "./comment-parts";
import { useSharedComments } from "./shared-comments";
import { PanelEmpty } from "./panel-empty";
import { menuItem } from "@/components/ui/menu-item";

type Show = "open" | "resolved" | "all";

const SHOWS: { id: Show; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

/**
 * Every comment on this version, newest first. Choosing one takes you to
 * exactly where it was left.
 *
 * Select turns each row into something to tick, the way a list in iOS does:
 * the rows narrow to make room for a circle on the left, and the button at
 * the bottom copies only what is ticked. Outside Select it copies everything
 * the list is showing.
 */
export function CommentsPanel({
  comments,
  replies,
  selectedId,
  error,
  onSelect,
  onResolve,
  onDelete,
  onCopy,
  setupLabel,
}: {
  comments: Comment[];
  replies: Record<string, Comment[]>;
  selectedId: string | null;
  error: string | null;
  onSelect: (comment: Comment) => void;
  onResolve: (comment: Comment, resolved: boolean) => void;
  onDelete: (comment: Comment) => void;
  /** Copies these, as a prompt for Claude Code. */
  onCopy: (comments: Comment[]) => void;
  /** Which setup a comment was left on, in words; null when the prototype has only the one. */
  setupLabel?: (setup?: string) => string | null;
}) {
  const readOnly = !!useSharedComments();
  const [show, setShow] = useState<Show>("open");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  // Oldest first is how a prompt reads; the list shows newest first.
  const showing = comments.filter((comment) =>
    show === "all" ? true : show === "resolved" ? comment.resolvedAt : !comment.resolvedAt,
  );
  const shown = showing.toReversed();
  const toCopy = selecting ? showing.filter((comment) => ticked.has(comment.id)) : showing;

  const toggleSelecting = () => {
    setSelecting((now) => !now);
    setTicked(new Set());
  };
  const tick = (id: string) =>
    setTicked((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 sm:p-6 sm:pt-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-medium text-foreground">Comments</p>
        <div className="flex items-center gap-2">
          <MotionPopover
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            className="w-36"
            trigger={
              <IconButton
                onClick={() => setFilterOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={filterOpen}
              >
                {SHOWS.find((option) => option.id === show)?.label}
                <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
              </IconButton>
            }
          >
            <div role="menu" className="flex flex-col">
              {SHOWS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={show === option.id}
                  onClick={() => {
                    setShow(option.id);
                    setFilterOpen(false);
                  }}
                  className={`${menuItem} justify-between text-foreground`}
                >
                  {option.label}
                  {show === option.id ? <CheckIcon className="size-3.5" /> : null}
                </button>
              ))}
            </div>
          </MotionPopover>
          {readOnly ? null : (
          <IconButton
            aria-pressed={selecting}
            disabled={!selecting && !shown.length}
            onClick={toggleSelecting}
            className={selecting ? controlOn : ""}
          >
            {selecting ? "Done" : "Select"}
          </IconButton>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {shown.length ? (
        <ul className="flex flex-col">
          {shown.map((comment) => {
            const isTicked = ticked.has(comment.id);
            const choose = () => (selecting ? tick(comment.id) : onSelect(comment));

            return (
              <li key={comment.id} className="border-t border-divider first:border-t-0">
                <WhileWorking id={comment.id}>
                <div
                  // Selecting, the whole row is the target, the circle and the gaps as well as the comment.
                  onClick={selecting ? () => tick(comment.id) : undefined}
                  className={`flex items-center rounded-[var(--r-md)] transition-colors duration-[var(--dur-fast)] hover:bg-surface-hover ${
                    selecting ? "cursor-pointer" : ""
                  } ${(selecting ? isTicked : selectedId === comment.id) ? "bg-surface-inset" : ""}`}
                >
                  {/* Opens up from nothing, so the row beside it narrows to make room. */}
                  <div
                    aria-hidden
                    className={`shrink-0 overflow-hidden transition-[width,margin,opacity] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${
                      selecting ? "ml-2 mr-1 w-5 opacity-100" : "w-0 opacity-0"
                    }`}
                  >
                    <span
                      className={`grid size-5 place-items-center rounded-[var(--r-full)] border transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
                        isTicked
                          ? "border-transparent bg-accent text-accent-foreground"
                          : "border-border-strong text-transparent"
                      }`}
                    >
                      <CheckIcon className="size-3" />
                    </span>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={selecting ? isTicked : undefined}
                    onClick={selecting ? undefined : () => onSelect(comment)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        choose();
                      }
                    }}
                    className="group/row flex min-w-0 flex-1 cursor-pointer flex-col gap-1 px-2 py-3 text-left"
                  >
                    <div className="flex items-center gap-2 pb-1 text-ui text-foreground-subtle">
                      <UserAvatar name={comment.author.name} className="size-5" />
                      <span className="min-w-0 truncate text-foreground-muted">{comment.author.name}</span>
                      <span className="shrink-0 text-sm">
                        <Stamp iso={comment.at} relative />
                      </span>
                      {/* Far right, and only while the row is hovered (or on a touch screen, which cannot hover). */}
                      {readOnly ? null : (
                      <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-[var(--dur-fast)] focus-within:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100">
                        <ResolveToggle resolved={!!comment.resolvedAt} onToggle={() => onResolve(comment, !comment.resolvedAt)} />
                        <CommentMenu comment={comment} onDelete={onDelete} onCopy={(one) => onCopy([one])} />
                      </span>
                      )}
                    </div>
                    {setupLabel?.(comment.variant) ? (
                      <p className="truncate text-ui text-foreground-subtle">{setupLabel(comment.variant)}</p>
                    ) : null}
                    <p
                      className={`whitespace-pre-wrap py-2 text-base leading-[var(--leading-relaxed)] ${comment.resolvedAt ? "text-foreground-subtle" : "text-foreground"}`}
                    >
                      {comment.text}
                    </p>
                    {replies[comment.id]?.length ? (
                      <p className="text-ui font-medium text-foreground-muted">
                        {replies[comment.id].length} {replies[comment.id].length === 1 ? "reply" : "replies"}
                      </p>
                    ) : null}
                  </div>
                </div>
                </WhileWorking>
              </li>
            );
          })}
        </ul>
      ) : (
        <PanelEmpty icon={<CommentIcon />}>
          {comments.length
            ? `Nothing ${show === "open" ? "open" : "resolved"}.`
            : "Tip: press C to leave a comment."}
        </PanelEmpty>
      )}

      {readOnly ? null : (
      <div className="sticky bottom-0 z-[var(--z-raised)] -mx-4 -mb-4 mt-auto bg-tile p-4 sm:-mx-6 sm:-mb-6 sm:p-6">
        <Button onClick={() => onCopy(toCopy)} disabled={!toCopy.length} className="w-full">
          {toCopy.length
            ? `Copy ${toCopy.length} ${toCopy.length === 1 ? "comment" : "comments"} to Claude Code`
            : "Copy to Claude Code"}
        </Button>
      </div>
      )}
    </div>
  );
}
