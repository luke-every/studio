"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion as m } from "motion/react";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { layoutId, useMotionLanguage } from "@/lib/motion";

const destinations = [
  { href: "/", label: "Prototypes" },
  { href: "/archive", label: "Archive" },
];

export function Masthead() {
  const pathname = usePathname();
  const motion = useMotionLanguage();

  return (
    <header
      data-theme-transition
      className="sticky top-0 border-b border-divider bg-background/85 backdrop-blur-xl"
      style={{ zIndex: "var(--z-sticky)" }}
    >
      <div className="mx-auto flex h-14 w-full max-w-[var(--bp-xl)] items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="font-serif text-md tracking-[var(--tracking-tight)] text-foreground"
        >
          Prototype Studio
        </Link>

        <nav className="flex items-center gap-1">
          {destinations.map((destination) => {
            const active =
              destination.href === "/"
                ? pathname === "/" || pathname.startsWith("/prototypes")
                : pathname.startsWith(destination.href);

            return (
              <Link
                key={destination.href}
                href={destination.href}
                className="relative rounded-[var(--r-full)] px-3 py-1.5 text-sm text-foreground-muted transition-colors duration-[var(--dur-fast)] hover:text-foreground"
                data-active={active || undefined}
              >
                {active ? (
                  <m.span
                    layoutId={layoutId.navIndicator}
                    transition={motion.enter("spatial")}
                    className="absolute inset-0 rounded-[var(--r-full)] bg-surface-hover"
                  />
                ) : null}
                <span className="relative">{destination.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
