"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MotionPopover } from "@/components/motion";
import { controlOn, IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { useHoverOpen } from "@/lib/use-hover-open";

import { CheckIcon, ChevronDownIcon } from "./nav-icons";

const item =
  "flex w-full items-center justify-between gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-nav hover:bg-surface-hover";

/** Home and the teams, and which of them you are in. */
function useEntries() {
  const pathname = usePathname();
  const { teams } = useStudio();

  const visible = teams.filter((team) => !team.archived);
  const current = visible.find(
    (team) => pathname === `/teams/${team.slug}` || pathname.startsWith(`/teams/${team.slug}/`),
  );

  const entries = [{ href: "/", label: "Home", selected: !current }].concat(
    visible.map((team) => ({ href: `/teams/${team.slug}`, label: team.name, selected: team.slug === current?.slug })),
  );
  return { current, entries };
}

/**
 * On a phone, Home and the teams as a row of buttons that scrolls sideways,
 * instead of a menu.
 */
export function TeamRow() {
  const { entries } = useEntries();

  return (
    <nav aria-label="Teams" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {entries.map((entry) => (
        <IconButton key={entry.href} href={entry.href} className={entry.selected ? controlOn : ""}>
          {entry.label}
        </IconButton>
      ))}
    </nav>
  );
}

/**
 * Home's own place in the bar: "Home" with the teams under it. Choosing a team
 * opens its page; "Home" stays on the feed. Elsewhere the bar shows breadcrumbs.
 */
export function TeamMenu() {
  const { current, entries } = useEntries();
  const { open, setOpen, hoverProps } = useHoverOpen();

  return (
    <div {...hoverProps}>
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-48"
      trigger={
        <IconButton onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
          {current?.name ?? "Home"}
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </IconButton>
      }
    >
      <div role="menu" aria-label="Teams" className="flex flex-col">
        {entries.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            role="menuitemradio"
            aria-checked={entry.selected}
            onClick={() => setOpen(false)}
            className={`${item} ${entry.selected ? "text-foreground" : "text-foreground-muted"}`}
          >
            {entry.label}
            {entry.selected ? <CheckIcon className="text-foreground" /> : null}
          </Link>
        ))}
      </div>
    </MotionPopover>
    </div>
  );
}
