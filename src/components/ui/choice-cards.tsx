import type { ReactNode } from "react";

/** Two or three choices side by side, each an icon over a name and a line: the first step of a dialog that asks which of them. One can be marked as the one chosen before. */
export function ChoiceCards({
  options,
}: {
  options: { label: string; about: string; icon: ReactNode; chosen?: boolean; disabled?: boolean; title?: string; onClick: () => void }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          title={item.title}
          onClick={item.onClick}
          className={`flex flex-col items-center gap-3 rounded-[var(--r-md)] border px-3 py-6 text-center transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] focus-visible:border-border-strong focus-visible:outline-none enabled:hover:bg-[var(--control-hover)] disabled:opacity-50 ${
            item.chosen ? "border-border-strong" : "border-border"
          }`}
        >
          {item.icon}
          <span className="flex flex-col gap-0.5">
            <span className="text-base">{item.label}</span>
            <span className="text-sm text-foreground-muted">{item.about}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
