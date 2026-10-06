"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";

import { CheckIcon, ChevronDownIcon } from "./nav-icons";

const item =
  "flex w-full items-center justify-between gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-nav hover:bg-surface-hover";

/**
 * Which team's work you're looking at, beside the logo: "All" until you pick
 * one. Choosing a team opens its page; "All" goes back to the feed.
 */
export function TeamMenu() {
  const pathname = usePathname();
  const { teams } = useStudio();
  const [open, setOpen] = useState(false);

  const visible = teams.filter((team) => !team.archived);
  const current = visible.find(
    (team) => pathname === `/teams/${team.slug}` || pathname.startsWith(`/teams/${team.slug}/`),
  );

  const entries = [{ href: "/", label: "All", selected: !current }].concat(
    visible.map((team) => ({ href: `/teams/${team.slug}`, label: team.name, selected: team.slug === current?.slug })),
  );

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      align="start"
      className="w-48"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Team"
          className="flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] px-3 py-1.5 text-nav font-medium text-foreground hover:bg-surface-hover"
        >
          {current?.name ?? "All"}
          <ChevronDownIcon className="size-3.5 text-foreground-subtle" />
        </button>
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
  );
}
