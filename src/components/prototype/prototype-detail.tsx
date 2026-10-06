"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { ControlsPanel } from "@/components/prototype/controls-panel";
import { usePrototypeControls } from "@/components/prototype/use-prototype-controls";
import { PrototypeLinks } from "@/components/prototype/prototype-links";
import { PrototypeMenu } from "@/components/prototype/prototype-menu";
import { VersionMenu } from "@/components/prototype/version-menu";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { applyControls, defaultValues, type ControlValues } from "@/lib/controls";
import { useStudio } from "@/lib/data/studio-store";
import { Stamp } from "@/components/ui/stamp";
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
  const { markOpened, renameVersion } = useStudio();
  const fromUrl = useUrlVersion();
  // Chosen by id, so renaming a version doesn't lose it.
  const [chosenId, setChosenId] = useState<string | null>(null);

  useEffect(() => {
    markOpened(prototype.slug);
  }, [markOpened, prototype.slug]);

  // The address bar is the source of truth for which version is on screen,
  // so a link to one is a link somebody else can open.
  const selected =
    prototype.versions.find((version) => version.id === chosenId) ??
    prototype.versions.find((version) => version.version === fromUrl) ??
    prototype.current;

  const showInAddressBar = (version: PrototypeVersion) => {
    const url = new URL(window.location.href);
    if (version.id === prototype.current.id) url.searchParams.delete("v");
    else url.searchParams.set("v", version.version);
    window.history.replaceState(null, "", url);
  };

  const choose = (version: PrototypeVersion) => {
    setChosenId(version.id);
    showInAddressBar(version);
  };

  const rename = async (version: PrototypeVersion, label: string) => {
    const saved = await renameVersion({ slug: prototype.slug, versionId: version.id, label });
    if (saved && version.id === selected.id) showInAddressBar({ ...version, version: label });
    return saved;
  };

  // What the prototype offers to adjust, if anything. The choices belong to
  // the version on screen, so switching version starts again from defaults.
  const offered = usePrototypeControls(selected.url);
  const [picked, setPicked] = useState<{ id: string; values: ControlValues }>({ id: "", values: {} });
  const mine = picked.id === selected.id ? picked.values : {};
  const values = { ...defaultValues(offered), ...mine };
  const address = selected.url ? applyControls(selected.url, offered, values) : undefined;

  return (
    <div className="w-full px-5 py-6 sm:px-8 sm:py-8">
      <PrototypeFrame
        url={address}
        // The tile's picture shows the default setup, so only use it as the
        // placeholder while the prototype is at its defaults.
        poster={selected.url && address === selected.url ? `${selected.url}/studio-preview.jpg` : undefined}
        controls={
          offered ? (
            <ControlsPanel
              controls={offered}
              values={values}
              onChange={(id, value) => setPicked({ id: selected.id, values: { ...mine, [id]: value } })}
            />
          ) : undefined
        }
        title={`${prototype.name} ${selected.version}`}
        leading={
          <VersionMenu
            versions={prototype.versions}
            selectedId={selected.id}
            currentId={prototype.current.id}
            onSelect={choose}
            onRename={rename}
          />
        }
      />

      <div className="mx-auto mt-8 w-full max-w-[var(--content-width)] pb-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
              {prototype.name}
            </h1>
            <p className="mt-2 text-base text-foreground-muted">
              {prototype.owner.name} · Last updated <Stamp iso={prototype.updatedAt} relative />
            </p>
          </div>
          <PrototypeMenu prototype={prototype} />
        </div>

        <p className="mt-5 text-base leading-[var(--leading-relaxed)] text-foreground-muted">
          {prototype.description || "A short description of what this prototype is and the question it is asking will go here."}
        </p>

        <div className="mt-6">
          <PrototypeLinks prototype={prototype} />
        </div>
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
