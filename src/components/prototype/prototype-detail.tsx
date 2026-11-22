"use client";

import { useAddTemplate } from "@/components/prototype/add-template";
import { useEditComponent } from "@/components/prototype/use-fork";
import { CanvasNameMenu } from "@/components/prototype/canvas-name-menu";
import { CopyDocsMenu } from "@/components/prototype/copy-docs-menu";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ViewMenu } from "@/components/prototype/view-menu";
import { ControlsPanel, VariantPicker, VariantsDropdown } from "@/components/prototype/controls-panel";
import { useVersionVariants } from "@/components/prototype/use-version-variants";
import { usePrototypeControls } from "@/components/prototype/use-prototype-controls";
import { usePrototypeFlow } from "@/components/prototype/use-prototype-flow";
import { PrototypeMenu } from "@/components/prototype/prototype-menu";
import { VersionMenu } from "@/components/prototype/version-menu";
import { hintFullscreen } from "@/lib/fullscreen-hint";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { useLiveControls } from "@/components/prototype/use-live-controls";
import { applyControls, controlParams, controlsInWords, defaultValues, splitQuery, variantControl, type ControlValues } from "@/lib/controls";
import { withParams, type Flow } from "@/lib/flow";
import { VARIANT_PARAM } from "@/lib/edits";
import { useStudio } from "@/lib/data/studio-store";
import { DEFAULT_DEVICE } from "@/lib/phone";
import { useDevice, useFit, useInApp, useZoom } from "@/lib/use-device";
import { SelectionPanel } from "@/components/handoff/part-panel";
import { useHandoffData } from "@/components/handoff/use-handoff-data";
import { useHandoffStatus } from "@/components/handoff/use-handoff-status";
import type { Selection } from "@/lib/handoff-selection";
import { markHandoffComponent, reviewToken, unmarkHandoffComponent } from "@/lib/registry/actions";
import { useUser } from "@/lib/use-user";
import type { Prototype, PrototypeVersion } from "@/lib/registry/types";

