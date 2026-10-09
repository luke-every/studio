"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { DeviceMenu } from "@/components/prototype/device-menu";
import { FitButton } from "@/components/prototype/fit-button";
import { ZoomMenu } from "@/components/prototype/zoom-menu";
import { ControlsPanel, VariantPicker } from "@/components/prototype/controls-panel";
import { useVersionVariants } from "@/components/prototype/use-version-variants";
import { usePrototypeControls } from "@/components/prototype/use-prototype-controls";
import { PrototypeLinks } from "@/components/prototype/prototype-links";
import { PrototypeMenu } from "@/components/prototype/prototype-menu";
import { VersionMenu } from "@/components/prototype/version-menu";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { applyControls, defaultValues, type ControlValues } from "@/lib/controls";
import { VARIANT_PARAM } from "@/lib/edits";
import { useStudio } from "@/lib/data/studio-store";
import { DEFAULT_DEVICE } from "@/lib/phone";
import { useDevice, useFit, useZoom } from "@/lib/use-device";
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
  const { markOpened, renameVersion, isSaving, repoUrl } = useStudio();
  const [device, chooseDevice] = useDevice();
  const [zoom, chooseZoom] = useZoom();
  const [fit, chooseFit] = useFit();
  const fromUrl = useUrlParam("v");
  const variantFromUrl = useUrlParam("variant");
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
    // A variant belongs to the version it was made on.
    setVariantChoice({ id: version.id, variant: null });
    const url = new URL(window.location.href);
    url.searchParams.delete("variant");
    window.history.replaceState(null, "", url);
    showInAddressBar(version);
  };

  const rename = (version: PrototypeVersion, label: string) => {
    renameVersion({ slug: prototype.slug, versionId: version.id, label }, ["version"], "Renamed");
    if (version.id === selected.id) showInAddressBar({ ...version, version: label });
  };

  // What the prototype offers to adjust, if anything. The choices belong to
  // the version on screen, so switching version starts again from defaults.
  const offered = usePrototypeControls(selected.url);
  // Editing and dev mode take the page over: the side column steps aside for a panel next to the canvas.
  const [mode, setMode] = useState<"view" | "dev" | "edit">("view");
  const [picked, setPicked] = useState<{ id: string; values: ControlValues }>({ id: "", values: {} });
  const mine = picked.id === selected.id ? picked.values : {};
  const values = { ...defaultValues(offered), ...mine };
  // Variants made in the studio for this version, and the one being shown: the choice, else the address bar's, else none.
  const variants = useVersionVariants(selected.url);
  const [variantChoice, setVariantChoice] = useState<{ id: string; variant: string | null } | null>(null);
  const asked = variantChoice?.id === selected.id ? variantChoice.variant : variantFromUrl;
  const variant = variants.find((item) => item.id === asked)?.id ?? null;
  const chooseVariant = (next: string | null) => {
    setVariantChoice({ id: selected.id, variant: next });
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("variant", next);
    else url.searchParams.delete("variant");
    window.history.replaceState(null, "", url);
  };

  const controlled = selected.url ? applyControls(selected.url, offered, values) : undefined;
  const address = controlled && variant ? `${controlled}${controlled.includes("?") ? "&" : "?"}${VARIANT_PARAM}=${variant}` : controlled;

  // Two columns that always fit the window; whatever is bigger scrolls inside its own column.
  return (
    <div className="flex w-full flex-col gap-6 py-4 sm:px-8 lg:gap-4 lg:h-[calc(100dvh-var(--nav-height))] overflow-x-clip lg:flex-row lg:items-stretch">
      {/* Closing up rather than unmounting, so it slides away as the panel opens beside the canvas. */}
      <aside
        inert={mode !== "view"}
        className={`order-2 min-w-0 px-5 sm:px-0 lg:order-1 lg:flex lg:shrink-0 lg:overflow-hidden lg:px-0 lg:transition-[width,margin,visibility] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${
          mode === "view" ? "lg:w-[var(--detail-side-width)]" : "invisible max-lg:hidden lg:-mr-4 lg:w-0"
        }`}
      >
      {/* It travels left and fades as the column closes, at the same pace as the panel arrives. */}
      <div
        className={`flex min-w-0 flex-1 flex-col gap-6 lg:w-[var(--detail-side-width)] lg:flex-none lg:px-4 lg:py-6 lg:transition-[translate,opacity] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${
          mode === "view" ? "" : "lg:-translate-x-full lg:opacity-0"
        }`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <h1 className="min-w-0 flex-1 text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
                {prototype.name}
              </h1>
              <PrototypeMenu prototype={prototype} version={selected.version} />
            </div>
            <p className="text-xs text-foreground-subtle">
              Last updated <Stamp iso={prototype.updatedAt} relative />
            </p>
          </div>
          <p className="text-base leading-[var(--leading-relaxed)] text-foreground-muted">
            {prototype.description || "A short description of what this prototype is and the question it is asking will go here."}
          </p>
        </div>

        {/* The variants, when there are some, in a framed block that fills what is left. */}
        <div className="min-h-0 flex-1">
          {offered || variants.length ? (
            <div className="flex max-h-full flex-col gap-6 overflow-y-auto rounded-[var(--r-control)] border border-border p-4 [scrollbar-width:thin]">
              {variants.length ? <VariantPicker variants={variants} value={variant} onChange={chooseVariant} /> : null}
              {offered ? (
                <ControlsPanel
                  controls={offered}
                  values={values}
                  onChange={(id, value) => setPicked({ id: selected.id, values: { ...mine, [id]: value } })}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <PrototypeLinks
          prototype={prototype}
          githubUrl={repoUrl && selected.url ? `${repoUrl}/p/${selected.url.replace(/^\/p\//, "")}` : undefined}
        />
      </div>
      </aside>

      <div className="order-1 min-w-0 flex-1 lg:order-2 lg:min-h-0">
        <PrototypeFrame
          url={address}
          device={device}
          zoom={zoom}
          fit={fit}
          center={({ scale }) => (
            <div className="flex items-center gap-2">
              <DeviceMenu device={device} onChange={chooseDevice} />
              <ZoomMenu
                zoom={zoom}
                fitted={fit ? scale : null}
                onChange={(next) => {
                  chooseZoom(next);
                  chooseFit(false);
                }}
              />
              <FitButton active={fit} onChange={chooseFit} />
            </div>
          )}
          // The tile's picture is of the default phone and setup, so it is only
          // the placeholder while the prototype is shown that way.
          poster={
            selected.url && address === selected.url && device.id === DEFAULT_DEVICE.id
              ? `${selected.url}/studio-preview.jpg`
              : undefined
          }
          edit={{ slug: prototype.slug, versionId: selected.id, variantId: variant ?? undefined }}
          mode={mode}
          onMode={setMode}
          title={`${prototype.name} ${selected.version}`}
          leading={
            <VersionMenu
              versions={prototype.versions}
              selectedId={selected.id}
              currentId={prototype.current.id}
              onSelect={choose}
              onRename={rename}
              saving={isSaving("version")}
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * Which version (or variant) the address bar is asking for.
 *
 * Read as an external store rather than with useSearchParams, which would
 * force this page out of prerendering and put a server round trip in front
 * of every prototype. The server snapshot is null, so the page ships showing
 * the current version and corrects itself on hydration if a link asked for
 * another one.
 */
function useUrlParam(name: string) {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
