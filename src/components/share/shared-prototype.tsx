"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { SharedCommentsContext } from "@/components/prototype/shared-comments";
import { ColumnHandle, RevealTab } from "@/components/prototype/column-handle";
import { ViewMenu } from "@/components/prototype/view-menu";
import { NewUserModal } from "@/components/shell/profile-modal";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { StudioProvider } from "@/lib/data/studio-store";
import { useDevice, useFit, useZoom } from "@/lib/use-device";
import { useUser } from "@/lib/use-user";

import { ShareQr } from "./share-qr";

import { MotionProvider, useOverlayBehaviour } from "@/lib/motion";
import { MotionScrim } from "@/components/motion";
import { ControlsPanel, VariantPicker } from "@/components/prototype/controls-panel";
import { useVersionVariants } from "@/components/prototype/use-version-variants";
import { usePrototypeControls } from "@/components/prototype/use-prototype-controls";
import { AvatarStack } from "@/components/shell/user-avatar";
import { barControl, IconButton } from "@/components/ui/button";
import { Stamp } from "@/components/ui/stamp";
import { useLiveControls } from "@/components/prototype/use-live-controls";
import { applyControls, controlParams, defaultValues, type ControlValues } from "@/lib/controls";
import { VARIANT_PARAM } from "@/lib/edits";
import type { Person } from "@/lib/registry/types";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * A shared version, laid out like the prototype's own page without the studio
 * around it: the same side column (name, who and when, what it is, its
 * variants) beside the prototype on a phone. Nothing here can be changed.
 * Opened on a phone, it is the prototype itself filling the screen, with the
 * rest behind an About button.
 */
/** Nothing of the registry goes to somebody with only a share link: the studio's context is there, and empty. */
const NOTHING = { repoUrl: null, people: [], teams: [], projects: [], prototypes: [] };

export function SharedPrototype(props: Parameters<typeof Shared>[0]) {
  return (
    <MotionProvider>
      <StudioProvider snapshot={NOTHING}>
        <SharedCommentsContext.Provider value={{ token: props.token }}>
          <Shared {...props} />
        </SharedCommentsContext.Provider>
      </StudioProvider>
    </MotionProvider>
  );
}