// The review and what it draws its previews with are only loaded once it is opened.
const EMPTY_FLOW: Flow = { screens: [], edges: [] };

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
  const router = useRouter();
  const { markOpened, repoUrl, notify } = useStudio();
  const [device, chooseDevice] = useDevice();
  const [zoom, chooseZoom] = useZoom();
  const [inApp, chooseInApp] = useInApp();
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

  // Where the prototype has put itself, in its own address, beyond what its controls say: a quiz's step, say. Like the
  // choices, it belongs to the version on screen.
  const [place, setPlace] = useState<{ id: string; params: Record<string, string> }>({ id: "", params: {} });
  const extra = place.id === selected.id ? place.params : {};
  const withVariant = (url: string) => (variant ? withParams(url, { [VARIANT_PARAM]: variant }) : url);
  const controlled = selected.url ? withParams(applyControls(selected.url, offered, values), extra) : undefined;
  // A project with no prototype yet has nothing to serve: its canvas opens on an address that is never loaded, with no screens.
  const canvasOnly = !!selected.blank;
  // One template for a project: once it has one, this is a prototype and there is nothing more to add.
  const editComponent = useEditComponent(prototype.slug, canvasOnly, (message) => notify(message, true));
  const addTemplate = useAddTemplate(prototype.slug, canvasOnly, (message) => notify(message, true));
  const address = controlled ? withVariant(controlled) : canvasOnly ? `/p/${prototype.slug}/v0-0` : undefined;

  // Comments are listed for the whole version; choosing one left on another setup puts the prototype in that setup.
  const showSetup = (setup: string) => {
    const { values: next, extra: rest } = splitQuery(setup, offered);
    setPicked({ id: selected.id, values: next });
    setPlace({ id: selected.id, params: rest });
    chooseVariant(new URLSearchParams(setup).get(VARIANT_PARAM));
  };
  // The prototype moved itself (docs/controls.md): the controls, the address and so every link and comment follow it.
  const followPlace = (search: string) => {
    if (!selected.url) return;
    const { values: next, extra: rest } = splitQuery(search, offered);
    const all = { ...defaultValues(offered), ...next };
    live.follow(withVariant(withParams(applyControls(selected.url, offered, all), rest)), { ...controlParams(offered, all), ...rest });
    setPicked({ id: selected.id, values: next });
    setPlace({ id: selected.id, params: rest });
  };
  // Whether the controls and variants a setup names are known yet; they load after the page does.
  const canShow = (setup?: string) => {
    if (!setup) return true;
    const known = new Set((offered?.controls ?? []).map((control) => control.param ?? control.id));
    const made = new Set(variants.map((item) => item.id));
    return [...new URLSearchParams(setup)].every(([key, value]) => (key === VARIANT_PARAM ? made.has(value) : known.has(key) || offered !== null));
  };
  const setupLabel = (setup?: string) => {
    if (!offered && !variants.length) return null;
    if (!setup) return "Baseline";
    const params = new URLSearchParams(setup);
    const parts = controlsInWords(setup, offered);
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
  const fetchedFlow = usePrototypeFlow(canvasOnly ? undefined : address?.split("?")[0]);
  const flow = canvasOnly ? EMPTY_FLOW : fetchedFlow;
  const [flowOpen, setFlowOpen] = useState(canvasOnly);
  // A link into the canvas (`?canvas=1&find=…`, as the copy docs carry): it opens the canvas once, zoomed to the section the lines belong to.
  const canvasParam = useUrlParam("canvas");
  const findParam = useUrlParam("find");
  const focusFind = useMemo(() => (findParam ? findParam.split("|").filter(Boolean) : undefined), [findParam]);
  const openedByLink = useRef(false);
  useEffect(() => {
    if (canvasParam === null || !address || openedByLink.current) return;
    openedByLink.current = true;
    setFlowOpen(true);
  }, [canvasParam, address]);
  // The canvas is in the address while it is open, so a refresh opens it again. Nothing is taken out of the address before it has been open:
  // a link carrying `?canvas=1` is still waiting to be read.
  const wasOpen = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (flowOpen) {
      wasOpen.current = true;
      if (url.searchParams.get("canvas") !== null) return;
      url.searchParams.set("canvas", "1");
    } else if (wasOpen.current) {
      wasOpen.current = false;
      url.searchParams.delete("canvas");
      url.searchParams.delete("find");
    } else return;
    window.history.replaceState(null, "", url);
  }, [flowOpen]);
  const showingFlow = flowOpen && !!address;
  // What the iframe is given: the address with `studio=1`, held still once the prototype can take control changes as messages.
  const live = useLiveControls(address, `${selected.url}|${variant ?? ""}`, { ...controlParams(offered, values), ...extra }, showingFlow);
  const frameUrl = live.src;
  // Commenting with the list (the comment button, or C) brings the list over the prototype, so the controls step aside.
  const side = (mode === "view" || (mode === "comment" && !listing)) && !showingFlow;
  // Full screen: the nav goes and the prototype fills the window.
  // The canvas is always looked at this way, whatever the choice was: closing it puts things back as they were.
  const [focusChoice, setFocus] = useState(false);
  // Command-period, as in Figma: everything but the prototype goes, and comes back the same way.
  const [bare, setBare] = useState(false);
  const focus = focusChoice || showingFlow || bare;
  // Full screen is the prototype alone: no bar, no controls, no pins. Command-period is the same without leaving the window.
  const hideAll = bare || focusChoice;
  // The nav is the shell's, so it is told through the document: it slides up out of the way while the page below grows into its place.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-fullscreen", focus);
    return () => document.documentElement.removeAttribute("data-fullscreen");
  }, [focus]);

  // Asked every few seconds on a running prototype (see the hook).
  const handoffStatus = useHandoffStatus(prototype.slug, selected.key, false);
  // With a handoff, whatever is picked on the canvas (a design, or a section of its code) gets a link and a brief for an agent, in the side panel.
  // Components marked here show at once, without waiting for the next time the handoff is asked for.
  const [markedAt, setMarkedAt] = useState(0);
  const handoffData = useHandoffData(prototype.slug, selected.key, !!handoffStatus, `${JSON.stringify(handoffStatus)}|${markedAt}`);
  const { name: me } = useUser();
  const markers = handoffData && (!handoffStatus?.signedBy || selected.live)
    ? {
        onMark: async (mark: Parameters<typeof markHandoffComponent>[0]["mark"]) => {
          const result = await markHandoffComponent({ slug: prototype.slug, key: selected.key, mark, by: me ?? "" });
          if (!result.ok) notify(result.error, true);
          setMarkedAt((n) => n + 1);
        },
        onUnmark: async (id: string) => {
          const result = await unmarkHandoffComponent({ slug: prototype.slug, key: selected.key, id });
          if (!result.ok) notify(result.error, true);
          setMarkedAt((n) => n + 1);
        },
      }
    : undefined;
  const [pickedSection, setPickedSection] = useState<Selection | null>(null);
  const folder = (selected.url ?? "").split("/").pop() ?? "";

  const githubUrl = repoUrl && selected.url ? `${repoUrl}/p/${selected.url.replace(/^\/p\//, "")}${selected.source ? "/_source" : ""}` : undefined;

  // The name is in the nav (see `Breadcrumbs`); the menu sits beside it, in the slot the nav leaves for it.
  const [slots, setSlots] = useState<Element[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the nav is outside this page; its slots can only be found once the page is on screen
  useEffect(() => setSlots([...document.querySelectorAll("[data-nav-slot]")]), []);
  const menu = (
    <PrototypeMenu
      prototype={prototype}
      version={selected.live ? "Live" : selected.version}
      githubUrl={githubUrl}
      onEdit={selected.url && !showingFlow ? () => (setListing(false), setMode("edit")) : undefined}
    />
  );

  const versionMenu = (
    <VersionMenu
      slug={prototype.slug}
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
      className={`flex w-full flex-col gap-6 pb-6 pt-2 sm:px-8 ${hideAll || showingFlow ? "max-lg:!p-0" : ""} lg:relative lg:gap-4 lg:transition-[height,padding] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] overflow-x-clip lg:items-stretch ${
        focus ? "lg:h-dvh lg:p-0" : "lg:h-[calc(100dvh-var(--nav-height))]"
      }`}
    >

      {slots.map((slot, index) =>
        createPortal(
          <>
            {menu}
          </>,
          slot,
          String(index),
        ),
      )}
      <div className="stagger-in [--i:0] min-w-0 flex-1 lg:min-h-0">
        <PrototypeFrame
          // The version list is the first thing on the bar, then the canvas and the docs.
          leading={versionMenu}
          url={frameUrl}
          openUrl={address}
          docs={!prototype.slug.startsWith("qa-") ? <CopyDocsMenu slug={prototype.slug} name={prototype.name} figmaUrl={prototype.figmaUrl} githubUrl={githubUrl} notionUrl={prototype.notionUrl} /> : undefined}
          // The same menu, its links and its documents, in the canvas bar.
          canvasName={<CanvasNameMenu prototype={prototype} selected={selected} onSelect={choose} />}
          canvasDocs={!prototype.slug.startsWith("qa-") ? (docs) => <CopyDocsMenu slug={prototype.slug} name={prototype.name} figmaUrl={prototype.figmaUrl} githubUrl={githubUrl} notionUrl={prototype.notionUrl} variant="ghost" {...docs} /> : undefined}
          device={device}
          onDevice={chooseDevice}
          zoom={zoom}
          fit={fit}
          inApp={inApp}
          center={({ scale, device: shown }) => (
            <ViewMenu device={shown ?? device} zoom={zoom} fit={fit} fitted={scale} inApp={inApp} onInApp={chooseInApp} onDevice={chooseDevice} onZoom={chooseZoom} onFit={chooseFit} />
          )}
          // The tile's picture is of the default phone and setup, so it is only
          // the placeholder while the prototype is shown that way.
          poster={
            selected.url && address === selected.url && device.id === DEFAULT_DEVICE.id
              ? `${selected.url}/studio-preview.jpg`
              : undefined
          }
          // A live version has no version to save: its edits are only a preview on the running page.
          edit={selected.live ? { slug: prototype.slug, versionId: selected.id, live: true } : { slug: prototype.slug, versionId: selected.id, variantId: variant ?? undefined }}
          // A live version's comments are kept in its own folder on this machine, not pushed anywhere (see `registry/comments.ts`).
          comments={{ slug: prototype.slug, version: selected.key, versions: prototype.versions.map(({ key, version, live }) => ({ key, version: live ? "Live" : version })), onVersion: (key) => { const next = prototype.versions.find((item) => item.key === key); if (next) choose(next); }, variant: address?.split("?")[1] || undefined, onSetup: showSetup, canShow, setupLabel }}
          onPlace={followPlace}
          flow={flow}
          variants={variantsCanvas}
          readyForDev={!!selected.readyForDev}
          handoffInspect={handoffData ? { elements: handoffData.elements, onSelect: setPickedSection, selection: pickedSection } : undefined}
          handoffSheet={handoffData?.marks.length ? { marks: handoffData.marks } : undefined}
          inspecting={!!pickedSection}
          inspectInPanel
          inspectPanel={
            handoffData ? (
              <SelectionPanel
                bare
                data={handoffData}
                selection={pickedSection}
                onClose={() => setPickedSection(null)}
                onSelect={setPickedSection}
                marks={markers}
                variantLabel={(id) => [variantsCanvas?.flow, flow].flatMap((one) => one?.screens.find((screen) => screen.id === id)?.name ?? [])[0] ?? id}
                briefUrl={async (target) => {
                  const minted = await reviewToken(prototype.slug, folder);
                  if (!minted.ok) throw new Error(minted.error);
                  return `${window.location.origin}/api/review/handoff/brief?${new URLSearchParams({ slug: prototype.slug, version: folder, token: minted.value, target })}`;
                }}
              />
            ) : undefined
          }
          flowOpen={flowOpen || canvasOnly}
          forkBase={prototype.versions.find((one) => one.live)?.liveUrl}
          agentLink={async (loc, notes) => {
            const minted = await reviewToken(prototype.slug, folder, true);
            if (!minted.ok) throw new Error(minted.error);
            return `${window.location.origin}/api/handoff/element?${new URLSearchParams({ slug: prototype.slug, version: folder, token: minted.value, loc, ...(notes?.length ? { notes: notes.join(",") } : {}), ...(githubUrl ? { github: githubUrl.replace(/\/p\/.*$/, "") } : {}) })}`;
          }}
          addTemplate={addTemplate}
          editComponent={editComponent}
          focusFind={focusFind}
          // A project's canvas is the whole page, so closing it leaves, back to where it was opened from.
          onFlowOpen={(open) => (canvasOnly && !open ? (window.history.length > 1 ? router.back() : router.push(`/teams/${prototype.teamSlug}`)) : setFlowOpen(open))}
          mode={mode}
          onMode={setMode}
          listing={listing}
          onListing={setListing}
          fullscreen={focus}
          bare={hideAll}
          onBare={(next) => {
            setBare(next);
            // Leaving the bare view (Escape, command-period) leaves full screen too, which hides the same things.
            if (!next) {
              setFocus(false);
            }
          }}
          onFullscreen={(next) => {
            // On the canvas it is full screen already, and a choice made there would only show once it is closed.
            if (showingFlow) return;
            setFocus(next);
            if (next) hintFullscreen(notify);
          }}
          title={`${prototype.name} ${selected.version}`}
          share={{ slug: prototype.slug }}
          side={
            side && !focus && options ? <div className="flex flex-col gap-6 rounded-[var(--r-control)] border border-border p-4">{options}</div> : undefined
          }
          bottom={options ? <VariantsDropdown label={variantsLabel}>{options}</VariantsDropdown> : undefined}
        />
      </div>
    </div>
  );
}

const listenToHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
};

/** The address's hash, read the same way as its parameters (see `useUrlParam`): empty on the server, so the page stays prerendered. */
export function useUrlHash() {
  return useSyncExternalStore(listenToHash, () => window.location.hash.slice(1), () => "");
}

/** Sets the address's hash without a history entry or a jump, and says so to `useUrlHash`. */
export function setUrlHash(hash: string) {
  const url = new URL(window.location.href);
  url.hash = hash;
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
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
export function useUrlParam(name: string) {
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
