"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { VersionMenu } from "@/components/prototype/version-menu";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { useStudio } from "@/lib/data/studio-store";
import { Stamp } from "@/components/ui/stamp";
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
  const { markOpened } = useStudio();
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

  return (
    <div className="w-full px-5 py-6 sm:px-8 sm:py-8">
      <PrototypeFrame
        url={selected.url}
        title={`${prototype.name} ${selected.version}`}
        leading={
          <VersionMenu
            versions={prototype.versions}
            selectedId={selected.id}
            currentId={prototype.current.id}
            onSelect={choose}
          />
        }
      />

      <div className="mt-6 px-1 pb-6">
        <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
          {prototype.name}
        </h1>

        <div className="mt-3 flex items-center gap-2 text-base text-foreground-muted">
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
          <span><Stamp iso={prototype.updatedAt} /></span>
        </div>

        <p className="mt-4 max-w-[68ch] text-base leading-[var(--leading-relaxed)] text-foreground-muted">
          {prototype.description || "A short description of what this prototype is and the question it is asking will go here."}
        </p>
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
