/** The studio's mark: a square with an E in it. Foreground on background, so it inverts with the theme. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Every Studio"
      className={`grid size-7 shrink-0 place-items-center rounded-[var(--r-sm)] bg-foreground text-md font-semibold leading-none text-background ${className}`}
    >
      E
    </span>
  );
}
