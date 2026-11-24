"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { SelectionPanel } from "@/components/handoff/part-panel";
import { useUrlParam } from "@/components/prototype/prototype-detail";
import { useSharedHandoff } from "@/components/handoff/use-shared-handoff";
import type { Selection } from "@/lib/handoff-selection";

import { SharedCommentsContext } from "@/components/prototype/shared-comments";
import { ColumnHandle, RevealTab } from "@/components/prototype/column-handle";
import { ViewMenu } from "@/components/prototype/view-menu";
import { PrototypeFrame } from "@/components/ui/prototype-frame";
import { StudioProvider, useStudio } from "@/lib/data/studio-store";
import { hintFullscreen } from "@/lib/fullscreen-hint";
import { useDevice, useFit, useInApp, useZoom } from "@/lib/use-device";
import { useUser } from "@/lib/use-user";

import { AboutSheet } from "./about-sheet";
import { FindYourself } from "./find-yourself";
import { ShareQr } from "./share-qr";
import { HoldMenu, PhoneComposer } from "./phone-comment";
import { ReviewTip, ReviewWelcome } from "./review-welcome";
import { ReviewPanel } from "./review-panel";
import { SharedDocsMenu, type DocLinks } from "./shared-docs-menu";

import { MotionProvider } from "@/lib/motion";
import { ControlsPanel, VariantPicker } from "@/components/prototype/controls-panel";
import { useVersionVariants } from "@/components/prototype/use-version-variants";
import { usePrototypeFlow } from "@/components/prototype/use-prototype-flow";
import { usePrototypeControls } from "@/components/prototype/use-prototype-controls";
import { AvatarStack } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { Stamp } from "@/components/ui/stamp";
import { useLiveControls } from "@/components/prototype/use-live-controls";
import { applyControls, controlParams, defaultValues, splitQuery, variantControl, type ControlValues } from "@/lib/controls";
import { VARIANT_PARAM } from "@/lib/edits";
import { withParams, type Flow } from "@/lib/flow";
import type { Person } from "@/lib/registry/types";
import type { Anchor } from "@/lib/comments";
import { addSharedComment } from "@/lib/registry/actions";
import { variantOf, type ReviewRequest } from "@/lib/reviews";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * A shared version, laid out like the prototype's own page without the studio
 * around it: the same side column (name, who and when, what it is, its
 * variants) beside the prototype on a phone. Nothing here can be changed.
 * Opened on a phone, it is the prototype itself filling the screen, with the
 * rest behind an About button.
 */
/** Nothing of the registry goes to somebody with only a share link: the studio's context is there, and empty. */
/** A press and hold on a phone: the script's id for it, where the finger is on the screen, and what is under it. */
type Held = { id: string; at: { x: number; y: number }; anchor: Anchor; variant?: string };

const NOTHING = { repoUrl: null, people: [], teams: [], projects: [], prototypes: [] };

