"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { MotionModal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import type { ViewMode } from "@/lib/use-view-mode";

/**
 * Creating a team starts from the place teams live, as one more tile in the
 * grid rather than a button in a toolbar — the empty slot is the invitation.
 * Submitting lands the user inside the new team rather than back where they
 * started.
 */
export function NewTeamTile({ mode }: { mode: ViewMode }) {
  const [open, setOpen] = useState(false);
  const grid = mode === "grid";

  return (
    <>
      <article>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`group flex w-full gap-4 rounded-[var(--r-md)] text-left ${
            grid ? "flex-col" : "flex-row items-center border-b border-divider py-3"
          }`}
        >
          <span
            className={`grid place-items-center rounded-[var(--r-lg)] border border-dashed border-border-strong text-foreground-subtle transition-colors duration-[var(--dur-fast)] group-hover:border-foreground-muted group-hover:text-foreground-muted ${
              grid ? "aspect-[5/3] w-full" : "aspect-[5/3] w-28 shrink-0"
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

          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
              New team
            </span>
            <span className="text-xs text-foreground-subtle">
              Somewhere to put the next question.
            </span>
          </span>
        </button>
      </article>

      <NewTeamDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NewTeamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addTeam, saving } = useStudio();
  const router = useRouter();
  const [name, setName] = useState("");
  const [remit, setRemit] = useState("");
  const [description, setDescription] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    const slug = await addTeam({ name, remit, description });
    if (!slug) return; // The failure is shown in the nav; keep what was typed.

    setName("");
    setRemit("");
    setDescription("");
    onClose();
    router.push(`/teams/${slug}`);
  };

  return (
    <MotionModal open={open} onClose={onClose} label="New team">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">New team</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            A team is a part of the business. Prototypes live inside it.
          </p>
        </div>

        <Field label="Name" value={name} onChange={setName} placeholder="Activation" autoFocus />
        <Field
          label="Remit"
          value={remit}
          onChange={setRemit}
          placeholder="What this team is responsible for."
        />
        <Field
          label="What is it about"
          value={description}
          onChange={setDescription}
          placeholder="The question this work is trying to answer."
          multiline
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || saving}>
            {saving ? "Creating…" : "Create team"}
          </Button>
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
