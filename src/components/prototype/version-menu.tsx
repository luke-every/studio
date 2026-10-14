"use client";

import { barControl, IconButton } from "@/components/ui/button";
import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { Stamp } from "@/components/ui/stamp";
import type { PrototypeVersion } from "@/lib/registry/types";

/**
 * The version, and when it was made. With more than one it is a button that
 * opens the list; with one there is nothing to choose, so it is plain text.
 */
export function VersionMenu({
  versions,
  selectedId,
  currentId,
  onSelect,
}: {
  versions: PrototypeVersion[];
  selectedId: string;
  currentId: string;
  onSelect: (version: PrototypeVersion) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];

  const label = (
    <>
      {selected.version}
      {versions.length > 1 ? <ChevronDownIcon className="size-3.5 text-foreground-subtle" /> : null}
    </>
  );

  if (versions.length < 2) return <div className={barControl}>{label}</div>;

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-80"
      trigger={
        <IconButton onClick={() => setOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={open}>
          {label}
        </IconButton>
      }
    >
      <ul role="listbox" aria-label="Versions" className="flex max-h-96 flex-col gap-1 overflow-y-auto">
        {versions.map((version) => {
          const on = version.id === selectedId;
          return (
            <li key={version.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onSelect(version);
                  setOpen(false);
                }}
                className={`flex w-full flex-col gap-1 rounded-[var(--r-lg)] px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${on ? "bg-surface-hover" : "hover:bg-surface-hover"}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="text-base font-medium text-foreground">{version.version}</span>
                    <span className="truncate text-xs text-foreground-subtle">
                      <Stamp iso={version.createdAt} />
                    </span>
                  </span>
                  {version.id === currentId ? (
                    <span className="shrink-0 rounded-[var(--r-full)] bg-surface-inset px-2 py-0.5 text-xs font-medium text-foreground-muted">Current</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </MotionPopover>
  );
}
