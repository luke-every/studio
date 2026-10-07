"use client";

import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { CheckIcon, ChevronDownIcon } from "@/components/shell/nav-icons";
import { barControl } from "@/components/ui/button";

export type View = "design" | "wireframe" | "dev";

const VIEWS: { id: View; name: string; hint: string }[] = [
  { id: "design", name: "Design", hint: "As it was made" },
  { id: "wireframe", name: "Wireframe", hint: "Structure, without the styling" },
  { id: "dev", name: "Dev mode", hint: "Code, classes and motion" },
];

/** How the prototype is looked at: as designed, as a wireframe, or with its code beside it. */
export function ViewMenu({ view, onChange, canDev = true }: { view: View; onChange: (view: View) => void; canDev?: boolean }) {
  const [open, setOpen] = useState(false);
  const options = VIEWS.filter((option) => canDev || option.id !== "dev");

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="end"
      className="w-80"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="View"
          className={barControl}
        >
          {VIEWS.find((option) => option.id === view)?.name}
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </button>
      }
    >
      <ul role="listbox" aria-label="View" className="flex flex-col">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              role="option"
              aria-selected={option.id === view}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <span className="flex flex-1 flex-col">
                <span className="font-medium text-foreground">{option.name}</span>
                <span className="text-foreground-subtle">{option.hint}</span>
              </span>
              <span className="grid size-4 place-items-center">{option.id === view ? <CheckIcon className="text-foreground" /> : null}</span>
            </button>
          </li>
        ))}
      </ul>
    </MotionPopover>
  );
}
