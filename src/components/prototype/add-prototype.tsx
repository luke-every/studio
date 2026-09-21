"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { MotionModal } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";
import { createPrototype } from "@/lib/registry/actions";
import { useViewer } from "@/lib/viewer";

/**
 * Adding a prototype that was built somewhere else.
 *
 * Not everything arrives through the save-a-version workflow — a PM will
 * have made something in another tool and simply wants it findable. This
 * asks for the least that makes a prototype useful to somebody else: where
 * it is, which team it belongs to, and what question it is asking.
 *
 * The preview image is optional and committed alongside the record. Without
 * one the prototype gets a plain tinted placeholder, which is honest rather
 * than an empty grey box.
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
  const viewer = useViewer();

  if (!viewer) return null;

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
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [designQuestion, setDesignQuestion] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamProjects = projects.filter((project) => project.teamSlug === teamSlug);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !teamSlug) return;

    setSaving(true);
    setError(null);

    const form = new FormData();
    form.set("name", name);
    form.set("description", description);
    form.set("designQuestion", designQuestion);
    form.set("context", "");
    form.set("teamSlug", teamSlug);
    form.set("projectSlug", projectSlug);
    form.set("url", url.trim());
    if (image) form.set("image", image);

    const result = await createPrototype(form);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    setName("");
    setUrl("");
    setDescription("");
    setDesignQuestion("");
    setImage(null);
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
            For work made somewhere else. It will be saved as v0.1 under your name.
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

        <Field label="Link" hint="Wherever it can be looked at — a deployment, a Figma prototype.">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            type="url"
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

        <Field label="The question" hint="What this is trying to answer. Optional.">
          <textarea
            value={designQuestion}
            onChange={(event) => setDesignQuestion(event.target.value)}
            rows={2}
            placeholder="Can results feel like advice rather than output?"
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field label="Preview image" hint="Optional. A screenshot, ideally a phone screen.">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setImage(event.target.files?.[0] ?? null)}
            className="text-xs text-foreground-muted file:mr-3 file:rounded-[var(--r-sm)] file:border file:border-border file:bg-surface file:px-2.5 file:py-1.5 file:text-xs file:text-foreground"
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
            disabled={!name.trim() || !teamSlug || saving}
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
