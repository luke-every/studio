import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The studio's buttons. Every one is a pill, so a screen of them reads as one
 * family; the only choices are how much it asks for.
 *
 *   primary    the thing you came to do — solid, dark
 *   secondary  everything else — white, with a frame
 *   ghost      (icon buttons only) no fill until hovered, for chrome like the nav
 */
const base =
  "inline-flex shrink-0 items-center justify-center rounded-[var(--r-full)] text-ui font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] disabled:opacity-40";

const look = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-hover",
  ghost: "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
} as const;

type Look = keyof typeof look;

type Props = {
  /** `destructive` is a primary button for something that can't be taken back. */
  variant?: "primary" | "secondary" | "destructive";
  /** Renders a link instead, to an address in the studio or (with `external`) outside it. */
  href?: string;
  external?: boolean;
  /** Before the label. */
  icon?: ReactNode;
  /** Working on it: the label breathes and the button can't be pressed again. */
  loading?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Button({ variant = "secondary", href, external, icon, loading, children, className, ...rest }: Props) {
  const classes = `${base} ${look[variant]} h-10 gap-2 px-5 ${className ?? ""}`;
  const content = (
    <span className={`inline-flex items-center gap-2 ${loading ? "pulse-soft" : ""}`}>
      {icon}
      {children}
    </span>
  );

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {content}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined}>
      {content}
    </button>
  );
}

/**
 * A round button with just an icon. It says what it is on hover or focus, at
 * once, in a small label underneath — an icon alone doesn't.
 */
export function IconButton({
  label,
  variant = "secondary",
  href,
  external,
  tooltipAlign = "center",
  loading,
  children,
  className,
  ...rest
}: {
  label: string;
  /** Working on it: the icon breathes. */
  loading?: boolean;
  variant?: Extract<Look, "secondary" | "ghost">;
  href?: string;
  external?: boolean;
  tooltipAlign?: "center" | "end";
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "aria-label">) {
  const classes = `${base} ${look[variant]} size-10 ${className ?? ""}`;
  const tip = (
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full mt-2 whitespace-nowrap rounded-[var(--r-md)] bg-accent px-2.5 py-1 text-xs font-normal text-accent-foreground opacity-0 transition-opacity duration-[var(--dur-instant)] ease-[var(--curve-entrance)] group-hover/tip:opacity-100 peer-focus-visible:opacity-100 ${
        tooltipAlign === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
      }`}
      style={{ zIndex: "var(--z-popover)" }}
    >
      {label}
    </span>
  );

  return (
    <span className="group/tip relative inline-flex">
      {href && external ? (
        <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={`${classes} peer`}>
          {children}
        </a>
      ) : href ? (
        <Link href={href} aria-label={label} className={`${classes} peer`}>
          {children}
        </Link>
      ) : (
        <button type="button" aria-label={label} aria-busy={loading || undefined} className={`${classes} peer`} {...rest}>
          <span className={loading ? "pulse-soft" : ""}>{children}</span>
        </button>
      )}
      {tip}
    </span>
  );
}
