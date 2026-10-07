"use client";

import { barControl } from "@/components/ui/button";
import { useState, type FormEvent } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon, PencilIcon } from "@/components/shell/nav-icons";
import { Stamp } from "@/components/ui/stamp";
import type { PrototypeVersion } from "@/lib/registry/types";

const VERSION_NUMBER = /^v\d+\.\d+$/;

/**
 * The version, and when it was made. With more than one it's a button that
 * opens the list; with one there is nothing to choose, so it's plain text.
 * Each version has a pencil to change its number by hand.
 */
export function VersionMenu({
  versions,
  selectedId,
  currentId,
  onSelect,
  onRename,
  saving,
}: {
  versions: PrototypeVersion[];
  selectedId: string;
  currentId: string;
  onSelect: (version: PrototypeVersion) => void;
  /** Starts saving the new number and returns at once. */
  onRename: (version: PrototypeVersion, label: string) => void;
  /** A rename is on its way. */
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];

  const label = (
    <>
      <span className={`flex items-center gap-1 text-sm font-medium text-foreground ${saving ? "pulse-soft" : ""}`}>
        {selected.version}
        {versions.length > 1 ? <ChevronDownIcon className="size-3.5 text-foreground-subtle" /> : null}
      </span>
      <span className="block text-xs text-foreground-subtle"><Stamp iso={selected.createdAt} /></span>
    </>
  );

  const taken = (version: PrototypeVersion) =>
    versions.some((other) => other.id !== version.id && other.version === draft.trim());

  const save = (event: FormEvent, version: PrototypeVersion) => {
    event.preventDefault();
    if (draft.trim() !== version.version && !taken(version)) onRename(version, draft.trim());
    setEditing(null);
  };

  // One version: nothing to pick.
  if (versions.length < 2) return <div className={`${barControl} flex-col !items-start !justify-center !gap-0`}>{label}</div>;

  return (
    <MotionPopover
      open={open}
      onClose={() => {
        setOpen(false);
        setEditing(null);
      }}
      align="start"
      className="w-72"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`${barControl} flex-col !items-start !justify-center !gap-0 text-left`}
        >
          {label}
        </button>
      }
    >
      <ul role="listbox" aria-label="Versions" className="flex max-h-80 flex-col overflow-y-auto">
        {versions.map((version) => (
          <li key={version.id}>
            {editing === version.id ? (
              <form onSubmit={(event) => save(event, version)} className="flex items-center gap-2 px-2.5 py-1.5">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), setEditing(null))}
                  aria-label="Version number"
                  placeholder="v0.8"
                  aria-invalid={taken(version) || undefined}
                  autoFocus
                  className="min-w-0 flex-1 rounded-[var(--r-sm)] border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-border-strong focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Save version number"
                  disabled={!VERSION_NUMBER.test(draft.trim()) || taken(version)}
                  className="grid size-7 place-items-center rounded-[var(--r-sm)] text-foreground hover:bg-surface-hover disabled:opacity-30"
                >
                  <CheckIcon />
                </button>
              </form>
            ) : (
              <div className="flex items-center rounded-[var(--r-sm)] hover:bg-surface-hover">
                <button
                  type="button"
                  role="option"
                  aria-selected={version.id === selectedId}
                  onClick={() => {
                    onSelect(version);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                      {version.version}
                      {version.id === currentId ? (
                        <span className="text-2xs font-normal text-foreground-subtle">Current</span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-foreground-subtle">
                      <Stamp iso={version.createdAt} />
                    </span>
                  </span>
                  {version.id === selectedId ? <CheckIcon className="text-foreground" /> : null}
                </button>
                <button
                  type="button"
                  aria-label={`Rename ${version.version}`}
                  onClick={() => {
                    setDraft(version.version);
                    setEditing(version.id);
                  }}
                  className="mr-1 grid size-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-foreground-subtle hover:text-foreground"
                >
                  <PencilIcon />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </MotionPopover>
  );
}
