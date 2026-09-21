"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { MotionModal } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";
import { createPrototype } from "@/lib/registry/actions";

/**
 * Adding a prototype by hand.
 *
 * The usual route is Claude Code, which commits the prototype's files and
 * its registry entry together. This is the other route: someone has an HTML
 * file and wants it in the studio.
 *
 * The file is uploaded and committed, not linked — so the prototype is
 * genuinely here, served from this deployment, and cannot quietly disappear
 * when somebody tidies up their account somewhere else.
 *
 * This is also the only place the studio asks who you are, because it is the
 * only place it cannot tell: work pushed from Claude Code carries the name
 * of whoever committed it.
 */
export function AddPrototype({
  teamSlug,
  projectSlug,
  trigger = "tile",
}: {
  /** Pre-filled when added from inside a team. */
  teamSlug?: string;
  projectSlug?: string | null;
  trigger?: "tile" | "button";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger === "button" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover"
        >
          Add prototype
        </button>
      ) : (
        <article>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group flex w-full flex-col gap-4 text-left"
          >
            <span className="grid aspect-device w-full place-items-center rounded-[var(--r-device)] border border-dashed border-border-strong text-foreground-subtle transition-colors duration-[var(--dur-fast)] group-hover:border-foreground-muted group-hover:text-foreground-muted">
              <svg viewBox="0 0 16 16" aria-hidden className="size-4">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">Add prototype</span>
              <span className="truncate text-xs text-foreground-subtle">
                Something built elsewhere
              </span>
            </span>
          </button>
        </article>
      )}

      <AddPrototypeDialog
        open={open}
        onClose={() => setOpen(false)}
        teamSlug={teamSlug}
        projectSlug={projectSlug}
      />
    </>
  );
}

function AddPrototypeDialog({
  open,
  onClose,
  teamSlug: initialTeam,
  projectSlug: initialProject,
}: {
  open: boolean;
  onClose: () => void;
  teamSlug?: string;
  projectSlug?: string | null;
}) {
  const { teams, projects } = useStudio();
  const router = useRouter();

  const [teamSlug, setTeamSlug] = useState(initialTeam ?? teams[0]?.slug ?? "");
  const [projectSlug, setProjectSlug] = useState(initialProject ?? "");
  const [name, setName] = useState("");
  const [by, setBy] = useState("");
  const [html, setHtml] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [changes, setChanges] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamProjects = projects.filter((project) => project.teamSlug === teamSlug);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !teamSlug || !by.trim() || !html) return;

    setSaving(true);
    setError(null);

    const form = new FormData();
    form.set("name", name);
    form.set("description", description);
    form.set("changes", changes);
    form.set("teamSlug", teamSlug);
    form.set("projectSlug", projectSlug);
    form.set("by", by.trim());
    form.set("html", html);

    const result = await createPrototype(form);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    setName("");
    setDescription("");
    setChanges("");
    setHtml(null);
    router.refresh();
  };

  return (
    <MotionModal open={open} onClose={onClose} label="Add a prototype">
      <form onSubmit={submit} className="flex max-h-[80dvh] flex-col gap-5 overflow-y-auto">
        <div>
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">
            Add a prototype
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Upload an HTML file. It is saved as v0.1 and committed to the repository.
          </p>
        </div>

        <Field label="Name" required>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Quiz results"
            autoFocus
            className={inputClass}
          />
        </Field>

        <Field
          label="The prototype"
          required
          hint="A single HTML file. It is committed to the repository and served from here, so it stays available."
        >
          <input
            type="file"
            accept=".html,text/html"
            onChange={(event) => setHtml(event.target.files?.[0] ?? null)}
            className="text-xs text-foreground-muted file:mr-3 file:rounded-[var(--r-sm)] file:border file:border-border file:bg-surface file:px-2.5 file:py-1.5 file:text-xs file:text-foreground"
          />
        </Field>

        <Field label="Created by" required hint="Your name, so the studio knows whose this is.">
          <input
            value={by}
            onChange={(event) => setBy(event.target.value)}
            placeholder="Sarah"
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team" required>
            <select
              value={teamSlug}
              onChange={(event) => {
                setTeamSlug(event.target.value);
                setProjectSlug("");
              }}
              className={inputClass}
            >
              {teams.map((team) => (
                <option key={team.slug} value={team.slug}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Project" hint="Optional.">
            <select
              value={projectSlug}
              onChange={(event) => setProjectSlug(event.target.value)}
              className={inputClass}
              disabled={teamProjects.length === 0}
            >
              <option value="">No project</option>
              {teamProjects.map((project) => (
                <option key={project.slug} value={project.slug}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="What is it" hint="A sentence someone outside the team would understand.">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="What someone sees the moment the quiz finishes."
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field label="What's in this version" hint="What you made or changed. Optional.">
          <textarea
            value={changes}
            onChange={(event) => setChanges(event.target.value)}
            rows={2}
            placeholder="First pass at the results screen."
            className={`${inputClass} resize-none`}
          />
        </Field>

        {error ? (
          <p className="rounded-[var(--r-sm)] border border-border bg-surface-hover px-3 py-2 text-xs text-foreground">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--r-sm)] px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || !teamSlug || !by.trim() || !html || saving}
            className="rounded-[var(--r-sm)] bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add prototype"}
          </button>
        </div>
      </form>
    </MotionModal>
  );
}

const inputClass =
  "w-full rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-eyebrow">
        {label}
        {required ? null : ""}
      </span>
      {children}
      {hint ? <span className="text-xs text-foreground-subtle">{hint}</span> : null}
    </label>
  );
}