function Shared({
  name,
  description,
  people,
  updatedAt,
  version,
  review,
  slug,
  versionKey,
  githubUrl,
}: {
  name: string;
  description: string;
  people: Person[];
  updatedAt: string;
  version: { label: string; url: string };
  /** Added to the prototype's address, which is what lets a press and hold leave a comment. */
  review: string;
  /** The share link's token, which is what lets comments be read and written here. */
  token: string;
  slug: string;
  /** The version as it is stored (v2.0), which comments are filed under. */
  versionKey: string;
  /** Its files on GitHub, for engineers. */
  githubUrl?: string;
}) {
  const offered = usePrototypeControls(version.url);
  const variants = useVersionVariants(version.url);
  const [picked, setPicked] = useState<ControlValues>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const values = { ...defaultValues(offered), ...picked };
  const variant = variants.find((item) => item.id === chosen)?.id ?? null;
  const controlled = applyControls(version.url, offered, values);
  const chosenAddress = variant ? `${controlled}${controlled.includes("?") ? "&" : "?"}${VARIANT_PARAM}=${variant}` : controlled;
  const address = `${chosenAddress}${chosenAddress.includes("?") ? "&" : "?"}review=${encodeURIComponent(review)}`;

  const phone = useMediaQuery("(max-width: 639px)");
  // What the iframe is given: `studio=1` added, held still once the prototype can take control changes as messages.
  const frameUrl = useLiveControls(phone ? address : chosenAddress, `${version.url}|${variant ?? ""}|${phone}`, controlParams(offered, values), false);
  const wide = useMediaQuery("(min-width: 64rem)");
  const [about, setAbout] = useState(false);

  // Comments are the studio's own; nothing else of its toolbar comes with them.
  const user = useUser();
  // Which phone it is shown on and how big: the one control of the toolbar kept besides comments.
  const [device, chooseDevice] = useDevice();
  const [zoom, chooseZoom] = useZoom();
  const [fit, chooseFit] = useFit();
  const [mode, setMode] = useState<"view" | "dev" | "edit" | "comment">("view");
  const [listing, setListing] = useState(false);
  const [naming, setNaming] = useState(false);
  // The column can be dragged or clicked out of the way, and full screen takes it too.
  const [hidden, setHidden] = useState(false);
  const [drag, setDrag] = useState(0);
  const [full, setFull] = useState(false);
  // In full screen the column comes back over the prototype while the pointer is at the left edge, as it does on the prototype's own page.
  const [peek, setPeek] = useState(false);
  const away = full && !peek;
  const columnOpen = !((hidden || full) && wide);
  // Somebody has to say who they are before commenting, once, on this browser.
  const changeMode = (next: "view" | "dev" | "edit" | "comment") => {
    if (next === "comment" && !user.name) {
      setNaming(true);
      return;
    }
    setMode(next);
  };

  const info = (
    <>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">{name}</h1>
            <p className="flex items-center gap-1.5 text-ui text-foreground-subtle">
              <AvatarStack people={people} className="size-5" overlap="-ml-1.5" ring="ring-tile" />
              <span className="text-foreground-muted">{people.length > 2 ? `${people[0].name} +${people.length - 1}` : people.map((person) => person.name).join(", ")}</span>
              <span aria-hidden>·</span>
              <span>
                Last updated <Stamp iso={updatedAt} relative />
              </span>
            </p>
          </div>
          <p className="text-base leading-[var(--leading-relaxed)] text-foreground-muted">{description}</p>
        </div>

        {offered || variants.length ? (
          <div className="flex flex-col gap-6 rounded-[var(--r-control)] border border-border p-4">
            {variants.length ? <VariantPicker variants={variants} value={variant} onChange={setChosen} /> : null}
            {offered ? <ControlsPanel controls={offered} values={values} onChange={(id, value) => setPicked((now) => ({ ...now, [id]: value }))} /> : null}
          </div>
        ) : null}
    </>
  );

  // On a phone the prototype is the page: its own screen, not a picture of one inside a page.
  if (phone) {
    return (
      <>
        <GrowingFrame src={frameUrl ?? address} title={`${name} ${version.label}`} />
        <IconButton onClick={() => setAbout(true)} className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[var(--z-raised)] shadow-floating">
          About
        </IconButton>
        <AboutSheet open={about} onClose={() => setAbout(false)} label={`About ${name}`}>
          <div className="flex flex-col gap-6">
            {info}
            <p className="text-ui text-foreground-subtle">Press and hold anywhere on the prototype to leave a comment.</p>
          </div>
        </AboutSheet>
      </>
    );
  }

  return (
    <div className={`flex w-full flex-col gap-6 overflow-x-clip py-4 sm:px-8 lg:h-dvh lg:flex-row lg:gap-4 lg:transition-[padding] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${full ? "lg:p-0" : "lg:p-4"}`}>
      {full ? (
        <div aria-hidden onPointerEnter={() => setPeek(true)} className="fixed inset-y-0 left-0 z-[var(--z-focus-mode)] w-3 max-lg:hidden" />
      ) : null}
      {columnOpen && !full ? <ColumnHandle offset={drag} onDrag={setDrag} onHide={() => setHidden(true)} edge="1rem" vertical="inset-y-4" /> : null}
      {hidden && !full && wide ? <RevealTab onShow={() => setHidden(false)} /> : null}
      <aside
        inert={full ? away : !columnOpen}
        style={drag ? { width: `max(0px, calc(var(--detail-side-width) + ${drag}px))`, transition: "none" } : undefined}
        onPointerLeave={() => setPeek(false)}
        className={`stagger-in min-w-0 px-5 sm:px-0 lg:flex lg:shrink-0 lg:transition-[width,margin,visibility] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${
          columnOpen
            ? "lg:w-[var(--detail-side-width)] lg:overflow-hidden"
            : full
              ? // Closed up like any other mode, but its panel stays drawn so it can come back over the prototype.
                "lg:relative lg:z-[var(--z-focus-mode)] lg:-mr-4 lg:w-0 lg:[transform:translateZ(0)] lg:[&>div]:border lg:[&>div]:border-border"
              : "invisible lg:-mr-4 lg:w-0 lg:overflow-hidden"
        }`}
      >
        {/* It travels left and fades as the column closes, at the same pace as the room opens for the prototype. */}
        <div
          style={drag ? { translate: `${drag}px 0`, transition: "none" } : undefined}
          className={`flex min-w-0 flex-1 flex-col gap-6 lg:w-[var(--detail-side-width)] lg:flex-none lg:overflow-y-auto lg:rounded-[var(--r-tile)] lg:bg-tile lg:p-8 lg:transition-[translate,opacity] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${(full ? !away : columnOpen) ? "" : "lg:-translate-x-full lg:opacity-0"}`}
        >
          {info}
        </div>
      </aside>

      <div className="stagger-in [--i:1] min-w-0 flex-1 lg:min-h-0">
        <PrototypeFrame
          url={frameUrl}
          title={`${name} ${version.label}`}
          leading={full ? null : <div className={barControl}>{version.label}</div>}
          center={({ scale }) => (
            <ViewMenu device={device} zoom={zoom} fit={fit} fitted={scale} onDevice={chooseDevice} onZoom={chooseZoom} onFit={chooseFit} />
          )}
          device={device}
          onDevice={chooseDevice}
          zoom={zoom}
          fit={fit}
          comments={full ? undefined : { slug, version: versionKey, variant: chosenAddress.split("?")[1] || undefined }}
          flow={null}
          flowOpen={false}
          onFlowOpen={() => {}}
          mode={mode}
          onMode={changeMode}
          listing={listing}
          onListing={setListing}
          fullscreen={full}
          onFullscreen={(next) => {
            setFull(next);
            setPeek(false);
            // Full screen keeps only the view controls and the way out: no commenting, so nothing half-open is left behind.
            if (next) {
              setMode("view");
              setListing(false);
            }
          }}
          onOpenPrototype={() => window.location.assign(address)}
          githubUrl={full ? undefined : githubUrl}
          minimal
          corner={full ? undefined : <ShareQr />}
        />
      </div>

      <NewUserModal
        open={naming}
        standalone
        title="Who's commenting?"
        submitLabel="Continue"
        onClose={() => setNaming(false)}
        onCreated={() => {
          setNaming(false);
          setMode("comment");
          setListing(true);
        }}
      />
    </div>
  );
}

