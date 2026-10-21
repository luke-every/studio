"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { ViewMenu } from "@/components/prototype/view-menu";
import { ControlsPanel, VariantPicker, VariantsDropdown } from "@/components/prototype/controls-panel";
import { useVersionVariants } from "@/components/prototype/use-version-variants";
import { usePrototypeControls } from "@/components/prototype/use-prototype-controls";
import { usePrototypeFlow } from "@/components/prototype/use-prototype-flow";
import { ColumnHandle, RevealTab } from "@/components/prototype/column-handle";
import { PrototypeMenu } from "@/components/prototype/prototype-menu";
import { VersionMenu } from "@/components/prototype/version-menu";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { useLiveControls } from "@/components/prototype/use-live-controls";
import { applyControls, controlParams, defaultValues, variantControl, type ControlValues } from "@/lib/controls";
import type { Flow } from "@/lib/flow";
import { VARIANT_PARAM } from "@/lib/edits";
import { useStudio } from "@/lib/data/studio-store";
import { useMediaQuery } from "@/lib/use-media-query";
import { DEFAULT_DEVICE } from "@/lib/phone";
import { useDevice, useFit, useZoom } from "@/lib/use-device";
import { AvatarStack } from "@/components/shell/user-avatar";
import { Stamp } from "@/components/ui/stamp";
import { collaborators } from "@/lib/registry/select";
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
  const { markOpened, repoUrl } = useStudio();
  const people = collaborators(prototype);
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

  // What the prototype offers to adjust, if anything. The choices belong to
  // the version on screen, so switching version starts again from defaults.
  const offered = usePrototypeControls(selected.url);
  // Editing and dev mode take the page over: the side column steps aside for a panel next to the canvas.
  const [mode, setMode] = useState<"view" | "dev" | "edit" | "comment">("view");
  const [listing, setListing] = useState(false);
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

  // Comments are listed for the whole version; choosing one left on another setup puts the prototype in that setup.
  const showSetup = (setup: string) => {
    const params = new URLSearchParams(setup);
    const next: ControlValues = {};
    for (const control of offered?.controls ?? []) {
      const raw = params.get(control.param ?? control.id);
      if (raw !== null) next[control.id] = control.type === "toggle" ? "on" : raw;
    }
    setPicked({ id: selected.id, values: next });
    chooseVariant(params.get(VARIANT_PARAM));
  };
  // Whether the controls and variants a setup names are known yet; they load after the page does.
  const canShow = (setup?: string) => {
    if (!setup) return true;
    const known = new Set((offered?.controls ?? []).map((control) => control.param ?? control.id));
    const made = new Set(variants.map((item) => item.id));
    return [...new URLSearchParams(setup)].every(([key, value]) => (key === VARIANT_PARAM ? made.has(value) : known.has(key)));
  };
  const setupLabel = (setup?: string) => {
    if (!offered && !variants.length) return null;
    if (!setup) return "Baseline";
    const params = new URLSearchParams(setup);
    const parts: string[] = [];
    for (const control of offered?.controls ?? []) {
      const raw = params.get(control.param ?? control.id);
      if (raw === null) continue;
      parts.push(
        control.type === "toggle"
          ? control.label
          : control.type === "range"
            ? `${control.label} ${raw}`
            : (control.options.find((option) => option.value === raw)?.label ?? raw),
      );
    }
    const made = variants.find((item) => item.id === params.get(VARIANT_PARAM));
    if (made) parts.push(made.label);
    return parts.join(" · ") || "Baseline";
  };

  // The prototype's variants as a canvas of their own: one screen for each option of the control that picks between them,
  // each with the setup (see `Comment`) it is, so a comment left on one belongs to that variant.
  const variantsCanvas = (() => {
    const control = variantControl(offered);
    if (!control || !selected.url) return null;
    const setups: Record<string, string> = {};
    const screens = control.options.map((option) => {
      const query = applyControls(selected.url!, offered, { ...defaultValues(offered), ...mine, [control.id]: option.value }).split("?")[1] ?? "";
      setups[option.value] = query;
      return { id: option.value, name: option.label, params: option.value === control.default ? {} : { [control.param ?? control.id]: option.value } };
    });
    return { flow: { screens, edges: [] } satisfies Flow, setups };
  })();

  // The flow, when it has one, is looked at instead of the prototype; like a mode, it takes the side column's room.
  const flow = usePrototypeFlow(address?.split("?")[0]);
  const [flowOpen, setFlowOpen] = useState(false);
  const showingFlow = flowOpen && !!address;
  // What the iframe is given: the address with `studio=1`, held still once the prototype can take control changes as messages.
  const frameUrl = useLiveControls(address, `${selected.url}|${variant ?? ""}`, controlParams(offered, values), showingFlow);
  // Commenting with the list (the comment button, or C) brings the list, which takes the column's room.
  const side = (mode === "view" || (mode === "comment" && !listing)) && !showingFlow;
  // The column can be dragged out of the way (and tapped back at the left edge); `drag` is how far it is being pulled while it is.
  const [hidden, setHidden] = useState(false);
  const [drag, setDrag] = useState(0);
  const wide = useMediaQuery("(min-width: 64rem)");
  const columnOpen = side && !(hidden && wide);
  // Full screen: the nav and the side column go, the prototype fills the window, and the column slides back in while the pointer is at the left edge.
  // The canvas is always looked at this way, whatever the choice was: closing it puts things back as they were.
  const [focusChoice, setFocus] = useState(false);
  // Command-period, as in Figma: everything but the prototype goes, and comes back the same way.
  const [bare, setBare] = useState(false);
  const focus = focusChoice || showingFlow || bare;
  const [peek, setPeek] = useState(false);
  const away = focus && !peek;
  // The nav is the shell's, so it is told through the document: it slides up out of the way while the page below grows into its place.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-fullscreen", focus);
    return () => document.documentElement.removeAttribute("data-fullscreen");
  }, [focus]);

  const githubUrl = repoUrl && selected.url ? `${repoUrl}/p/${selected.url.replace(/^\/p\//, "")}${selected.source ? "/_source" : ""}` : undefined;

  const versionMenu = (
    <VersionMenu
      versions={prototype.versions}
      selectedId={selected.id}
      onSelect={choose}
    />
  );

  // The variants and the controls the prototype offers: a block beside it on a wide screen, a dropdown at its foot on a phone.
  const picker = variantControl(offered);
  const variantsLabel = variants.length
    ? (variants.find((item) => item.id === variant)?.label ?? "Baseline")
    : picker
      ? (picker.options.find((option) => option.value === values[picker.id])?.label ?? picker.options[0].label)
      : "Options";
  const options =
    offered || variants.length ? (
      <>
        {variants.length ? <VariantPicker variants={variants} value={variant} onChange={chooseVariant} /> : null}
        {offered ? (
          <ControlsPanel controls={offered} values={values} onChange={(id, value) => setPicked({ id: selected.id, values: { ...mine, [id]: value } })} />
        ) : null}
      </>
    ) : null;

  // Two columns that always fit the window; whatever is bigger scrolls inside its own column.
  return (
    <div
      className={`flex w-full flex-col gap-6 pb-6 pt-2 sm:px-8 lg:relative lg:gap-4 lg:transition-[height,padding] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] overflow-x-clip lg:flex-row lg:items-stretch ${
        focus ? "lg:h-dvh lg:p-0" : "lg:h-[calc(100dvh-var(--nav-height))]"
      }`}
    >
      {focus && !bare ? (
        <div aria-hidden onPointerEnter={() => setPeek(true)} className="fixed inset-y-0 left-0 z-[var(--z-focus-mode)] w-3 max-lg:hidden" />
      ) : null}
      {side && !focus && !hidden ? <ColumnHandle offset={drag} onDrag={setDrag} onHide={() => setHidden(true)} /> : null}
      {side && !focus && hidden && wide ? <RevealTab onShow={() => setHidden(false)} /> : null}
      {/* Closing up rather than unmounting, so it slides away as the panel opens beside the canvas. */}
      <aside
        inert={focus ? away : !columnOpen}
        // While the column is being pulled, the room it leaves goes to the prototype as it goes.
        style={drag ? { width: `max(0px, calc(var(--detail-side-width) + ${drag}px))`, transition: "none" } : undefined}
        onPointerLeave={() => setPeek(false)}
        className={`stagger-in [--i:0] sm:[--i:1] lg:[--i:0] order-1 min-w-0 px-5 sm:order-2 sm:px-0 lg:relative lg:order-1 lg:flex lg:shrink-0 lg:px-0 lg:transition-[width,margin,visibility] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${
          columnOpen && !focus
            ? "lg:w-[var(--detail-side-width)] lg:overflow-hidden"
            : focus
              ? // Closed up like any other mode, but its panel stays drawn so it can come back over the prototype.
                "lg:z-[var(--z-focus-mode)] lg:-mr-4 lg:w-0 lg:[transform:translateZ(0)] lg:[&>div]:border lg:[&>div]:border-border"
              : "invisible max-lg:hidden lg:-mr-4 lg:w-0 lg:overflow-hidden"
        }`}
      >
      {/* It travels left and fades as the column closes, at the same pace as the panel arrives. */}
      <div
        style={drag ? { translate: `${drag}px 0`, transition: "none" } : undefined}
        className={`flex min-w-0 flex-1 flex-col gap-6 lg:w-[var(--detail-side-width)] lg:flex-none lg:rounded-[var(--r-tile)] lg:bg-tile lg:p-8 lg:transition-[translate,opacity] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${
          (focus ? !away : columnOpen) ? "" : "lg:-translate-x-full lg:opacity-0"
        }`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2">
              <h1 className="min-w-0 flex-1 text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">{prototype.name}</h1>
              <PrototypeMenu
                prototype={prototype}
                version={selected.version}
                githubUrl={githubUrl}
                onEdit={selected.url && !showingFlow ? () => (setListing(false), setMode("edit")) : undefined}
              />
            </div>
            <p className="flex items-center gap-1.5 text-ui text-foreground-subtle">
              <AvatarStack people={people} className="size-5" overlap="-ml-1.5" ring="ring-tile" />
              <span className="text-foreground-muted">{people.length > 2 ? `${people[0].name} +${people.length - 1}` : people.map((person) => person.name).join(", ")}</span>
              <span aria-hidden>·</span>
              <span>
                Last updated <Stamp iso={prototype.updatedAt} relative />
              </span>
            </p>
          </div>
          {prototype.archived ? <p className="text-ui text-foreground-subtle">Archived. It is out of the feeds until it is unarchived.</p> : null}
          <p className="text-base leading-[var(--leading-relaxed)] text-foreground-muted">
            {prototype.description || "A short description of what this prototype is and the question it is asking will go here."}
          </p>
        </div>

        {/* The variants, when there are some, in a framed block that fills what is left. On a phone they are a dropdown under the prototype instead. */}
        <div className="min-h-0 flex-1 max-sm:hidden">
          {options ? (
            <div className="flex max-h-full flex-col gap-6 overflow-y-auto rounded-[var(--r-control)] border border-border p-4 [scrollbar-width:thin]">
              {options}
            </div>
          ) : null}
        </div>

      </div>
      </aside>

      <div className="stagger-in [--i:1] sm:[--i:0] lg:[--i:1] order-2 min-w-0 flex-1 sm:order-1 lg:order-2 lg:min-h-0">
        <PrototypeFrame
          url={frameUrl}
          openUrl={address}
          device={device}
          onDevice={chooseDevice}
          zoom={zoom}
          fit={fit}
          center={({ scale }) => (
            <ViewMenu device={device} zoom={zoom} fit={fit} fitted={scale} onDevice={chooseDevice} onZoom={chooseZoom} onFit={chooseFit} />
          )}
          // The tile's picture is of the default phone and setup, so it is only
          // the placeholder while the prototype is shown that way.
          poster={
            selected.url && address === selected.url && device.id === DEFAULT_DEVICE.id
              ? `${selected.url}/studio-preview.jpg`
              : undefined
          }
          edit={{ slug: prototype.slug, versionId: selected.id, variantId: variant ?? undefined }}
          comments={{ slug: prototype.slug, version: selected.key, variant: address?.split("?")[1] || undefined, onSetup: showSetup, canShow, setupLabel }}
          flow={flow}
          variants={variantsCanvas}
          flowOpen={flowOpen}
          onFlowOpen={setFlowOpen}
          mode={mode}
          onMode={setMode}
          listing={listing}
          onListing={setListing}
          fullscreen={focus}
          bare={bare}
          onBare={(next) => {
            setBare(next);
            setPeek(false);
          }}
          onFullscreen={(next) => {
            // On the canvas it is full screen already, and a choice made there would only show once it is closed.
            if (showingFlow) return;
            setFocus(next);
            setPeek(false);
          }}
          title={`${prototype.name} ${selected.version}`}
          leading={versionMenu}
          share={{ slug: prototype.slug, versionKey: selected.key, version: selected.version }}
          bottom={options ? <VariantsDropdown label={variantsLabel}>{options}</VariantsDropdown> : undefined}
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
