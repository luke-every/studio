import type { ReactNode } from "react";

/**
 * Every view opens the same way: a small label, a plain title, and whatever
 * controls belong to the content beneath. Restraint here is what lets the
 * work itself be the loudest thing on the page.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-1.5 text-xl font-medium tracking-[var(--tracking-tight)] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[62ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
