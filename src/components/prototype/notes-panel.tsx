"use client";

import { useState } from "react";

import { CloseIcon } from "@/components/shell/nav-icons";
import { ConfirmPopover } from "@/components/ui/confirm-popover";
import type { Comment } from "@/lib/comments";

/** The notes for the developers on a version, as a list beside the canvas: a tap goes to the note, a double tap on the note itself edits it. A note is taken away only from here, after asking. */
export function NotesPanel({ notes, selectedId, onSelect, onDelete }: { notes: Comment[]; selectedId: string | null; onSelect: (id: string | null) => void; onDelete: (note: Comment) => void }) {
  const [asking, setAsking] = useState<string | null>(null);
  if (!notes.length) return <p className="px-4 py-6 text-sm text-foreground-subtle">Select an element to leave a note.</p>;
  return (
    <ul className="flex flex-col py-1">
      {notes.map((note) => (
        <li key={note.id} className={`group relative ${selectedId === note.id ? "bg-surface-hover" : "hover:bg-surface-hover"} transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)]`}>
          <button type="button" onClick={() => onSelect(selectedId === note.id ? null : note.id)} className="flex w-full flex-col gap-0.5 px-4 py-2.5 pr-10 text-left">
            <span className="text-xs text-foreground-subtle">
              #{note.n} · {note.author.name}
            </span>
            <span className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground">{note.text}</span>
          </button>
          <div className={`absolute right-2 top-2 transition-opacity duration-[var(--dur-fast)] ease-[var(--curve-standard)] focus-within:opacity-100 group-hover:opacity-100 ${selectedId === note.id || asking === note.id ? "opacity-100" : "opacity-0"}`}>
            <ConfirmPopover
              open={asking === note.id}
              onClose={() => setAsking(null)}
              message="Are you sure you want to delete this note?"
              confirmLabel="Delete"
              tone="destructive"
              onConfirm={() => onDelete(note)}
              trigger={
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={() => setAsking((now) => (now === note.id ? null : note.id))}
                  className="grid size-6 place-items-center rounded-[var(--r-control)] text-foreground-subtle transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:text-foreground"
                >
                  <CloseIcon className="size-3.5" />
                </button>
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
