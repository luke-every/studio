"use client";

import { useEffect } from "react";

import { useSearch } from "@/lib/search-store";

/**
 * The search field.
 *
 * It sits directly under Home because that is where the eye already is on
 * arrival: tap once and start typing. There is no submit and no results page
 * — the view the user is already looking at narrows as they type.
 */
export function SearchField({ tabIndex }: { tabIndex?: number }) {
  const { query, setQuery, clear, register } = useSearch();

  // "/" from anywhere puts the cursor here, the way it does in a browser.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (typing) return;
      event.preventDefault();
      document.getElementById("studio-search")?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      >
        <circle cx="7.25" cy="7.25" r="4.25" />
        <path d="m10.5 10.5 2.5 2.5" />
      </svg>

      <input
        id="studio-search"
        ref={register}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            clear();
            event.currentTarget.blur();
          }
        }}
        placeholder="Search prototypes"
        tabIndex={tabIndex}
        aria-label="Search prototypes"
        className="h-12 w-full rounded-[var(--r-full)] bg-surface-hover pl-12 pr-12 text-base text-foreground placeholder:text-foreground-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />

      {query ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-4 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[var(--r-full)] text-foreground-subtle hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
            <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
