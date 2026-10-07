import { UserIcon } from "./nav-icons";

/** A number from a name, the same every time: a polynomial rolling hash, so "Luke" and "Luka" land far apart. */
function hash(name: string) {
  let h = 7;
  for (const char of name.toLowerCase())
    h = (h * 31 + char.charCodeAt(0)) % 360_007;
  return h;
}

/** Each person's own gradient: a hue from their name, shaded by the shared avatar tokens. */
export function userGradient(name: string) {
  const h = hash(name);
  const hue = h % 360;
  const angle = 120 + (h % 7) * 20;
  const stop = (lightness: string, hueShift: string) =>
    `oklch(var(${lightness}) var(--avatar-chroma) calc(${hue} + ${hueShift}))`;
  return `linear-gradient(${angle}deg, ${stop("--avatar-lightness-from", "0")}, ${stop("--avatar-lightness-to", "var(--avatar-hue-spread)")})`;
}

/** The circle user icon, over that person's gradient. A guest has no gradient, only a quiet fill. */
export function UserAvatar({
  name,
  className = "size-8",
  iconClassName = "size-1/2",
}: {
  name: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      aria-hidden
      style={name ? { background: userGradient(name) } : undefined}
      className={`grid shrink-0 place-items-center rounded-[var(--r-full)] ${name ? "text-[var(--avatar-ink)]" : "bg-surface-inset text-foreground-muted"} ${className}`}
    >
      <UserIcon className={iconClassName} />
    </span>
  );
}
