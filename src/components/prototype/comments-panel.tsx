"use client";

import { useState } from "react";

import { IconButton } from "@/components/ui/button";
import { Stamp } from "@/components/ui/stamp";
import type { Comment } from "@/lib/comments";

import { Replies } from "./comment-parts";

type Show = "open" | "resolved" | "all";

/**
 * Every comment on this version, newest first. Choosing one takes you to
 * exactly where it was left.
 */
export function CommentsPanel({
  comments,
  replies,
  selectedId,
  error,
  onSelect,
  onReply,
  onResolve,
}: {
  comments: Comment[];
  replies: Record<string, Comment[]>;
  selectedId: string | null;
  error: string | null;
  onSelect: (comment: Comment) => void;
  onReply: (parent: Comment, text: string) => Promise<boolean>;
  onResolve: (comment: Comment, resolved: boolean) => void;
}) {
  const [show, setShow] = useState<Show>("open");
  const shown = comments
    .filter((comment) => (show === "all" ? true : show === "resolved" ? comment.resolvedAt : !comment.resolvedAt))
    .toReversed();

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-medium text-foreground">Comments</p>
        <div className="flex gap-1" role="group" aria-label="Show">
          {(["open", "resolved", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={show === option}
              onClick={() => setShow(option)}
              className={`rounded-[var(--r-full)] px-2.5 py-1 text-xs capitalize transition-colors duration-[var(--dur-fast)] ${
                show === option ? "bg-accent text-accent-foreground" : "text-foreground-muted hover:bg-surface-hover"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {shown.length ? (
        <ul className="flex flex-col">
          {shown.map((comment) => (
            <li key={comment.id} className="border-t border-divider first:border-t-0">
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(comment)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSelect(comment);
                  }
                }}
                className={`flex cursor-pointer flex-col gap-1 rounded-[var(--r-md)] px-2 py-3 text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-hover ${
                  selectedId === comment.id ? "bg-surface-inset" : ""
                }`}
              >
                <p className="text-xs text-foreground-subtle">
                  #{comment.n} · {comment.author.name} · <Stamp iso={comment.at} relative />
                </p>
                <p className={`whitespace-pre-wrap text-sm leading-[var(--leading-relaxed)] ${comment.resolvedAt ? "text-foreground-subtle" : "text-foreground"}`}>
                  {comment.text}
                </p>
                <Replies replies={replies[comment.id] ?? []} onReply={(text) => onReply(comment, text)} />
                <div className="pt-1">
                  <IconButton
                    onClick={(event) => {
                      event.stopPropagation();
                      onResolve(comment, !comment.resolvedAt);
                    }}
                  >
                    {comment.resolvedAt ? "Reopen" : "Resolve"}
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-[30ch] text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
          {comments.length
            ? `Nothing ${show === "open" ? "open" : "resolved"}.`
            : "Press C, then click anywhere on the prototype to leave a comment there."}
        </p>
      )}
    </div>
  );
}
