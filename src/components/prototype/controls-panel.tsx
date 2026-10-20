"use client";

import { useState, type ReactNode } from "react";

import { MotionPopover } from "@/components/motion";
import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { controlOn, IconButton } from "@/components/ui/button";
import { visibleControls, type ControlValues, type Controls } from "@/lib/controls";

/** The controls a prototype offers, as buttons, down the side of the page: a choice is a row of options, a toggle a switch. */
export function ControlsPanel({
  controls,
  values,
  onChange,
}: {
  controls: Controls;
  values: ControlValues;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {visibleControls(controls, values).map((control) => (
        <div key={control.id} className="flex flex-col gap-2">
          <p className="flex justify-between gap-2 text-base text-foreground">
            {control.label}
            {control.type === "range" ? <span className="text-foreground-subtle">{values[control.id] ?? control.default}</span> : null}
          </p>

          {control.type === "range" ? (
            <input
              type="range"
              aria-label={control.label}
              min={control.min}
              max={control.max}
              step={control.step}
              value={values[control.id] ?? control.default}
              onChange={(event) => onChange(control.id, event.target.value)}
              className="w-full accent-accent"
            />
          ) : control.type === "choice" ? (
            <div role="radiogroup" aria-label={control.label} className="flex flex-wrap gap-2">
              {control.options.map((option) => {
                const selected = values[control.id] === option.value;
                return (
                  <IconButton
                    key={option.value}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange(control.id, option.value)}
                    className={selected ? controlOn : ""}
                  >
                    {option.label}
                  </IconButton>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={values[control.id] === "on"}
              aria-label={control.label}
              onClick={() => onChange(control.id, values[control.id] === "on" ? "off" : "on")}
              className={`flex h-6 w-10 items-center rounded-[var(--r-full)] p-0.5 ${
                values[control.id] === "on" ? "justify-end bg-accent" : "justify-start bg-tile"
              }`}
            >
              <span className="size-5 rounded-[var(--r-full)] bg-surface" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** The variants made in the studio: the version as it is, and each named set of edits to show on top of it. */
export function VariantPicker({
  variants,
  value,
  onChange,
}: {
  variants: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const options = [{ id: null, label: "Baseline" }, ...variants];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-foreground">Variants</p>
      <div role="radiogroup" aria-label="Variants" className="flex flex-wrap gap-2">
        {options.map((option) => (
          <IconButton
            key={option.id ?? "baseline"}
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={value === option.id ? controlOn : ""}
          >
            {option.label}
          </IconButton>
        ))}
      </div>
    </div>
  );
}

/** On a phone the variants and controls are one dropdown at the foot of the prototype, opening upward, instead of a block beside it. */
export function VariantsDropdown({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="center"
      above
      className="w-[min(20rem,calc(100vw-2rem))]"
      trigger={
        <IconButton onClick={() => setOpen((value) => !value)} aria-haspopup="true" aria-expanded={open}>
          {label}
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </IconButton>
      }
    >
      <div className="flex max-h-[50svh] flex-col gap-6 overflow-y-auto p-3 [scrollbar-width:thin]">{children}</div>
    </MotionPopover>
  );
}
