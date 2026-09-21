import type { PreviewSource } from "@/lib/data/types";

/**
 * A team has no artwork of its own — it is represented by what is inside it.
 * Three of its most recent screens, overlapped on a plain surface, so the
 * tile reads as a shelf of work rather than a single image.
 */
export function TeamThumbnail({
  previews,
  className,
  compact = false,
}: {
  previews: PreviewSource[];
  className?: string;
  compact?: boolean;
}) {
  const shown = previews.slice(0, 3);
  const empty = shown.length === 0;

  return (
    <div
      className={`relative isolate grid place-items-center overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface-inset ${className ?? ""}`}
    >
      {empty ? (
        <span className="text-2xs uppercase tracking-[var(--tracking-caps)] text-foreground-subtle">
          Nothing yet
        </span>
      ) : (
        <div className={`flex items-end ${compact ? "gap-1" : "gap-2 sm:gap-2.5"}`}>
          {shown.map((preview, index) => {
            // The lead screen stands slightly taller than the two beside it.
            const lead = index === 0;
            const height = compact ? (lead ? 76 : 64) : lead ? 74 : 62;

            return (
              <div
                key={preview.caption}
                className={`aspect-device overflow-hidden ${
                  compact
                    ? "rounded-[calc(var(--r-device-sm)*0.8)]"
                    : "rounded-[var(--r-device-sm)]"
                } shadow-[var(--elev-device)] ring-1 ring-inset ring-[#000]/10`}
                style={{
                  height: `${height}%`,
                  backgroundImage: `linear-gradient(155deg, ${preview.tint[0]}, ${preview.tint[1]})`,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
