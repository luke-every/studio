"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { VersionRail } from "@/components/prototype/version-rail";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { useStudio } from "@/lib/data/studio-store";
import { formatUpdated } from "@/lib/format";
import { avatarUrl } from "@/lib/registry/people";
import type { Prototype, PrototypeVersion } from "@/lib/registry/types";

/**
 * A prototype.
 *
 * Three things, in order of how much they matter: the prototype itself, what
 * it is, and how it got here. Everything else that used to be on this page —
 * a status, a context note, a separate design question — was metadata nobody
 * filled in honestly, and an empty field reads worse than no field.
 *
 * Choosing a version swaps the frame to that version's own files. The choice
 * lives in the URL, so a link to a particular version is a link somebody
 * else can open.
 */
export function PrototypeDetail({ prototype }: { prototype: Prototype }) {
  const { teams, markOpened } = useStudio();
  const fromUrl = useUrlVersion();
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    markOpened(prototype.slug);
  }, [markOpened, prototype.slug]);

  // The address bar is the source of truth for which version is on screen,
  // so a link to one is a link somebody else can open.
  const wanted = chosen ?? fromUrl;
  const selected =
    prototype.versions.find((version) => version.version === wanted) ?? prototype.current;

  const choose = (version: PrototypeVersion) => {
    setChosen(version.version);
    const url = new URL(window.location.href);
    if (version.id === prototype.current.id) url.searchParams.delete("v");
    else url.searchParams.set("v", version.version);
    window.history.replaceState(null, "", url);
  };

  const team = teams.find((candidate) => candidate.slug === prototype.teamSlug);
  const historic = selected.id !== prototype.current.id;

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <Link
        href={`/teams/${prototype.teamSlug}`}
        className="text-xs text-foreground-subtle transition-colors duration-[var(--dur-fast)] hover:text-foreground"
      >
        ← {team?.name ?? "Team"}
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
            {prototype.name}
          </h1>
          {prototype.description ? (
            <p className="mt-2 max-w-[68ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
              {prototype.description}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-xs text-foreground-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl(prototype.owner)}
            alt=""
            width={20}
            height={20}
            className="size-5 rounded-full bg-surface-inset"
          />
          <span>{prototype.owner.name}</span>
          <span aria-hidden>·</span>
          <span>{formatUpdated(prototype.updatedAt)}</span>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="min-w-0">
          {historic ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-foreground">
                Looking at {selected.version}, not the current version.
              </span>
              <button
                type="button"
                onClick={() => choose(prototype.current)}
                className="text-foreground-muted underline underline-offset-2 hover:text-foreground"
              >
                Back to {prototype.current.version}
              </button>
            </div>
          ) : null}

          <PrototypeFrame
            url={selected.url}
            title={`${prototype.name} ${selected.version}`}
            className="h-[min(78dvh,52rem)] w-full"
          />
        </div>

        <aside className="min-w-0">
          <h2 className="text-eyebrow">Versions</h2>
          <div className="mt-2">
            <VersionRail
              versions={prototype.versions}
              selectedId={selected.id}
              currentId={prototype.current.id}
              onSelect={choose}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Which version the address bar is asking for.
 *
 * Read as an external store rather than with useSearchParams, which would
 * force this page out of prerendering and put a server round trip in front
 * of every prototype. The server snapshot is null, so the page ships showing
 * the current version and corrects itself on hydration if a link asked for
 * another one.
 */
function useUrlVersion() {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("v"),
    () => null,
  );
}
