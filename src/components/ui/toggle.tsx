"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Two or more options in one frame, one of them on. The dark pill slides to
 * whichever is chosen. An option is an icon, a label or both, and is as wide
 * as that needs; an icon alone is named for assistive tech and on hover.
 */
export function Toggle<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; icon?: ReactNode; showLabel?: boolean }[];
  label: string;
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  // Where the chosen option is, so the pill can travel to it. Until it is measured the option paints its own pill.
  const [at, setAt] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const chosen = buttons.current.get(value);
    if (chosen) setAt({ left: chosen.offsetLeft, width: chosen.offsetWidth });
  }, [value, options.length]);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative inline-flex h-9 shrink-0 items-stretch rounded-[var(--r-control)] border border-border bg-surface p-0.5"
    >
      {at ? (
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-0 rounded-[calc(var(--r-control)-0.125rem)] bg-accent transition-[transform,width] duration-[var(--dur-fast)] ease-[var(--curve-standard)]"
          style={{ width: at.width, transform: `translateX(${at.left}px)` }}
        />
      ) : null}
      {options.map((option) => (
        <button
          key={option.id}
          ref={(element) => {
            if (element) buttons.current.set(option.id, element);
            else buttons.current.delete(option.id);
          }}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          aria-label={option.showLabel ? undefined : option.label}
          title={option.showLabel ? undefined : option.label}
          onClick={() => onChange(option.id)}
          className={`relative flex min-w-9 items-center justify-center gap-1.5 rounded-[calc(var(--r-control)-0.125rem)] px-3 text-ui font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
            option.id === value ? `text-accent-foreground ${at ? "" : "bg-accent"}` : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {option.icon}
          {option.showLabel ? option.label : null}
        </button>
      ))}
    </div>
  );
}
