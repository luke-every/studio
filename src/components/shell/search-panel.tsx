"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TilePicture } from "@/components/home/tile-picture";
import { useStudio } from "@/lib/data/studio-store";
import { latestPrototypes } from "@/lib/registry/select";
import { matchesPrototype } from "@/lib/search-store";
import type { Prototype } from "@/lib/registry/types";

import { SearchIcon } from "./nav-icons";

const MOST_SHOWN = 12;

/**
 * The field and what it finds: small versions of the feed's tiles, appearing as you type, and the latest work when
 * nothing is typed. Enter opens the first. Shared by the floating search and the Search tab; `onPick` is called
 * whenever one is opened.
 */
export function SearchPanel({ onPick, listClassName }: { onPick: () => void; listClassName: string }) {
  const router = useRouter();
  const { prototypes } = useStudio();
  const [query, setQuery] = useState("");

  const results: Prototype[] = query.trim()
    ? prototypes
        .filter((prototype) => !prototype.archived && matchesPrototype(prototype, query))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MOST_SHOWN)
    : latestPrototypes(MOST_SHOWN, prototypes);

  return (
    <>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              router.push(`/prototypes/${results[0].slug}`);
              onPick();
            }
          }}
          placeholder="Search prototypes"
          aria-label="Search prototypes"
          className="h-12 w-full rounded-[var(--r-full)] bg-surface-hover pl-11 pr-4 text-base text-foreground placeholder:text-foreground-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {results.length ? (
        <ul className={`mt-4 grid gap-3 ${listClassName}`}>
          {results.map((prototype) => (
            <li key={prototype.slug}>
              <Link href={`/prototypes/${prototype.slug}`} onClick={onPick} className="group flex flex-col gap-2">
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
    </>
  );
}
