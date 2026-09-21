"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion as m } from "motion/react";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { useStudio } from "@/lib/data/studio-store";
import { layoutId, useMotionLanguage } from "@/lib/motion";

const sections = [
  { href: "/", label: "Overview" },
  { href: "/prototypes", label: "All prototypes" },
  { href: "/archive", label: "Archive" },
];

function NavLink({
  href,
  label,
  active,
  muted = false,
}: {
  href: string;
  label: string;
  active: boolean;
  muted?: boolean;
}) {
  const motion = useMotionLanguage();

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] ${
        active
          ? "text-foreground"
          : muted
            ? "text-foreground-subtle hover:text-foreground"
            : "text-foreground-muted hover:text-foreground"
      }`}
    >
      {active ? (
        <m.span
          layoutId={layoutId.navIndicator}
          transition={motion.enter("spatial")}
          className="absolute inset-0 rounded-[var(--r-sm)] bg-surface-hover"
        />
      ) : null}
      <span className="relative truncate">{label}</span>
    </Link>
  );
}

/**
 * The side nav is the fixed frame of the studio: it never unmounts, so the
 * active indicator travels between destinations rather than being redrawn,
 * and the content area is the only thing that changes on navigation.
 */
export function SideNav() {
  const pathname = usePathname();
  const { projects } = useStudio();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="flex h-full flex-col gap-7 px-4 py-5">
      <Link href="/" className="px-2.5 text-sm font-medium tracking-[var(--tracking-tight)]">
        Prototype Studio
      </Link>

      <div className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <NavLink
            key={section.href}
            href={section.href}
            label={section.label}
            active={isActive(section.href)}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <p className="px-2.5 text-eyebrow">Projects</p>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {projects.map((project) => (
            <NavLink
              key={project.slug}
              href={`/projects/${project.slug}`}
              label={project.name}
              active={pathname === `/projects/${project.slug}`}
              muted
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-divider px-2.5 pt-4">
        <span className="text-xs text-foreground-subtle">Luke</span>
        <ThemeSwitcher />
      </div>
    </nav>
  );
}
