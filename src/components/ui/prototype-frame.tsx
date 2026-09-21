"use client";

/**
 * A prototype, at its own size.
 *
 * The phone-shaped thumbnail is a browsing device — it makes a grid read as
 * a set of screens. It has no business on the detail page, where the point
 * is to actually use the thing: here the prototype gets a plain frame, its
 * real width, and its own scrolling. Nothing is scaled and nothing is
 * cropped.
 */
export function PrototypeFrame({
  url,
  title,
  className,
  bleed = false,
}: {
  url?: string;
  title: string;
  className?: string;
  /** Fills the screen, for focus mode. */
  bleed?: boolean;
}) {
  if (!url) {
    return (
      <div
        className={`grid place-items-center rounded-[var(--r-lg)] border border-dashed border-border bg-surface-inset ${className ?? ""}`}
      >
        <p className="max-w-[28ch] px-6 text-center text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
          No files for this version yet. Add them with{" "}
          <span className="text-foreground-muted">npm run proto:add</span>.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden border border-border bg-surface ${
        bleed ? "rounded-[var(--r-md)]" : "rounded-[var(--r-lg)] shadow-[var(--elev-raised)]"
      } ${className ?? ""}`}
    >
      <iframe src={url} title={title} className="size-full border-0" />
    </div>
  );
}
