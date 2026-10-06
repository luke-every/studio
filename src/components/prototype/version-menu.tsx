"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon } from "@/components/shell/nav-icons";
import { Stamp } from "@/components/ui/stamp";
import type { PrototypeVersion } from "@/lib/registry/types";

/**
 * The version, and when it was made. With more than one it's a button that
 * opens the list; with one there is nothing to choose, so it's plain text.
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
      <span className="flex items-center gap-1 text-sm font-medium text-foreground">
        {selected.version}
        {versions.length > 1 ? <ChevronDownIcon className="size-3.5 text-foreground-subtle" /> : null}
      </span>
      <span className="block text-xs text-foreground-subtle"><Stamp iso={selected.createdAt} /></span>
    </>
  );

  if (versions.length < 2) return <div className="px-3 py-1.5">{label}</div>;

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-72"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="rounded-[var(--r-tag)] px-3 py-1.5 text-left hover:bg-surface-hover"
        >
          {label}
        </button>
      }
    >
      <ul role="listbox" aria-label="Versions" className="flex max-h-80 flex-col overflow-y-auto">
        {versions.map((version) => (
          <li key={version.id}>
            <button
              type="button"
              role="option"
              aria-selected={version.id === selectedId}
              onClick={() => {
                onSelect(version);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-left hover:bg-surface-hover"
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
          </li>
        ))}
      </ul>
    </MotionPopover>
  );
}
