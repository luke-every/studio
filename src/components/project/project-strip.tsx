"use client";

import { useState, type FormEvent } from "react";

import { MotionModal } from "@/components/motion";
import { ProjectTile } from "@/components/project/project-tile";
import { useStudio } from "@/lib/data/studio-store";
import { prototypesInProject } from "@/lib/data/teams";

/**
 * The projects inside a team.
 *
 * A single row above the team's work: enough to see how the team has chosen
 * to organise itself, without turning the page into two competing grids. The
 * prototype list below stays complete — a project is a view onto it, not a
 * partition of it.
 */
export function ProjectStrip({ teamSlug }: { teamSlug: string }) {
  const { projects, prototypes } = useStudio();
  const [creating, setCreating] = useState(false);

  const teamProjects = projects.filter((project) => project.teamSlug === teamSlug);

  return (
    <section aria-labelledby="projects-heading" className="min-w-0">
      <h2 id="projects-heading" className="text-eyebrow">
        Projects
      </h2>

      <div className="-mx-5 mt-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-start gap-4">
          {teamProjects.map((project) => {
            const contents = prototypesInProject(project.slug, prototypes);
            return (
              <ProjectTile
                key={project.slug}
                href={`/teams/${teamSlug}/projects/${project.slug}`}
                name={project.name}
                count={contents.length}
                previews={contents.slice(0, 3).map((prototype) => prototype.preview)}
              />
            );
          })}

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="group flex w-[9.5rem] shrink-0 flex-col gap-2 text-left"
          >
            <span className="grid aspect-[5/3] w-full place-items-center rounded-[var(--r-lg)] border border-dashed border-border-strong text-foreground-subtle transition-colors duration-[var(--dur-fast)] group-hover:border-foreground-muted group-hover:text-foreground-muted">
              <svg viewBox="0 0 16 16" aria-hidden className="size-4">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-foreground">New project</span>
              <span className="block truncate text-xs text-foreground-subtle">
                Group related work
              </span>
            </span>
          </button>
        </div>
      </div>

      <NewProjectDialog
        teamSlug={teamSlug}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </section>
  );
}

function NewProjectDialog({
  teamSlug,
  open,
  onClose,
}: {
  teamSlug: string;
  open: boolean;
  onClose: () => void;
}) {
  const { addProject } = useStudio();
  const [name, setName] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    addProject({ teamSlug, name });
    setName("");
    onClose();
  };

  return (
    <MotionModal open={open} onClose={onClose} label="New project">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">New project</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            A place to keep related prototypes together.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-eyebrow">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Checkout rework"
            autoFocus
            className="w-full rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--r-sm)] px-3 py-1.5 text-sm text-foreground-muted transition-colors duration-[var(--dur-fast)] hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-[var(--r-sm)] bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-40"
          >
            Create project
          </button>
        </div>
      </form>
    </MotionModal>
  );
}
