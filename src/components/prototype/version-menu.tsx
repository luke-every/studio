"use client";

import { barControl, IconButton } from "@/components/ui/button";
import { useState } from "react";

import { canHover, MotionPopover } from "@/components/motion";
import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { menuItem } from "@/components/ui/menu-item";
import { Stamp } from "@/components/ui/stamp";
import type { PrototypeVersion } from "@/lib/registry/types";

/**
 * The version, and when it was made. With more than one it is a button that
 * opens the list; with one there is nothing to choose, so it is plain text.
 */
export function VersionMenu({
  versions,
  selectedId,
  onSelect,
}: {
  versions: PrototypeVersion[];
  selectedId: string;
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
      onOpen={() => setOpen(true)}
      align="start"
      className="w-64"
      trigger={
        <IconButton onClick={() => setOpen((value) => canHover() || !value)} aria-haspopup="listbox" aria-expanded={open}>
          {label}
        </IconButton>
      }
    >
      <ul role="listbox" aria-label="Versions" className="flex max-h-96 flex-col overflow-y-auto">
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
                className={`${menuItem} justify-between text-foreground ${on ? "bg-surface-hover" : ""}`}
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span>{version.version}</span>
                  <span className="truncate text-sm text-foreground-subtle">
                    <Stamp iso={version.createdAt} />
                  </span>
                </span>
                {on ? (
                  <span className="shrink-0 rounded-[var(--r-full)] bg-surface-inset px-1.5 py-0.5 text-xs font-medium text-foreground-muted">Currently viewing</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </MotionPopover>
  );
}
