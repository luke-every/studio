"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";

/**
 * Filing a prototype into a project.
 *
 * Lives on the prototype itself rather than in a bulk-management screen: the
 * decision is always made while looking at the thing, so the control is where
 * the thing is. It stays out of the way until the tile is hovered or the
 * control is focused.
 */
export function FileIntoProject({
  prototypeSlug,
  teamSlug,
  currentProjectSlug,
}: {
  prototypeSlug: string;
  teamSlug: string;
  currentProjectSlug?: string | null;
}) {
  const { projects, filePrototype } = useStudio();
  const [open, setOpen] = useState(false);

  const options = projects.filter((project) => project.teamSlug === teamSlug);

  const choose = (projectSlug: string | null) => () => {
    filePrototype(prototypeSlug, projectSlug);
    setOpen(false);
  };

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="end"
      className="w-44"
      trigger={
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            setOpen((value) => !value);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="File into project"
          className={`grid size-6 place-items-center rounded-[var(--r-sm)] border border-border bg-surface-elevated/90 text-foreground-muted backdrop-blur-md transition-opacity duration-[var(--dur-fast)] hover:text-foreground focus-visible:opacity-100 ${
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
            <circle cx="3.5" cy="8" r="1.1" fill="currentColor" />
            <circle cx="8" cy="8" r="1.1" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.1" fill="currentColor" />
          </svg>
        </button>
      }
    >
      <div role="menu">
        <p className="px-2.5 py-1.5 text-eyebrow">File into</p>

        {options.length === 0 ? (
          <p className="px-2.5 pb-2 text-xs text-foreground-subtle">
            No projects in this team yet.
          </p>
        ) : (
          options.map((project) => (
            <button
              key={project.slug}
              type="button"
              role="menuitemradio"
              aria-checked={project.slug === currentProjectSlug}
              onClick={choose(project.slug)}
              className="flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-sm text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            >
              <span className="truncate">{project.name}</span>
              {project.slug === currentProjectSlug ? (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
              ) : null}
            </button>
          ))
        )}

        {currentProjectSlug ? (
          <button
            type="button"
            role="menuitem"
            onClick={choose(null)}
            className="mt-0.5 w-full rounded-[var(--r-sm)] border-t border-divider px-2.5 py-1.5 text-left text-sm text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
          >
            Remove from project
          </button>
        ) : null}
      </div>
    </MotionPopover>
  );
}