/**
 * The prototype as tall as its own content, so the page scrolls rather than
 * the frame. Safari only slides its bars away and draws the page beneath them
 * when the document scrolls, as it does when a prototype is opened directly.
 */
function GrowingFrame({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = frame.current;
    let watch: ResizeObserver | undefined;
    const attach = () => {
      const doc = el?.contentDocument;
      if (!doc?.documentElement) return;
      watch?.disconnect();
      const measure = () => setHeight(Math.max(doc.documentElement.scrollHeight, window.innerHeight));
      watch = new ResizeObserver(measure);
      watch.observe(doc.documentElement);
      watch.observe(doc.body);
      measure();
    };
    el?.addEventListener("load", attach);
    attach();
    return () => {
      el?.removeEventListener("load", attach);
      watch?.disconnect();
    };
  }, [src]);

  return (
    <iframe
      ref={frame}
      src={src}
      title={title}
      scrolling="no"
      style={{ height: height ?? "100dvh" }}
      className="block w-full border-0 bg-surface"
    />
  );
}

/** The info for a phone: slides up from the bottom over the prototype, and back down when it is let go of. */
function AboutSheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const container = useOverlayBehaviour({ open, onClose });
  // Kept on screen while it slides back down.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <div className="fixed inset-0" style={{ zIndex: "var(--z-drawer)" }}>
      <MotionScrim onClick={onClose} leaving={!open} />
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onAnimationEnd={() => !open && setMounted(false)}
        className={`${open ? "sheet-up" : "sheet-down pointer-events-none"} absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[var(--r-xl)] border-t border-border bg-surface-elevated p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[var(--elev-overlay)] outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
