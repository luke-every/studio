"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TilePicture } from "@/components/home/tile-picture";
import { MotionModal } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";
import { latestPrototypes } from "@/lib/registry/select";
import { matchesPrototype } from "@/lib/search-store";
import type { Prototype } from "@/lib/registry/types";

import { SearchIcon } from "./nav-icons";

const MOST_SHOWN = 12;

/**
 * Search, floating over whatever page you are on. It opens with the cursor
 * already in the field; results are small versions of the feed's tiles and
 * appear as you type. Enter opens the first. "/" opens it from anywhere.
 */
export function SearchDialog({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: () => void }) {
  const router = useRouter();
  const { prototypes } = useStudio();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
      event.preventDefault();
      onOpen();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpen]);

  const close = () => {
    setQuery("");
    onClose();
  };

  // With nothing typed it offers the latest work.
  const results: Prototype[] = query.trim()
    ? prototypes
        .filter((prototype) => !prototype.archived && matchesPrototype(prototype, query))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MOST_SHOWN)
    : latestPrototypes(MOST_SHOWN, prototypes);

  return (
    <MotionModal open={open} onClose={close} label="Search" focusSelector="input" className="!max-w-[44rem] !p-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              router.push(`/prototypes/${results[0].slug}`);
              close();
            }
          }}
          placeholder="Search prototypes"
          aria-label="Search prototypes"
          className="h-12 w-full rounded-[var(--r-full)] bg-surface-hover pl-11 pr-4 text-base text-foreground placeholder:text-foreground-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {results.length ? (
        <ul className="mt-4 grid max-h-[60dvh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 [scrollbar-width:thin]">
          {results.map((prototype) => (
            <li key={prototype.slug}>
              <Link href={`/prototypes/${prototype.slug}`} onClick={close} className="group flex flex-col gap-2">
                <span className="flex h-36 items-center justify-center rounded-[var(--r-xl)] bg-tile py-3 hover-lift">
                  <span aria-hidden className="relative aspect-[9/19.5] h-full overflow-hidden rounded-[var(--r-device-sm)]">
                    {prototype.current.url ? (
                      <TilePicture url={prototype.current.url} title={`${prototype.name} ${prototype.current.version}`} />
                    ) : null}
                  </span>
                </span>
                <span className="truncate px-0.5 text-sm font-medium text-foreground">{prototype.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 pb-2 pt-4 text-sm text-foreground-muted">Nothing matches that.</p>
      )}
    </MotionModal>
  );
}
