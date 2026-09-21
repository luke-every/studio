"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { MotionItem, MotionModal } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";
import type { ViewMode } from "@/lib/use-view-mode";

/**
 * Creating a project starts from the place projects live, as one more tile in
 * the grid rather than a button in a toolbar — the empty slot is the
 * invitation. The form itself is a modal because it is a short, committed
 * decision, and it lands the user in the new project rather than back where
 * they started.
 */
export function NewProjectTile({ mode, index }: { mode: ViewMode; index: number }) {
  const [open, setOpen] = useState(false);
  const grid = mode === "grid";

  return (
    <>
      <MotionItem as="article" index={index} rhythm="tight">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`group flex w-full gap-4 rounded-[var(--r-md)] text-left transition-colors duration-[var(--dur-fast)] ${
            grid ? "flex-col" : "flex-row items-center border-b border-divider py-3"
          }`}
        >
          <span
            className={`grid place-items-center rounded-[var(--r-md)] border border-dashed border-border-strong text-foreground-subtle transition-colors duration-[var(--dur-fast)] group-hover:border-foreground-muted group-hover:text-foreground-muted ${
              grid ? "aspect-[4/3] w-full" : "aspect-[4/3] w-24 shrink-0"
            }`}
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-4">
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
              New project
            </span>
            <span className="text-sm text-foreground-subtle">
              Somewhere to put the next question.
            </span>
          </span>
        </button>
      </MotionItem>

      <NewProjectDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addProject } = useStudio();
  const router = useRouter();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    const project = addProject({ name, client, description });
    setName("");
    setClient("");
    setDescription("");
    onClose();
    router.push(`/projects/${project.slug}`);
  };

  return (
    <MotionModal open={open} onClose={onClose} label="New project">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">New project</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            A project is a body of work. Prototypes live inside it.
          </p>
        </div>

        <Field label="Name" value={name} onChange={setName} placeholder="Checkout" autoFocus />
        <Field label="For" value={client} onChange={setClient} placeholder="Every Foods" />
        <Field
          label="What is it about"
          value={description}
          onChange={setDescription}
          placeholder="The question this work is trying to answer."
          multiline
        />

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
            className="rounded-[var(--r-sm)] bg-accent px-3 py-1.5 text-sm text-accent-foreground transition-opacity duration-[var(--dur-fast)] disabled:opacity-40"
          >
            Create project
          </button>
        </div>
      </form>
    </MotionModal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  const shared =
    "w-full rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-eyebrow">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${shared} resize-none`}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={shared}
        />
      )}
    </label>
  );
}