export function SharedPrototype(props: Parameters<typeof Shared>[0]) {
  return (
    <MotionProvider>
      <StudioProvider snapshot={NOTHING}>
        <SharedCommentsContext.Provider value={{ token: props.token, as: props.reviewer?.name }}>
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
  docs,
  token,
  dev = false,
  request,
  reviewer,
  start,
}: {
  name: string;
  description: string;
  people: Person[];
  updatedAt: string;
  version: { label: string; url: string; readyForDev?: boolean };
  /** Added to the prototype's address, which is what lets a press and hold leave a comment. */
  review: string;
  /** The share link's token, which is what lets comments be read and written here. */
  token: string;
  slug: string;
  /** The version as it is stored (v2.0), which comments are filed under. */
  versionKey: string;
  /** Where its design, write-up, copy documents and files on GitHub are, for those that exist. */
  docs: DocLinks;
  /** A dev link: its canvas opens in Dev, with the Design/Dev toggle. */
  dev?: boolean;
  /** Opened for a review request: the side column is the review (what was asked, the variations to look at, sending it) and the rest of the page's extras are left out. */
  request?: ReviewRequest;
  /** On a review link: who it is for, and the key that is theirs alone. They are that person here whoever this browser has chosen to be. */
  reviewer?: { name: string; key: string };
  /** On a review link opened from the QR code: the screen to open on (the prototype's own query), instead of the first variation asked about. */
  start?: string;
}) {
  const offered = usePrototypeControls(version.url);
  const variants = useVersionVariants(version.url);
  const [picked, setPicked] = useState<ControlValues>({});
  // A review opens on the first variation it asked about: its studio variant, and anything else its setup says, as the prototype's own place.
  const firstAsked = new URLSearchParams(start ?? request?.variants?.[0]?.setup ?? "");
  const [chosen, setChosen] = useState<string | null>(() => firstAsked.get(VARIANT_PARAM));
  const values = { ...defaultValues(offered), ...picked };
  const variant = variants.find((item) => item.id === chosen)?.id ?? null;
  // Where the prototype has put itself in its own address beyond its controls (see the studio's prototype page).
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries([...firstAsked].filter(([key]) => key !== VARIANT_PARAM)));
  // A review's chips take the prototype to a setup: the baseline is none of it.
  const showSetup = (setup: string) => {
    const rest = Object.fromEntries(new URLSearchParams(setup));
    setChosen(rest[VARIANT_PARAM] ?? null);
    delete rest[VARIANT_PARAM];
    setPicked({});
    setExtra(rest);
  };
  const withVariant = (url: string) => (variant ? withParams(url, { [VARIANT_PARAM]: variant }) : url);
  const controlled = withParams(applyControls(version.url, offered, values), extra);
  const chosenAddress = withVariant(controlled);
  const address = `${chosenAddress}${chosenAddress.includes("?") ? "&" : "?"}review=${encodeURIComponent(review)}`;

  // A handed-off version: its screens are marked Ready for dev on the canvas, and a tap on a part says what it is.
  const handoffAll = useSharedHandoff(slug, version.url.split("/").pop() ?? "", token);
  const handoff = request ? null : handoffAll;
  const [section, setSection] = useState<Selection | null>(null);

  const phone = useMediaQuery("(max-width: 639px)");
  // What the iframe is given: `studio=1` added, held still once the prototype can take control changes as messages.
  const [flowOpen, setFlowOpen] = useState(false);
  // Lines of one section of the copy (a link from a copy doc): the canvas opens zoomed to them.
  const findParam = useUrlParam("find");
  const focusFind = useMemo(() => (findParam ? findParam.split("|").filter(Boolean) : undefined), [findParam]);
  // A canvas link (`#canvas`) opens straight onto it, except on a phone, which has no way to leave it.
  useEffect(() => {
    if (window.location.hash !== "#canvas" || !window.matchMedia("(min-width: 640px)").matches) return;
    const timer = window.setTimeout(() => setFlowOpen(true));
    return () => window.clearTimeout(timer);
  }, []);
  const live = useLiveControls(phone ? address : chosenAddress, `${version.url}|${variant ?? ""}|${phone}`, { ...controlParams(offered, values), ...extra }, flowOpen);
  const frameUrl = live.src;
  // The prototype moved itself: the controls and the setup comments are left on follow it.
  const followPlace = (search: string) => {
    const { values: next, extra: rest } = splitQuery(search, offered);
    const all = { ...defaultValues(offered), ...next };
    const moved = withVariant(withParams(applyControls(version.url, offered, all), rest));
    live.follow(phone ? `${moved}${moved.includes("?") ? "&" : "?"}review=${encodeURIComponent(review)}` : moved, { ...controlParams(offered, all), ...rest });
    setPicked(next);
    setExtra(rest);
  };
  // The canvas, as on the prototype's own page: the flow if it has one, the variants if it has some. Opening it takes the column's room.
  const flow = usePrototypeFlow(version.url);
  const variantsCanvas = (() => {
    const control = variantControl(offered);
    if (!control) return null;
    const setups: Record<string, string> = {};
    const screens = control.options.map((option) => {
      setups[option.value] = applyControls(version.url, offered, { ...defaultValues(offered), ...picked, [control.id]: option.value }).split("?")[1] ?? "";
      return { id: option.value, name: option.label, params: option.value === control.default ? {} : { [control.param ?? control.id]: option.value } };
    });
    return { flow: { screens, edges: [] } satisfies Flow, setups };
  })();
  const wide = useMediaQuery("(min-width: 64rem)");
  const [aboutOpen, setAboutOpen] = useState(false);
  // Said once per device, a moment after the prototype is there (its script says the same for a prototype opened on its own).
  const [introOpen, setIntroOpen] = useState(false);
  useEffect(() => {
    // On a review it follows the welcome instead (see `continueFromWelcome`).
    if (!phone || request) return undefined;
    try {
      if (localStorage.getItem("studio.review.intro")) return undefined;
    } catch {
      return undefined;
    }
    // Marked as seen when it shows, not before: a development build runs this twice, and the first must not use it up.
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem("studio.review.intro", "1");
      } catch {
        // Shown again next time without storage.
      }
      setIntroOpen(true);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [phone, request]);
  // A review opens with a welcome, once per request on this device; then, on a computer, a tip beside the prototype (how to leave feedback
  // with the keyboard), and on a phone the instruction for press and hold.
  const requestId = request?.id;
  // Whether this is somebody's first time on this review, as the page loads: the welcome is theirs to take in, so the canvas card (a second
  // thing to read, and one that isn't for a first look) is held back for the whole of that visit, and comes on a later one.
  const [firstVisit] = useState(() => {
    if (!requestId) return false;
    try {
      return typeof window === "undefined" || !localStorage.getItem(`studio.review.welcome.${requestId}`);
    } catch {
      return true;
    }
  });
  const tile = useRef<HTMLDivElement>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  useEffect(() => {
    if (!requestId) return undefined;
    try {
      if (localStorage.getItem(`studio.review.welcome.${requestId}`)) return undefined;
    } catch {
      return undefined;
    }
    // Marked as seen when it is let go of, not when it shows: a development build runs this twice.
    const timer = window.setTimeout(() => setWelcomeOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, [requestId]);
  const continueFromWelcome = () => {
    setWelcomeOpen(false);
    try {
      localStorage.setItem(`studio.review.welcome.${requestId}`, "1");
    } catch {
      // Shown again next time without storage.
    }
    // A beat after the dialog has gone, so the next thing arrives on its own.
    window.setTimeout(() => {
      if (!phone) return setTipOpen(true);
      try {
        if (localStorage.getItem("studio.review.intro")) return;
        localStorage.setItem("studio.review.intro", "1");
      } catch {
        return;
      }
      setIntroOpen(true);
    }, 400);
  };
  // A press and hold goes on past the moment the menu appears over the finger, onto this page: which must not start selecting text any more
  // than the prototype's own does (public/studio-review.js). Fields excepted, so typing still works.
  useEffect(() => {
    if (!phone) return undefined;
    const style = document.createElement("style");
    style.textContent = "html,html *:not(input):not(textarea):not([contenteditable]){-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}";
    document.head.appendChild(style);
    const keep = (event: Event) => {
      const target = event.target as Node | null;
      const element = target?.nodeType === Node.TEXT_NODE ? target.parentElement : (target as Element | null);
      if (!element?.closest?.("input,textarea,[contenteditable]")) event.preventDefault();
    };
    document.addEventListener("selectstart", keep, true);
    return () => {
      style.remove();
      document.removeEventListener("selectstart", keep, true);
    };
  }, [phone]);
  // A press and hold in the prototype (public/studio-review.js) says where, and what is there. The menu and the comment box are drawn here, in
  // the screen: the prototype's own page is as tall as the prototype, so it can't say where the screen is. The script draws the pin.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [composing, setComposing] = useState<Held | null>(null);
  useEffect(() => {
    if (!phone) return undefined;
    const asked = (event: MessageEvent) => {
      const data = event.data;
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow || data?.type !== "studio:review:hold" || typeof data.id !== "string") return;
      // The finger's place is in the frame's own pixels; the frame is as wide as the screen and as tall as the page.
      const box = frameRef.current.getBoundingClientRect();
      setHeld({ id: data.id, at: { x: box.left + Number(data.x), y: box.top + Number(data.y) }, anchor: data.anchor as Anchor, variant: typeof data.variant === "string" && data.variant ? data.variant : undefined });
    };
    window.addEventListener("message", asked);
    return () => window.removeEventListener("message", asked);
  }, [phone]);
  /** Tells the script what to do with the pin it keeps for a hold: show it (for whom), pulse it while saving, keep it, or take it away. */
  const pin = (id: string, state: "show" | "saving" | "saved" | "remove", who?: string) => frameRef.current?.contentWindow?.postMessage({ type: "studio:review:pin", id, state, name: who }, window.location.origin);

  // Comments are the studio's own; nothing else of its toolbar comes with them.
  const user = useUser();
  // On a personal review link they are who the link is for; otherwise who this browser chose (asked for by search, as a share link does).
  const author = reviewer?.name ?? user.name;
  // The pin goes down once the comment has somebody to be from (a share link asks first), with their face.
  const composingId = composing?.id;
  useEffect(() => {
    if (composingId && author) frameRef.current?.contentWindow?.postMessage({ type: "studio:review:pin", id: composingId, state: "show", name: author }, window.location.origin);
  }, [composingId, author]);
  // Which phone it is shown on and how big: the one control of the toolbar kept besides comments.
  const [device, chooseDevice] = useDevice();
  const [zoom, chooseZoom] = useZoom();
  const [inApp, chooseInApp] = useInApp();
  const [fit, chooseFit] = useFit();
  const [mode, setMode] = useState<"view" | "dev" | "edit" | "comment">("view");
  const [listing, setListing] = useState(false);
  const [naming, setNaming] = useState(false);
  // The column can be dragged or clicked out of the way, and full screen takes it too.
  const [hidden, setHidden] = useState(false);
  const [drag, setDrag] = useState(0);
  const [full, setFull] = useState(false);
  // Full screen is the prototype alone: nothing of the studio comes back over it.
  const { notify } = useStudio();
  const columnOpen = !((hidden || full || flowOpen) && wide);
  // Somebody has to say who they are before commenting, once, on this browser.
  const changeMode = (next: "view" | "dev" | "edit" | "comment") => {
    if (next === "comment") setTipOpen(false);
    if (next === "comment" && !user.name && !reviewer) {
      setNaming(true);
      return;
    }
    setMode(next);
  };

  const about = (
    <>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="min-w-0 text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">{name}</h1>
              <span className="shrink-0 text-ui text-foreground-subtle">{version.label}</span>
            </div>
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

  const info = request && reviewer ? (
    <ReviewPanel slug={slug} title={name} versionLabel={version.label} request={request} reviewer={reviewer} current={chosenAddress.split("?")[1] ?? ""} onSetup={showSetup} />
  ) : (
    about
  );

  // On a phone the prototype is the page: its own screen, not a picture of one inside a page.
  if (phone) {
    return (
      <>
        <GrowingFrame src={frameUrl ?? address} title={`${name} ${version.label}`} frameRef={frameRef} />
        {held ? (
          <HoldMenu
            at={held.at}
            onClose={() => setHeld(null)}
            onControls={() => {
              setHeld(null);
              setAboutOpen(true);
            }}
            // The same tap that chose Comment opens the box, which is what lets the keyboard come up with it.
            onComment={() => {
              setComposing(held);
              setHeld(null);
            }}
          />
        ) : null}
        <PhoneComposer
          open={!!composing && !!author}
          author={author}
          onCancel={() => {
            if (composing) pin(composing.id, "remove");
            setComposing(null);
          }}
          onPost={async (text) => {
            if (!composing) return null;
            pin(composing.id, "saving");
            const result = await addSharedComment(token, { text, anchor: composing.anchor, variant: composing.variant, by: author, avatar: user.profileOf(author).avatar, review: request?.id });
            if (!result.ok) {
              pin(composing.id, "show", author);
              return result.error;
            }
            pin(composing.id, "saved");
            setComposing(null);
            return null;
          }}
        />
        {/* Opened from the prototype's press-and-hold menu (Controls), not from a button over it. */}
        <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} label={`${request ? "Review of" : "About"} ${name}`}>
          <div className="flex flex-col gap-6">{info}</div>
        </AboutSheet>
        {request ? <ReviewWelcome open={welcomeOpen} request={request} onContinue={continueFromWelcome} /> : null}
        {/* How to use it, said once, in the screen: the prototype's own page is as tall as the prototype, so it can't say it there. */}
        <AboutSheet open={introOpen} onClose={() => setIntroOpen(false)} label="How to comment">
          <div className="flex flex-col items-center gap-6 pb-2 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-[4.5rem] text-foreground">
              <path d="M22 14a8 8 0 0 1-8 8" />
              <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
              <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
              <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
              <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-medium tracking-[var(--tracking-tight)]">Press and hold anywhere</h2>
              <p className="text-base text-foreground-muted">to comment or open controls</p>
            </div>
            <Button variant="primary" className="w-full" onClick={() => setIntroOpen(false)}>
              Done
            </Button>
          </div>
        </AboutSheet>
      </>
    );
  }

  return (
    <div className={`flex w-full flex-col gap-6 overflow-x-clip py-4 sm:px-8 ${full || flowOpen ? "max-lg:!p-0" : ""} lg:h-dvh lg:flex-row lg:gap-4 lg:transition-[padding] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${full || flowOpen ? "lg:p-0" : "lg:p-4"}`}>
      {!request && columnOpen && !full ? <ColumnHandle offset={drag} onDrag={setDrag} onHide={() => setHidden(true)} edge="1rem" vertical="inset-y-4" /> : null}
      {!request && hidden && !full && wide ? <RevealTab onShow={() => setHidden(false)} /> : null}
      <aside
        inert={!columnOpen}
        style={drag ? { width: `max(0px, calc(var(--detail-side-width) + ${drag}px))`, transition: "none" } : undefined}
        className={`stagger-in ${full || flowOpen ? "max-lg:hidden" : ""} min-w-0 px-5 sm:px-0 lg:flex lg:shrink-0 lg:transition-[width,margin,visibility] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${
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
          className={`flex min-w-0 flex-1 flex-col gap-6 lg:w-[var(--detail-side-width)] lg:flex-none lg:overflow-y-auto lg:rounded-[var(--r-tile)] lg:bg-tile lg:p-8 lg:transition-[translate,opacity] lg:duration-[var(--dur-standard)] lg:ease-[var(--curve-standard)] ${columnOpen ? "" : "lg:-translate-x-full lg:opacity-0"}`}
        >
          {info}
        </div>
      </aside>

      <div ref={tile} className="stagger-in [--i:1] min-w-0 flex-1 lg:min-h-0">
        <PrototypeFrame
          url={frameUrl}
          title={`${name} ${version.label}`}
          leading={null}
          center={({ scale, device: shown }) => (
            <ViewMenu device={shown ?? device} zoom={zoom} fit={fit} fitted={scale} inApp={inApp} onInApp={chooseInApp} onDevice={chooseDevice} onZoom={chooseZoom} onFit={chooseFit} />
          )}
          device={device}
          onDevice={chooseDevice}
          zoom={zoom}
          fit={fit}
          inApp={inApp}
          comments={
            full
              ? undefined
              : {
                  slug,
                  version: versionKey,
                  // The one version there is: the list is built from the versions it is given, so without it the button counts comments the list never shows.
                  versions: [{ key: versionKey, version: version.label }],
                  variant: chosenAddress.split("?")[1] || undefined,
                  // Choosing a comment in the list takes the prototype to the variation it was left on, named in the list on a review.
                  onSetup: showSetup,
                  setupLabel: request ? (setup) => variantOf(request.variants, setup)?.label ?? null : undefined,
                }
          }
          onPlace={followPlace}
          flow={request ? null : flow}
          variants={request ? null : variantsCanvas}
          readyForDev={version.readyForDev}
          handoffInspect={handoff ? { elements: handoff.elements, onSelect: setSection, selection: section } : undefined}
          handoffSheet={handoff?.marks.length ? { marks: handoff.marks } : undefined}
          inspectPanel={
            handoff ? (
              <SelectionPanel
                data={handoff}
                selection={section}
                onClose={() => setSection(null)}
                onSelect={setSection}
                variantLabel={(id) => [variantsCanvas?.flow, flow].flatMap((one) => one?.screens.find((screen) => screen.id === id)?.name ?? [])[0] ?? id}
                briefUrl={(target) => `${window.location.origin}/api/review/handoff/brief?${new URLSearchParams({ slug, version: version.url.split("/").pop() ?? "", token, target, ref: `${window.location.origin}${window.location.pathname}` })}`}
              />
            ) : undefined
          }
          flowOpen={flowOpen}
          introQuiet={firstVisit}
          onFlowOpen={setFlowOpen}
          focusFind={focusFind}
          mode={mode}
          onMode={changeMode}
          listing={listing}
          onListing={setListing}
          fullscreen={full}
          bare={full}
          onFullscreen={(next) => {
            // The canvas is full screen itself, and its way out is in the bar that full screen takes away.
            if (flowOpen) return;
            setFull(next);
            if (next) hintFullscreen(notify);
            // Nothing is half-open when the studio's controls go.
            if (next) {
              setMode("view");
              setListing(false);
            }
          }}
          onOpenPrototype={request ? undefined : () => window.location.assign(address)}
          docs={request ? undefined : <SharedDocsMenu links={docs} />}
          minimal
          devLink={dev}
          shareToken={dev ? token : undefined}
          // The engineer's door gives the same link for an element as the studio does: the share link's own token is what opens it, as it opens the handoff.
          agentLink={dev ? async (loc, notes) => `${window.location.origin}/api/handoff/element?${new URLSearchParams({ slug, version: version.url.split("/").pop() ?? "", token, loc, ...(notes?.length ? { notes: notes.join(",") } : {}), ...(docs.github ? { github: docs.github.replace(/\/p\/.*$/, "") } : {}) })}` : undefined}
          // A review's code says which screen they are on, so the phone opens the same review at the same place.
          corner={full || dev ? undefined : <ShareQr setup={request ? (chosenAddress.split("?")[1] ?? "") : undefined} />}
        />
      </div>

      {request ? (
        <>
          <ReviewWelcome open={welcomeOpen} request={request} onContinue={continueFromWelcome} />
          <ReviewTip open={tipOpen} anchor={tile} onClose={() => setTipOpen(false)} />
        </>
      ) : null}

      <FindYourself
        open={naming || (!!composing && !author)}
        slug={slug}
        version={version.url.split("/").pop() ?? ""}
        token={review}
        onClose={() => {
          setNaming(false);
          setComposing(null);
        }}
        onChosen={() => {
          setNaming(false);
          // A comment held on a phone carries on into its box; on a computer, comment mode opens.
          if (!composing) {
            setMode("comment");
            setListing(true);
          }
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
function GrowingFrame({ src, title, frameRef }: { src: string; title: string; frameRef: RefObject<HTMLIFrameElement | null> }) {
  const frame = frameRef;
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = frame.current;
    let watch: ResizeObserver | undefined;
    const rootStyle = document.documentElement.style;
    const wasBehind = rootStyle.backgroundColor;
    // Scrolled faster than iOS can draw it, a very tall frame shows what is behind it where it hasn't painted yet. That is the studio's own
    // background, which in the dark theme is near black, against a prototype that is usually light. So what is behind it is the prototype's
    // own background, read from it (it is the same origin), and white, as a browser's default is, if it sets none.
    const tint = (doc: Document) => {
      const win = el?.contentWindow;
      if (!el || !win || !doc.body) return;
      const drawn = (value: string) => !!value && value !== "transparent" && !/,\s*0\)$/.test(value);
      const color = [win.getComputedStyle(doc.body).backgroundColor, win.getComputedStyle(doc.documentElement).backgroundColor].find(drawn) ?? "white";
      el.style.backgroundColor = color;
      rootStyle.backgroundColor = color;
    };
    const attach = () => {
      const doc = el?.contentDocument;
      if (!doc?.documentElement) return;
      watch?.disconnect();
      const measure = () => {
        setHeight(Math.max(doc.documentElement.scrollHeight, window.innerHeight));
        tint(doc);
      };
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
      rootStyle.backgroundColor = wasBehind;
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
