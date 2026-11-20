"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MotionPopover } from "@/components/motion";
import { controlOn, IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { useHoverOpen } from "@/lib/use-hover-open";

import { CheckIcon, ChevronDownIcon } from "./nav-icons";

const item =
  "flex w-full items-center justify-between gap-3 rounded-[var(--r-control)] px-2.5 py-2 text-left text-nav hover:bg-surface-hover";

/** Home and the teams, and which of them you are in. */
function useEntries() {
  const pathname = usePathname();
  const { teams } = useStudio();

  const visible = teams.filter((team) => !team.archived);
  const current = visible.find(
    (team) => pathname === `/teams/${team.slug}` || pathname.startsWith(`/teams/${team.slug}/`),
  );

  const entries = [{ href: "/", label: "Prototypes", selected: !current }].concat(
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
  const pathname = usePathname();
  const onPulse = pathname === PULSE_HREF;
  const onStorybook = pathname === STORYBOOK_HREF;

  return (
    <nav aria-label="Teams" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {entries.map((entry) => (
        <IconButton key={entry.href} href={entry.href} className={entry.selected && !onPulse && !onStorybook ? controlOn : ""}>
          {entry.label}
        </IconButton>
      ))}
      {SHOW_STORYBOOK ? (
        <IconButton href={DESIGN_QA_HREF} className={pathname === DESIGN_QA_HREF ? controlOn : ""}>
          Design QA
        </IconButton>
      ) : null}
      {SHOW_STORYBOOK ? (
        <IconButton href={STORYBOOK_HREF} className={onStorybook ? controlOn : ""}>
          Storybook
        </IconButton>
      ) : null}
    </nav>
  );
}

const PULSE_HREF = "/pulse";
const STORYBOOK_HREF = "/storybook";
const DESIGN_QA_HREF = "/design-qa";
/** Local only: the tab is not built into the live studio. */
const SHOW_STORYBOOK = process.env.NODE_ENV === "development";

/** Design QA, beside Prototypes. On this machine only. */
export function DesignQaLink() {
  const on = usePathname() === DESIGN_QA_HREF;
  if (!SHOW_STORYBOOK) return null;

  return (
    <IconButton href={DESIGN_QA_HREF} className={on ? controlOn : ""} aria-current={on ? "page" : undefined}>
      Design QA
    </IconButton>
  );
}

/** Storybook, beside Weekly Pulse. Development only. */
export function StorybookLink() {
  const onStorybook = usePathname() === STORYBOOK_HREF;
  if (!SHOW_STORYBOOK) return null;

  return (
    <IconButton href={STORYBOOK_HREF} className={onStorybook ? controlOn : ""} aria-current={onStorybook ? "page" : undefined}>
      Storybook
    </IconButton>
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
      className="w-56"
      trigger={
        <IconButton onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
          {current?.name ?? "Prototypes"}
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
        <Link
          href="/archive"
          role="menuitem"
          onClick={() => setOpen(false)}
          className={`${item} mt-1 border-t border-border text-foreground-subtle`}
        >
          Archive
        </Link>
      </div>
    </MotionPopover>
    </div>
  );
}
