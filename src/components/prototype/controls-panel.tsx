"use client";

import { visibleControls, type ControlValues, type Controls } from "@/lib/controls";

const pill = "rounded-[var(--r-full)] px-3 py-1.5 text-sm";

/** The controls a prototype offers, as buttons: a choice is a row of options, a toggle a switch. */
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
    <div className="flex flex-col gap-5">
      {visibleControls(controls, values).map((control) => (
        <div key={control.id} className="flex flex-col gap-2">
          <p className="text-sm text-foreground-muted">{control.label}</p>

          {control.type === "choice" ? (
            <div role="radiogroup" aria-label={control.label} className="flex flex-wrap gap-1.5">
              {control.options.map((option) => {
                const selected = values[control.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange(control.id, option.value)}
                    className={`${pill} ${
                      selected
                        ? "bg-accent font-medium text-accent-foreground"
                        : "bg-tile text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
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
