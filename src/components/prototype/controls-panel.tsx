"use client";

import { useState, type ReactNode } from "react";

import { MotionPopover } from "@/components/motion";
import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { controlOn, IconButton } from "@/components/ui/button";
import { multiValue, visibleControls, type ControlValues, type Controls } from "@/lib/controls";

/** What a control is set to, in words, for the header of one that is closed. */
function summary(control: Controls["controls"][number], values: ControlValues) {
  const value = values[control.id];
  if (control.type === "toggle") return value === "on" ? "On" : "Off";
  if (control.type === "range") return value ?? String(control.default);
  if (control.type === "multi") {
    const chosen = (value ?? "").split(",");
    return control.options.filter((option) => chosen.includes(option.value)).map((option) => option.label).join(", ") || "None";
  }
  return control.options.find((option) => option.value === value)?.label ?? "";
}

/** An option's name on its button: cut short, with the whole of it on hover, when it is very long. */
const OptionName = ({ children }: { children: string }) => (
  <span title={children} className="block max-w-[11rem] truncate">
    {children}
  </span>
);

/**
 * The controls a prototype offers, down the side of the page, each an accordion
 * with the first one open: a choice is a row of options with one on, a multi the same
 * with any number on, a toggle a switch. A closed one says what it is set to.
 */
export function ControlsPanel({
  controls,
  values,
  onChange,
}: {
  controls: Controls;
  values: ControlValues;
  onChange: (id: string, value: string) => void;
}) {
  const shown = visibleControls(controls, values);
  // Only the ones somebody has touched are kept; until then, the first is open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col [&_*:focus-visible]:outline-none">
      {shown.map((control, index) => {
        const open = toggled[control.id] ?? index === 0;
        return (
          <div key={control.id} className="border-t border-divider py-3 first:border-t-0 first:pt-0 last:pb-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setToggled((now) => ({ ...now, [control.id]: !open }))}
              className="flex w-full items-center justify-between gap-3 text-left text-base text-foreground"
            >
              <span className="shrink-0">{control.label}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-ui text-foreground-subtle">
                <span className="min-w-0 truncate">{summary(control, values)}</span>
                <ChevronDownIcon className={`size-3.5 shrink-0 transition-transform duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${open ? "rotate-180" : ""}`} />
              </span>
            </button>

            {/* Closed is a row of zero height, so it opens and closes by growing; the content stays mounted and is taken out of reach while closed. */}
            <div
              inert={!open}
              className={`grid transition-[grid-template-rows] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pt-2.5">
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
                ) : control.type === "multi" ? (
                  <div role="group" aria-label={control.label} className="flex flex-wrap gap-1.5">
                    {control.options.map((option) => {
                      const chosen = (values[control.id] ?? "").split(",");
                      const selected = chosen.includes(option.value);
                      return (
                        <IconButton
                          key={option.value}
                          size="sm"
                          aria-pressed={selected}
                          onClick={() =>
                            onChange(control.id, multiValue(control, selected ? chosen.filter((value) => value !== option.value) : [...chosen, option.value]))
                          }
                          className={`!text-xs ${selected ? controlOn : ""}`}
                        >
                          <OptionName>{option.label}</OptionName>
                        </IconButton>
                      );
                    })}
                  </div>
                ) : control.type === "choice" ? (
                  <div role="radiogroup" aria-label={control.label} className="flex flex-wrap gap-1.5">
                    {control.options.map((option) => {
                      const selected = values[control.id] === option.value;
                      return (
                        <IconButton
                          key={option.value}
                          size="sm"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => onChange(control.id, option.value)}
                          className={`!text-xs ${selected ? controlOn : ""}`}
                        >
                          <OptionName>{option.label}</OptionName>
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
              </div>
            </div>
          </div>
        );
      })}
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
    <div className="flex flex-col gap-2 [&_*:focus-visible]:outline-none">
      <p className="text-base text-foreground">Variants</p>
      <div role="radiogroup" aria-label="Variants" className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <IconButton
            key={option.id ?? "baseline"}
            size="sm"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={`!text-xs ${value === option.id ? controlOn : ""}`}
          >
            <OptionName>{option.label}</OptionName>
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
