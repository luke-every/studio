"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, useSyncExternalStore } from "react";

import { CodeIcon, CopyIcon, FrameIcon, PlayIcon, PointerIcon } from "@/components/shell/nav-icons";
import { CanvasCamera, zoomAbout } from "@/lib/canvas-camera";
import { readCanvas, writeCanvas, type CanvasFrame, type Offsets, type Piece } from "@/lib/canvas-saved";
import { COMPONENT_DRAG_TYPE } from "./components-panel";
import { COPIES_OFFERED, donate, forgetCopies, useCopiesChoice, useScreenCopy } from "@/lib/screen-copies";
import { ScreenCopy } from "./screen-copy";
import type { Mark } from "@/lib/handoff";
import type { SourceEl } from "@/lib/handoff-clip";
import { targetOf, type Selection } from "@/lib/handoff-selection";
import { controlOn, IconButton } from "@/components/ui/button";
import type { Spot } from "@/lib/anchor";
import { setupOf, type Anchor } from "@/lib/comments";
import { copyKey, fitView, followShift, layoutFlow, screenOfCopy, spreadCopies, withParams, type Flow, type FlowScreen } from "@/lib/flow";
import { barsOf, DEVICES, type Device, type InApp } from "@/lib/phone";

import { watchScrolled } from "./frame-page";
import { InAppChrome } from "./in-app-chrome";
import { applyEmbed } from "@/lib/embed";
import { embedded, PREVIEW_QUERY } from "@/lib/controls";

import { ComponentsFrame } from "./components-frame";
import { Card, CommentCard, Composer, DraftPin, Pin, PinTarget, type CommentsUi } from "./comment-parts";
import { editable, type Part } from "@/lib/edit-part";

import { TextInPlace } from "./edit-layer";
import { FramePanel } from "./frame-panel";
import { deviceIcons } from "./view-menu";
import { publishZoom } from "@/lib/canvas-zoom";
import { measure, snapMove, type Guide, type Rect } from "@/lib/canvas-geometry";
import { handoffPartBox, handoffSourceAt, pageOf, selectorBox, type FramePage } from "./frame-page";
import { usePinWatch } from "./use-pin-watch";

/** How big a screen is drawn on the canvas, as a share of the phone's real size. */
const SCREEN_SCALE = 0.5;
/**
 * Using a selected screen where it stands ("Use here"), off for now: with this false the button isn't there and nothing
 * about it acts, and each screen is a plain button as it always was. Turning it on makes each screen a div instead, since a
 * page that takes the pointer can't sit inside a button in every browser.
 */
const USE_IN_PLACE = false;
/** How near, in screen pixels, a moved thing has to be to line up with another before it snaps. */
const SNAP_PX = 4;
/** Where the stage prototype is served: the empty page that draws one real component of the website, given its story. */
const STAGE = "/p/stage/v0-2";
/** Whether a copy's key is a placed component's (see `pieceDevice`): it is drawn as the component alone, with no frame, name or page behind it. */
const isPiece = (id: string) => id.startsWith("stage/");
/** A component placed on the canvas is a screen of its own on this device, as big as the component is. */
const pieceDevice = (piece: Piece): Device => ({ id: "stage", name: "Component", kind: "desktop", width: piece.width, height: piece.height });
const pieceScreen = (piece: Piece): FlowScreen => ({ id: piece.id, name: piece.label, url: STAGE, params: { id: piece.story, ...(Object.keys(piece.props).length ? { props: JSON.stringify(piece.props) } : {}) } });
const Screen = (USE_IN_PLACE ? "div" : "button") as React.ElementType;
const GAP = { x: 140, y: 90 };
const LABEL_HEIGHT = 26;
/** The clear space between one device's copy of a screen and the next device's, beside it: less than between screens, so a screen's copies read as a group. */
const DEVICE_GAP = 48;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 4;
/** Room kept clear around what is fitted: the top is where the toolbar sits over the canvas. */
const INSET = { top: 104, side: 56 };
/** How much a double-click zooms in. */
const DOUBLE_CLICK_ZOOM = 1.6;
/** A click with Z held. */
const CLICK_ZOOM = 1.5;
/** How long the room has to stay the same size to count as settled. */
const SETTLE_MS = 80;
/** The room an opened screen keeps clear: a strip along the top for its buttons, and a margin elsewhere (none on a phone, where it fills the view). */
const INTERACT = { top: 52, margin: 24 };
/** How long a screen takes to grow into the middle and back, matching `--dur-deliberate`. */
const INTERACT_MS = 460;
/** The outermost element each component file draws (the whole of a production one): what hovering inside a component outlines. The app's own page isn't one. */
function componentRoots(elements: SourceEl[]) {
  const biggest = new Map<string, SourceEl>();
  for (const item of elements) {
    const best = biggest.get(item.file);
    if (!/^(src\/)?app\//.test(item.file) && (!best || item.endLine - item.line > best.endLine - best.line)) biggest.set(item.file, item);
  }
  return [...biggest.values()];
}

type Box = { left: number; top: number; width: number; height: number; component?: boolean; children?: Box[] };
/** A screen moved by hand: where it was, and where it was put. */
/** Where each thing in a group of selected things was when it began to move: screens by copy key (their offsets), frames by id. */
type GroupBase = { copies: Record<string, { x: number; y: number }>; frames: Record<string, { x: number; y: number }> };
type Move = { id: string; from: { x: number; y: number }; to: { x: number; y: number } };
/** A page is measured this long after it loads, and again later, since it may still be settling. */
const MEASURE_AT_MS = [600, 1800];
/** Two taps on one screen within this long are a double tap. */
const DOUBLE_TAP_MS = 320;
/** A page counts as ready this long after it loads: measured, and its own entrance animations played out of sight. */
const READY_AFTER_LOAD_MS = 700;
/** What the loader says while the pages load; one is picked each time the canvas opens. */
const LOADING_LINES = ["Making magic…", "Abracadabra…", "Conjuring your screens…", "A little bit of magic…"];
/** A screen counts as ready after this long even if its page is still loading, so one slow page can't hold the canvas back. */
const GIVE_UP_MS = 6000;
/** Long enough for every screen of the first arrival to have come in (the last starts eight steps after the first). */
const ARRIVAL_MS = 2000;
/** The tallest a page is drawn, so one that grows with its window can't grow without end. */
const MAX_PAGE = 12000;

type View = { x: number; y: number; scale: number };

/**
 * The flow of a prototype as a canvas: every screen, live, with an arrow for
 * each tap that leads to another. Every screen is a whole page, as tall as it
 * turns out to be rather than a phone's worth, so nothing is cut off; the flow
 * runs on past the edge rather than being squeezed to fit, and the rest is a
 * pan away. Drag to pan, pinch or ⌘-scroll to zoom,
 * click a screen to select it (the button above it then opens it to be used);
 * double-click the canvas itself to zoom in there.
 *
 * Nothing is laid out until the room has stopped changing — it opens while the
 * page's side column is still closing — so what is fitted is centred in the
 * room it ends up with. The screens then show as skeletons for a moment while
 * they load and play their own entrance animations out of sight, and fade in
 * together.
 *
 * Comments show on the screens they were left on, and can be left on any
 * screen: a click on one is turned into a place inside that screen's own page.
 *
 * Where a version can be edited (`picking`), the element under the pointer is
 * outlined as a comment's target is, and a click on a screen selects that
 * element as well as the screen, which opens the page's edit panel for it. A
 * double-click on words types over them where they are. The canvas's own
 * gestures are the same with or without: nothing is a mode here. A screen is
 * opened to be used from the button above it, once it is selected.
 *
 * Several devices can be looked at together (`devices`): each screen is then
 * shown once for each, side by side where the screen stands, so the same
 * screen is seen at every size at a glance. A screen on a device is a copy,
 * with a page, a place and a key of its own (`copyKey`), and everything said
 * here of a screen is true of each copy. An arrow runs from one screen's
 * copies to the next's, not between each pair.
 *
 * Everything that has to stay the same size however far you zoom — the
 * names, the arrows and their labels — is drawn in screen space over the
 * canvas; only the screens themselves live in the zoomed world.
 */
export function FlowCanvas({
  flow,
  base,
  device,
  devices = [device],
  comments,
  setups,
  controls,
  zoom = 1,
  fit = false,
  inApp,
  fold = false,
  ready,
  inspect,
  sheet,
  picking,
}: {
  flow: Flow;
  /** The prototype's address, without any screen's parameters. */
  base: string;
  device: Device;
  /** The devices on the canvas: every screen is shown on each, side by side. Without it, only `device`. */
  devices?: Device[];
  comments?: CommentsUi;
  /** When the screens are variants of the prototype rather than steps of a flow: the setup (see `Comment`) each one shows. A comment shows only on the screen of its setup, and is left on it. */
  setups?: Record<string, string>;
  /** How the prototype is looked at (the phone it is shown on), offered above a screen opened to be used. */
  controls?: (info: { scale: number | null; device?: Device }) => React.ReactNode;
  /** The size a screen opened to be used is drawn at, as in the prototype's own view; `fit` scales it to the room instead. */
  zoom?: number;
  fit?: boolean;
  /** The app a phone is opened inside, drawn round a screen while it is opened to be used. */
  inApp?: InApp;
  /** Fades what is below where each screen's device height ends, when the page runs on past it. */
  fold?: boolean;
  /** Which screens have been handed off to engineering (see `Ready for dev`): each is marked beside its name. */
  ready?: (screenId: string) => boolean;
  /** Engineers looking at a handed-off version: a tap on a screen selects the part of the handoff under it (outlined), and says which. */
  inspect?: { elements: SourceEl[]; onSelect: (selection: Selection | null) => void; /** What is selected now: one made elsewhere (the panel's list) is outlined on the screens too. */ selection: Selection | null };
  /** A handed-off version's components marked as new: drawn in a frame after the last screen, at each device that is on. */
  sheet?: { marks: Mark[] };
  /**
   * The version can be edited: a click on a screen selects the part under it as well. `target` is the one selected, as
   * its page describes it; `onPick` is told the next and the frame it is in, or null when it is let go of; `onText` is
   * given words typed over a part. `busy` is edits made and not saved, which ⌘Z is then for; `onPage` is told when a
   * page the edits should show on has loaded.
   */
  picking?: {
    target: Part | null;
    onPick: (frame: HTMLIFrameElement | null, part: Part | null, scope?: Document | null) => void;
    onText: (part: Part, text: string) => void;
    busy: boolean;
    onPage: () => void;
  };
}) {
  // A screen on a device is a copy. Everything below that is kept for a screen (its page's height, where it was dragged to,
  // whether it is selected, the pins on it) is kept under its copy's key, so each copy has its own.
  // The components placed on the canvas are screens too (one copy each, on a device the size of the component), kept as they were left (see lib/canvas-saved.ts).
  const [pieces, setPieces] = useState<Piece[]>(() => readCanvas(base).pieces);
  const pieceCopies = pieces.map((piece, index) => ({ id: copyKey("stage", piece.id), screen: pieceScreen(piece), device: pieceDevice(piece), index: flow.screens.length + index }));
  const copies = [...devices.flatMap((on) => flow.screens.map((screen, index) => ({ id: copyKey(on.id, screen.id), screen, device: on, index }))), ...pieceCopies];
  const copyOf = new Map(copies.map((copy) => [copy.id, copy]));
  // Every device that has been on since the canvas opened, in the order they were switched on. A device switched off
  // keeps its pages, out of sight, so switching it on again shows them as they were instead of loading them again.
  // The order never changes: a frame moved in the page loads again.
  const [seen, setSeen] = useState(devices);
  const unseen = devices.filter((on) => !seen.some((was) => was.id === on.id));
  if (unseen.length) setSeen([...seen, ...unseen]);
  const kept = [...[...seen, ...unseen].flatMap((on) => flow.screens.map((screen, index) => ({ id: copyKey(on.id, screen.id), screen, device: on, index }))), ...pieceCopies];
  // Nothing is shown while the pages load: a quiet loader, then every screen arrives together, left to right, at the size it will stay.
  // That is once. A device switched on later has its screens put in place at once, each a breathing placeholder that
  // its page fades in over when it has loaded, so the room made for it is never blank; the rest stay as they are.
  const [readyIds, setReadyIds] = useState<ReadonlySet<string>>(new Set());
  const [saying] = useState(() => LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
  const [revealed, setRevealed] = useState(false);
  // The screens that were there for that arrival: only they come in together.
  const [opening, setOpening] = useState<ReadonlySet<string>>(new Set());
  if (!revealed && copies.every((copy) => readyIds.has(copy.id))) {
    setRevealed(true);
    setOpening(new Set(copies.map((copy) => copy.id)));
  }
  const arrived = (id: string) => revealed && readyIds.has(id);
  // Once they have arrived it is forgotten, or a screen hidden with its device and shown again would arrive a second time.
  useEffect(() => {
    if (!revealed) return undefined;
    const timer = window.setTimeout(() => setOpening(new Set()), ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);
  const without = (ids: ReadonlySet<string>, id: string) => {
    if (!ids.has(id)) return ids;
    const next = new Set(ids);
    next.delete(id);
    return next;
  };
  // Every screen is a whole page: as tall as it turns out to be once it has loaded, so none is cut off.
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  // What of a placed component shows, when the frame it is in clips: the frame's edge, as an inset from the component's own box.
  const clipOf = (id: string, spot: { x: number; y: number }) => {
    const parent = isPiece(id) ? pieces.find((piece) => copyKey("stage", piece.id) === id)?.parent : undefined;
    const frame = parent ? shapes.find((one) => one.id === parent) : undefined;
    if (!frame?.clip) return undefined;
    const inset = (n: number) => Math.max(0, n);
    return `inset(${inset(frame.y - spot.y)}px ${inset(spot.x + widthOf(id) - (frame.x + frame.width))}px ${inset(spot.y + heightOf(id) - (frame.y + frame.height))}px ${inset(frame.x - spot.x)}px)`;
  };
  // A placed component is the size of the component itself (measured when its page has loaded), never a page's height.
  const pageHeight = (id: string) => (isPiece(id) ? copyOf.get(id)?.device.height : pageHeights[id]) ?? copyOf.get(id)?.device.height ?? 0;
  const heightOf = (id: string) => pageHeight(id) * SCREEN_SCALE;
  const widthOf = (id: string) => (copyOf.get(id)?.device.width ?? 0) * SCREEN_SCALE;
  // The layout as for one device, each screen's place wide enough for all its copies side by side and as tall as the
  // tallest of them. What is measured here is the screens alone, without the gap after the last.
  const group = devices.reduce((sum, on) => sum + on.width * SCREEN_SCALE, 0) + DEVICE_GAP * (devices.length - 1);
  const tallest = (id: string) => Math.max(...devices.map((on) => heightOf(copyKey(on.id, id))));
  const laid = layoutFlow(flow, { width: group + GAP.x, height: 0 }, Infinity, (id) => tallest(id) + GAP.y + LABEL_HEIGHT);
  const placed = spreadCopies(laid.placed, devices.map((on) => ({ id: on.id, width: on.width * SCREEN_SCALE })), DEVICE_GAP);
  const flowWidth = laid.width - GAP.x;
  const flowHeight = laid.height - GAP.y;
  // The frame of components stands after the last screen, and is fitted with them once it has said how big it is.
  const [sheetSize, setSheetSize] = useState({ width: 0, height: 0 });
  const withSheet = !!sheet?.marks.length;
  const width = withSheet ? flowWidth + GAP.x + sheetSize.width : flowWidth;
  const height = withSheet ? Math.max(flowHeight, sheetSize.height) : flowHeight;
  // How far each screen has been dragged from where the layout put it, in the canvas's own units.
  const [offsets, setOffsets] = useState<Offsets>(() => readCanvas(base).offsets);
  // Kept as they change, so the canvas is as it was left when it is opened again.
  // The frames drawn with the F tool (see below), kept the same way.
  const [shapes, setShapes] = useState<CanvasFrame[]>(() => readCanvas(base).frames);
  useEffect(() => writeCanvas(base, { offsets, pieces, frames: shapes }), [base, offsets, pieces, shapes]);
  // Each finished move, so ⌘Z puts a screen back where it was and ⇧⌘Z (or ⌘Y) moves it again.
  const offsetsNow = useRef(offsets);
  useEffect(() => {
    offsetsNow.current = offsets;
  });
  const moves = useRef<{ past: Move[]; future: Move[] }>({ past: [], future: [] });
  // A screen opened to be used where it is: grown into the middle of the canvas over a scrim, rather than the canvas being left.
  const [opened, setInteract] = useState<{ id: string; open: boolean } | null>(null);
  const interact = opened && copyOf.has(opened.id) ? opened : null;
  // The page that opening a screen shows is loaded as soon as the screen is selected, so it is there when it is asked for; this is
  // which screen's has arrived. It is the same page whichever device's copy is selected, only a different size.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Whether the opened page has been scrolled down, for Safari's bar, which shrinks to a pill. Read again each time a page loads.
  const [scrolledDown, setScrolledDown] = useState(false);
  const stopWatching = useRef<() => void>(undefined);
  useEffect(() => () => stopWatching.current?.(), []);
  const interactNow = useRef(false);
  useEffect(() => {
    interactNow.current = !!interact;
  });
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  // The screens sit below their names, where the layout put them or where they were dragged to.
  const at = (id: string) => {
    const spot = placed.get(id) ?? { x: 0, y: 0 };
    const moved = offsets[id] ?? { x: 0, y: 0 };
    return { x: spot.x + moved.x, y: spot.y + LABEL_HEIGHT + moved.y };
  };

  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // The camera owns the view and writes it to the world and the dot grid itself, once per frame (see lib/canvas-camera.ts); React
  // reads where it is, so everything drawn from the view still follows it. A glide is the browser's own transition, set by the camera.
  const camera = useMemo(
    () =>
      new CanvasCamera(
        { x: 0, y: 0, scale: 1 },
        {
          limits: { min: MIN_ZOOM, max: MAX_ZOOM },
          glideTransition: {
            world: "transform var(--dur-deliberate) var(--curve-standard)",
            grid: "background-position var(--dur-deliberate) var(--curve-standard), background-size var(--dur-deliberate) var(--curve-standard)",
          },
        },
      ),
    [],
  );
  const view = useSyncExternalStore(camera.subscribe, () => camera.target, () => camera.target);
  const worldEl = useRef<HTMLDivElement>(null);
  // Whether screens are drawn as static copies of their pages (lib/screen-copies.ts) instead of the pages running. Only while developing, for now.
  const [copiesChosen, chooseCopies] = useCopiesChoice();
  useLayoutEffect(() => {
    camera.attach({ world: worldEl.current, grid: box.current, gridStep: 24 }, Math.max(window.innerWidth, window.innerHeight));
    return () => camera.detach();
  }, [camera]);
  const [selected, setSelected] = useState<string | null>(null);
  // The selected screen can be used where it stands: its page takes the pointer, so an accordion opens and a form works, and the
  // canvas keeps showing it as it was left. Only the selected one; selecting another, or pressing the canvas, ends it.
  const [using, setUsing] = useState<string | null>(null);
  const usingId = using && using === selected ? using : null;
  // The main view's device was changed from here (the menu above an opened screen): its copies are now that device's, and
  // the screen that was open, or selected on the device that went, is the same screen there.
  const [mainId, setMainId] = useState(device.id);
  if (mainId !== device.id) {
    setMainId(device.id);
    const there = (id: string) => copyKey(device.id, screenOfCopy(id));
    if (opened) setInteract({ ...opened, id: there(opened.id) });
    if (selected && (opened || !copyOf.has(selected))) setSelected(there(selected));
  }
  // Until somebody pans or zooms, the canvas keeps what it shows fitted and centred as the room changes.
  const touched = useRef(false);
  // A zoom that is a single step (a double-click, plus or minus) glides to where it is going; anything done by hand follows the hand.
  const touch = (value: boolean) => {
    touched.current = value;
  };

  // Comments: each screen is its own live page, so a comment is looked for in every one of them.
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  // A screen drawn as a copy has no frame to ask: its page is answered from what was recorded when it was read (see copy-page.ts).
  const copyPages = useRef(new Map<string, FramePage>());
  const [spotted, setFound] = useState<{ key: string; id: string; copyId: string; spot: Spot }[]>([]);
  // Not those on a device that has just been switched off, until they are read again.
  const found = spotted.filter((item) => copyOf.has(item.copyId));
  // The copy a pin was tapped on, which is where its comment opens: the same comment may be pinned on several.
  const [pinOn, setPinOn] = useState<{ id: string; copyId: string } | null>(null);
  const [draft, setDraft] = useState<{ anchor: Anchor; copyId: string } | null>(null);
  const [retry, setRetry] = useState({ text: "" });
  // Where the canvas is in the window, so a card can be drawn outside its clipping and still sit by its pin.
  const [origin, setOrigin] = useState({ left: 0, top: 0 });
  const placing = !!comments?.placing;
  const selecting = !!picking;
  // The part of a handoff selected on a screen (see `inspect`), and where it is in that screen's pixels.
  const [inspected, setInspected] = useState<{ id: string; copyId: string; box: Box } | null>(null);
  // The same part on the screen's other copies (the same page on the other devices that are on), so it is plain they are one.
  const [echoes, setEchoes] = useState<{ key: string; copyId: string; box: Box }[]>([]);
  // The same element as one selected on `copy`, on that screen's other copies, by how each finds it.
  const echo = async (copy: { id: string; screen: { id: string } }, key: string, find: (frame: HTMLIFrameElement) => Promise<Box | null>) => {
    const others = copies.filter((item) => item.screen.id === copy.screen.id && item.id !== copy.id);
    const boxes = await Promise.all(others.map(async (item) => ({ copyId: item.id, box: frames.current.get(item.id) ? await find(frames.current.get(item.id)!) : null })));
    setEchoes(boxes.flatMap((item) => (item.box ? [{ key, copyId: item.copyId, box: item.box }] : [])));
  };
  const inspecting = useRef(false);
  // What the canvas itself last selected: a different selection arriving is made elsewhere, and is outlined here too.
  const chosen = useRef("");
  const select = (selection: Selection | null) => {
    inspecting.current = !!selection;
    chosen.current = selection ? targetOf(selection) : "";
    inspect?.onSelect(selection);
  };
  const wanted = inspect?.selection ? targetOf(inspect.selection) : "";
  useEffect(() => {
    const selection = inspect?.selection;
    if (!inspect || wanted === chosen.current) return;
    chosen.current = wanted;
    inspecting.current = !!selection;
    let alive = true;
    const row = selection?.kind === "section" ? (selection.line <= 1 && selection.endLine >= 9999 ? componentRoots(inspect.elements).find((item) => item.file === selection.file) : inspect.elements.find((item) => item.file === selection.file && item.line === selection.line && item.endLine === selection.endLine)) : undefined;
    void Promise.all(copies.map(async (copy) => ({ copy, box: row && frames.current.get(copy.id) ? await handoffPartBox(frames.current.get(copy.id)!, row.find, 0) : null }))).then((found) => {
      if (!alive) return;
      const shown = found.filter((item) => item.box);
      const first = shown[0];
      setInspected(first && row ? { id: `${row.file}:${row.line}`, copyId: first.copy.id, box: first.box! } : null);
      setEchoes(first && row ? shown.slice(1).map((item) => ({ key: `${row.file}:${row.line}`, copyId: item.copy.id, box: item.box! })) : []);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  const inspectAt = async (clientX: number, clientY: number) => {
    const found = inspect && pointIn(clientX, clientY);
    // The handoff reads the code under a point through the live page.
    if (!inspect || !found || !found.frame) return;
    const hit = await handoffSourceAt(found.frame, found.x, found.y, inspect.elements);
    const key = hit ? `${hit.file}:${hit.line}` : "";
    setInspected(hit ? { id: key, copyId: found.copy.id, box: hit.box } : null);
    setEchoes([]);
    // Whatever is tapped is a section of the code; on bare page it is the screen itself.
    select(hit ? { kind: "section", file: hit.file, line: hit.line, endLine: hit.endLine, screenId: found.copy.screen.id } : { kind: "frame", screenId: found.copy.screen.id });
    if (hit) void echo(found.copy, key, (frame) => handoffPartBox(frame, hit.find, hit.index));
  };
  // The element selected to edit, and the screen it is on; only while it is still the one the page holds.
  const [pickedOn, setPickedOn] = useState<{ selector: string; copyId: string } | null>(null);
  const picked = pickedOn && copyOf.has(pickedOn.copyId) && picking?.target && pickedOn.selector === picking.target.selector ? { copyId: pickedOn.copyId, part: picking.target } : null;
  // Words being typed over, on the screen they are on.
  const [typed, setTyping] = useState<{ part: Part; copyId: string } | null>(null);
  const typing = typed && copyOf.has(typed.copyId) ? typed : null;
  const pickingNow = useRef(picking);
  useEffect(() => {
    pickingNow.current = picking;
  });
  const [wasPlacing, setWasPlacing] = useState(false);
  if (placing !== wasPlacing) {
    setWasPlacing(placing);
    // Leaving comment mode drops one that was never posted.
    if (!placing) setDraft(null);
  }

  // The part of the canvas that isn't under the toolbar.
  const clear = (room: { width: number; height: number }) => ({ width: room.width - INSET.side * 2, height: room.height - INSET.top - INSET.side });

  // As tall as the room, and as wide as the row is: the start of it at the left, unless all of it fits.
  const fitted = (room: { width: number; height: number }): View => fitView({ width, height }, room, INSET, MIN_ZOOM);

  // Laid out once the room has stopped changing.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let timer = 0;
    const observer = new ResizeObserver(([entry]) => {
      const room = { width: entry.contentRect.width, height: entry.contentRect.height };
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSize(room), SETTLE_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // And kept fitted as the room or the row changes (a page turning out taller), until somebody moves it.
  useEffect(() => {
    if (size && !touched.current) camera.set(fitted(size), { glide: revealed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, width, height]);

  // Once somebody has moved the view it is left where it is; but a device switched on or off moves every screen after
  // the first along, so the view goes as far as the copy nearest its middle did, and what is on screen stays put.
  const stood = useRef(placed);
  const shown = devices.map((on) => on.id).join();
  useLayoutEffect(() => {
    const before = stood.current;
    if (!size || !touched.current) return;
    camera.update((now) => {
      const shift = followShift(before, placed, { x: (size.width / 2 - now.x) / now.scale, y: (size.height / 2 - now.y) / now.scale });
      return shift.x || shift.y ? { ...now, x: now.x - shift.x * now.scale, y: now.y - shift.y * now.scale } : now;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  // After the above, which looks at where the copies stood before this change.
  useLayoutEffect(() => {
    stood.current = placed;
  });

  const list = comments?.list;
  const visible = !!comments?.visible;
  const last = useRef("");
  const read = () => {
    if (!list) return;
    const next: typeof found = [];
    for (const { id: copyId, screen } of copies) {
      const frame = frames.current.get(copyId);
      if (!frame) continue;
      const anchors: Record<string, Anchor> = {};
      for (const comment of list) {
        if (setups && setupOf(comment.variant) !== setupOf(setups[screen.id])) continue;
        if (comment.device && comment.device !== copyOf.get(copyId)?.device.id) continue;
        anchors[comment.id] = comment.anchor;
      }
      if (draft?.copyId === copyId) anchors.draft = draft.anchor;
      const spots = pageOf(frame).spots(anchors) ?? {};
      for (const [id, spot] of Object.entries(spots)) next.push({ key: id === "draft" ? "draft" : `${id}@${copyId}`, id, copyId, spot });
    }
    const rect = box.current?.getBoundingClientRect();
    const moved = { left: rect?.left ?? 0, top: rect?.top ?? 0 };
    const signature = JSON.stringify([next, moved]);
    if (signature !== last.current) {
      last.current = signature;
      setFound(next);
      setOrigin(moved);
    }
  };
  usePinWatch(() => [...frames.current.values()], read, visible && !!list, [list, draft, flow, setups, copies.map((copy) => copy.id).join()]);

  // Asked for a comment from somewhere else (the list, a link): zoom to the screen it is on (the first device's copy
  // that has it), filling the clear part of the canvas. A pin tapped here is already in view, so it opens where it is and the canvas stays as it was left.
  const tapped = useRef<string | null>(null);
  const here = useRef(found);
  useEffect(() => {
    here.current = found;
  });
  const asked = comments?.focus;
  useEffect(() => {
    if (!asked || !size) return;
    if (tapped.current === asked.id) {
      tapped.current = null;
      return;
    }
    setPinOn(null);
    const entry = here.current.find((item) => item.id === asked.id);
    if (!entry) return;
    const spot = at(entry.copyId);
    const space = clear(size);
    const tall = heightOf(entry.copyId);
    const scale = Math.min(MAX_ZOOM, space.width / widthOf(entry.copyId), space.height / tall);
    touch(true);
    camera.set({ scale, x: size.width / 2 - (spot.x + widthOf(entry.copyId) / 2) * scale, y: INSET.top + space.height / 2 - (spot.y + tall / 2) * scale });
    // Only when asked, not each time the layout or the size moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  const zoomAt = (px: number, py: number, factor: number, animate = false) => {
    touch(true);
    camera.update((now) => zoomAbout(now, px, py, factor, { min: MIN_ZOOM, max: MAX_ZOOM }), { glide: animate });
  };

  // Pinch (which arrives as ctrl-wheel) and ⌘-scroll zoom; plain scrolling pans.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Over an opened screen the canvas stays where it is, and the browser isn't zoomed instead.
      if (interactNow.current) return;
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.01));
      } else {
        touch(true);
        camera.panBy(-event.deltaX, -event.deltaY);
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    // Safari sends a pinch as gesture events, not as ctrl-wheel, and zooms the whole page unless they are taken.
    let pinched = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      pinched = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      if (interactNow.current) return;
      const gesture = event as Event & { scale: number; clientX?: number; clientY?: number };
      const rect = element.getBoundingClientRect();
      zoomAt((gesture.clientX ?? rect.left + rect.width / 2) - rect.left, (gesture.clientY ?? rect.top + rect.height / 2) - rect.top, gesture.scale / pinched);
      pinched = gesture.scale;
    };
    const onGestureEnd = (event: Event) => event.preventDefault();
    element.addEventListener("gesturestart", onGestureStart);
    element.addEventListener("gesturechange", onGestureChange);
    element.addEventListener("gestureend", onGestureEnd);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
      element.removeEventListener("gestureend", onGestureEnd);
    };
    // Set up once: what it calls only sets state and a ref, which don't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape lets go of a selected screen first; with none selected it falls through, and the page closes the canvas.
  const selectedNow = useRef(selected);
  useEffect(() => {
    selectedNow.current = selected;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape in a text box is that box's own (words being typed over a part).
      if (event.key !== "Escape" || (event.target as HTMLElement | null)?.tagName === "TEXTAREA") return;
      // An opened screen goes back first, then a selection lets go, then the page closes the canvas.
      if (interactNow.current) {
        event.stopPropagation();
        closeInteract();
        return;
      }
      // The frame tool goes first, then a frame that is selected.
      if (bunchNow.current.copies.length || bunchNow.current.frames.length) {
        event.stopPropagation();
        setBunch({ copies: [], frames: [] });
        return;
      }
      if (framingNow.current || shapeNow.current) {
        event.stopPropagation();
        if (framingNow.current) {
          setFraming(false);
          setSketch(null);
        } else setShape(null);
        return;
      }
      if (!selectedNow.current) return;
      // With an element selected in it too, the same press lets go of both: the page hears it and lets go of its part.
      if (!pickingNow.current?.target) event.stopPropagation();
      setSelected(null);
    };
    // Before the page's own, which listens after this in the same pass.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA"].includes(target?.tagName ?? "")) return;
      // A canvas that is closed stays loaded out of sight: its keys are not for it then.
      if (box.current?.closest("[inert]")) return;
      // With edits made and not saved, these keys undo and redo those (the page's own doing), not where a screen was moved to.
      if (pickingNow.current?.busy) return;
      const redo = key === "y" || event.shiftKey;
      const { past, future } = moves.current;
      const move = redo ? future.pop() : past.pop();
      if (!move) return;
      event.preventDefault();
      (redo ? past : future).push(move);
      setOffsets((now) => ({ ...now, [move.id]: redo ? move.to : move.from }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A press on a screen or its name moves that screen (`screen`, from where it was: `origin`), and only that screen (or all that are
  // selected together, if it is one of them). One on the canvas around them draws a box that selects what it touches; with Space
  // held, a press anywhere pans instead, as in Figma.
  const drag = useRef<{ x: number; y: number; from: View; moved: boolean; pan: boolean; /** Pressed with Space (or the middle button): only moves the view, and leaves the selection as it is. */ spaced?: boolean; lasso?: boolean; screen?: string; origin?: { x: number; y: number }; group?: GroupBase } | null>(null);
  const space = useRef(false);
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    const hold = (on: boolean) => {
      space.current = on;
      setPanning(on);
    };
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // A screen is a button, and is focused once tapped: Space still pans then. Any other button keeps Space for itself.
      const onScreen = !!target?.closest("[data-screen]");
      if (event.code !== "Space" || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || (target?.tagName === "BUTTON" && !onScreen)) return;
      event.preventDefault();
      if (!event.repeat) hold(true);
    };
    const up = (event: KeyboardEvent) => event.code === "Space" && hold(false);
    const away = () => hold(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", away);
    };
  }, []);
  // Several things selected at once, by a box drawn round them: screens (by their copies' keys) and frames. One thing is the ordinary selection.
  const [bunch, setBunch] = useState<{ copies: string[]; frames: string[] }>({ copies: [], frames: [] });
  const bunchNow = useRef(bunch);
  useEffect(() => {
    bunchNow.current = bunch;
  });
  const [lasso, setLasso] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  // Where everything in the group is, to move it all by the same distance from there. What is in a selected frame goes with it.
  const groupBase = (): GroupBase => {
    const keys = new Set(bunch.copies);
    for (const id of bunch.frames) for (const key of childrenOf(id)) keys.add(key);
    return {
      copies: Object.fromEntries([...keys].map((key) => [key, offsets[key] ?? { x: 0, y: 0 }])),
      frames: Object.fromEntries(shapes.filter((one) => bunch.frames.includes(one.id)).map((one) => [one.id, { x: one.x, y: one.y }])),
    };
  };
  const moveGroup = (base: GroupBase, dx: number, dy: number) => {
    setOffsets((now) => ({ ...now, ...Object.fromEntries(Object.entries(base.copies).map(([key, from]) => [key, { x: from.x + dx, y: from.y + dy }])) }));
    setShapes((now) => now.map((one) => (base.frames[one.id] ? { ...one, x: base.frames[one.id].x + dx, y: base.frames[one.id].y + dy } : one)));
  };
  // What a box drawn from one corner to another (in the canvas's window) touches: a frame, or a screen not already in a frame that is touched.
  const touching = (area: { x: number; y: number; x2: number; y2: number }) => {
    const now = camera.target;
    const left = (Math.min(area.x, area.x2) - now.x) / now.scale;
    const top = (Math.min(area.y, area.y2) - now.y) / now.scale;
    const right = (Math.max(area.x, area.x2) - now.x) / now.scale;
    const bottom = (Math.max(area.y, area.y2) - now.y) / now.scale;
    const hits = (x: number, y: number, width: number, height: number) => x < right && x + width > left && y < bottom && y + height > top;
    const frames = shapes.filter((one) => hits(one.x, one.y, one.width, one.height)).map((one) => one.id);
    const screens = copies
      .filter((copy) => {
        const spot = at(copy.id);
        const parent = parentOf(copy.id);
        return hits(spot.x, spot.y, widthOf(copy.id), heightOf(copy.id)) && !(parent && frames.includes(parent));
      })
      .map((copy) => copy.id);
    return { copies: screens, frames };
  };
  // Alt held: measures from what is selected to what the pointer is over, as Figma's redlines do (see `measured` below). The pointer's place is kept
  // as it moves (in the canvas's own units), so pressing Alt with it still shows at once.
  const [alt, setAlt] = useState(false);
  const altNow = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const worldOf = (clientX: number, clientY: number) => {
    const rect = box.current!.getBoundingClientRect();
    const now = camera.target;
    return { x: (clientX - rect.left - now.x) / now.scale, y: (clientY - rect.top - now.y) / now.scale };
  };
  useEffect(() => {
    const hold = (on: boolean) => {
      altNow.current = on;
      setAlt(on);
      if (on && lastPointer.current && box.current) setCursor(worldOf(lastPointer.current.x, lastPointer.current.y));
    };
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "Alt" || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A canvas that is closed stays loaded out of sight: its keys are not for it then.
      if (box.current?.closest("[inert]")) return;
      if (!event.repeat) hold(true);
    };
    const up = (event: KeyboardEvent) => event.key === "Alt" && hold(false);
    const away = () => hold(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", away);
    };
    // `worldOf` only reads refs and the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Alignment guides while something is moved (see lib/canvas-geometry.ts): where it lines up with another thing's edge or middle it snaps there, and a line shows where.
  // Holding ⌘ or Ctrl moves it freely. What is moved, and what is in a frame that is moved, is not something to line up with.
  const [guides, setGuides] = useState<Guide[]>([]);
  const everythingBut = (skip: ReadonlySet<string>): Rect[] => [
    ...copies.filter((copy) => !skip.has(copy.id)).map((copy) => ({ id: copy.id, ...at(copy.id), width: widthOf(copy.id), height: heightOf(copy.id) })),
    ...shapes.filter((one) => !skip.has(`frame:${one.id}`)).map((one) => ({ id: `frame:${one.id}`, x: one.x, y: one.y, width: one.width, height: one.height })),
  ];
  const lineUp = (moving: Rect, skip: ReadonlySet<string>, free: boolean) => {
    if (free) {
      setGuides((now) => (now.length ? [] : now));
      return { dx: 0, dy: 0 };
    }
    const result = snapMove(moving, everythingBut(skip), SNAP_PX / camera.target.scale);
    setGuides(result.guides);
    return result;
  };
  // A group of things moving together is one rectangle: the box round them all, `dx`, `dy` from where they were.
  const groupRect = (base: GroupBase, dx: number, dy: number): { rect: Rect; skip: Set<string> } => {
    const boxes: Rect[] = [
      ...Object.entries(base.copies).map(([key, from]) => {
        const rest = placed.get(key) ?? { x: 0, y: 0 };
        return { id: key, x: rest.x + from.x + dx, y: rest.y + LABEL_HEIGHT + from.y + dy, width: widthOf(key), height: heightOf(key) };
      }),
      ...shapes.filter((one) => base.frames[one.id]).map((one) => ({ id: `frame:${one.id}`, x: base.frames[one.id].x + dx, y: base.frames[one.id].y + dy, width: one.width, height: one.height })),
    ];
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    return {
      rect: { id: "group", x: left, y: top, width: Math.max(...boxes.map((box) => box.x + box.width)) - left, height: Math.max(...boxes.map((box) => box.y + box.height)) - top },
      skip: new Set(boxes.map((box) => box.id)),
    };
  };
  // F: the frame tool. A drag draws a frame (a click makes a square one), and the tool is let go of when it has. Escape lets go of it first.
  const [framing, setFraming] = useState(false);
  const [sketch, setSketch] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [shape, setShape] = useState<string | null>(null);
  // The frame under the pointer, outlined as an element is on a page. What is in a frame is reached through it, as on a page: pointing at it
  // is pointing at the frame, and ⌘ (or Ctrl) reaches the piece in it, and then the element in that.
  const [hoverShape, setHoverShape] = useState<string | null>(null);
  const parentOf = (id: string) => (isPiece(id) ? pieces.find((piece) => copyKey("stage", piece.id) === id)?.parent : undefined);
  const framingNow = useRef(false);
  const shapeNow = useRef<string | null>(null);
  useEffect(() => {
    framingNow.current = framing;
    shapeNow.current = shape;
  });
  const removeFrameNow = useRef<(id: string) => void>(() => {});
  const deleteGroupNow = useRef<(together: { copies: string[]; frames: string[] }) => void>(() => {});
  const movingShape = useRef<{ id: string; x: number; y: number; from: { x: number; y: number }; scale: number; group?: GroupBase } | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A canvas that is closed stays loaded out of sight: its keys are not for it then.
      if (box.current?.closest("[inert]")) return;
      if (event.key.toLowerCase() === "v" && !event.repeat) {
        setSketch(null);
        setFraming(false);
      } else if (event.key.toLowerCase() === "f" && !event.repeat) {
        setShape(null);
        setSketch(null);
        setFraming((on) => !on);
      } else if (event.key === "Backspace" || event.key === "Delete") {
        // Anything put on the canvas can go: a frame, or a placed component. The prototype's own screens stay.
        const frame = shapeNow.current;
        const piece = selectedNow.current && isPiece(selectedNow.current) ? selectedNow.current : null;
        const together = bunchNow.current;
        if (!frame && !piece && !together.copies.length && !together.frames.length) return;
        event.preventDefault();
        if (!frame && !piece) {
          // A group: its frames (and what is in them) and placed components go; the prototype's own screens stay.
          deleteGroupNow.current(together);
        } else if (frame) {
          removeFrameNow.current(frame);
        } else if (piece) {
          setPieces((was) => was.filter((one) => copyKey("stage", one.id) !== piece));
          setOffsets((was) => Object.fromEntries(Object.entries(was).filter(([key]) => key !== piece)));
          setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    removeFrameNow.current = removeFrame;
    deleteGroupNow.current = (together) => {
      const gone = new Set(together.copies.filter(isPiece));
      for (const id of together.frames) for (const key of childrenOf(id)) gone.add(key);
      setPieces((now) => now.filter((piece) => !gone.has(copyKey("stage", piece.id))));
      setOffsets((now) => Object.fromEntries(Object.entries(now).filter(([key]) => !gone.has(key))));
      setShapes((now) => now.filter((one) => !together.frames.includes(one.id)));
      setBunch({ copies: [], frames: [] });
    };
  });
  // A frame of a device's size, in the middle of what is in view; the canvas draws a device at half its size, and a frame is the same, so it holds what is put in it at the right proportion.
  const placeDevice = (on: Device) => {
    if (!size) return;
    const now = camera.target;
    const [width, height] = [on.width * SCREEN_SCALE, on.height * SCREEN_SCALE];
    const centre = { x: (size.width / 2 - now.x) / now.scale, y: (size.height / 2 - now.y) / now.scale };
    const frame: CanvasFrame = { id: `frame-${Math.random().toString(36).slice(2, 8)}`, name: on.name, x: centre.x - width / 2, y: centre.y - height / 2, width, height, fill: "#ffffff" };
    setShapes((was) => [...was, frame]);
    setShape(frame.id);
    setSelected(null);
    setFraming(false);
  };
  const addFrame = (area: { x: number; y: number; x2: number; y2: number }) => {
    const now = camera.target;
    const wide = Math.abs(area.x2 - area.x) >= 4 && Math.abs(area.y2 - area.y) >= 4;
    const x = (Math.min(area.x, area.x2) - now.x) / now.scale;
    const y = (Math.min(area.y, area.y2) - now.y) / now.scale;
    const frame: CanvasFrame = {
      id: `frame-${Math.random().toString(36).slice(2, 8)}`,
      name: `Frame ${shapes.length + 1}`,
      x,
      y,
      width: wide ? Math.abs(area.x2 - area.x) / now.scale : 100,
      height: wide ? Math.abs(area.y2 - area.y) / now.scale : 100,
      fill: "#ffffff",
    };
    setShapes((was) => [...was, frame]);
    setShape(frame.id);
    setSelected(null);
  };

  // A frame's changes, and what goes with it: what is in a frame moves with it, and goes with it.
  const childrenOf = (frameId: string) => pieces.filter((piece) => piece.parent === frameId).map((piece) => copyKey("stage", piece.id));
  const updateFrame = (id: string, patch: Partial<CanvasFrame>) => {
    const was = shapes.find((one) => one.id === id);
    if (!was) return;
    const dx = (patch.x ?? was.x) - was.x;
    const dy = (patch.y ?? was.y) - was.y;
    if (dx || dy) {
      const inside = childrenOf(id);
      setOffsets((now) => ({ ...now, ...Object.fromEntries(inside.map((key) => [key, { x: (now[key]?.x ?? 0) + dx, y: (now[key]?.y ?? 0) + dy }])) }));
    }
    setShapes((now) => now.map((one) => (one.id === id ? { ...one, ...patch } : one)));
  };
  const removeFrame = (id: string) => {
    const inside = new Set(childrenOf(id));
    setPieces((now) => now.filter((piece) => piece.parent !== id));
    setOffsets((now) => Object.fromEntries(Object.entries(now).filter(([key]) => !inside.has(key))));
    setShapes((now) => now.filter((one) => one.id !== id));
    setShape(null);
  };
  // The frame a point is in, the one drawn last where several overlap; what is put down there belongs to it.
  const frameAt = (x: number, y: number) => [...shapes].reverse().find((one) => x >= one.x && x <= one.x + one.width && y >= one.y && y <= one.y + one.height)?.id;
  // Z held: a drag draws a box, and letting go puts the view there at once.
  const [zooming, setZooming] = useState(false);
  const [marquee, setMarquee] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  useEffect(() => {
    const hold = (on: boolean) => {
      setZooming(on);
      if (!on) setMarquee(null);
    };
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== "z" || event.metaKey || event.ctrlKey || event.altKey || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A canvas that is closed stays loaded out of sight: its keys are not for it then.
      if (box.current?.closest("[inert]")) return;
      if (!event.repeat) hold(true);
    };
    const up = (event: KeyboardEvent) => event.key.toLowerCase() === "z" && hold(false);
    const away = () => hold(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", away);
    };
  }, []);
  const zoomTo = (area: { x: number; y: number; x2: number; y2: number }) => {
    const width = Math.abs(area.x2 - area.x);
    const height = Math.abs(area.y2 - area.y);
    if (!size || width < 4 || height < 4) return false;
    const now = camera.target;
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, now.scale * Math.min(size.width / width, size.height / height)));
    // The middle of the box, in the canvas's own units, goes to the middle of the window.
    const centre = { x: (Math.min(area.x, area.x2) + width / 2 - now.x) / now.scale, y: (Math.min(area.y, area.y2) + height / 2 - now.y) / now.scale };
    touch(true);
    camera.set({ scale, x: size.width / 2 - centre.x * scale, y: size.height / 2 - centre.y * scale });
    return true;
  };
  // The zoom is offered to the bar above the canvas (see lib/canvas-zoom.ts): where it is now, and the ways to change it, which are read fresh when used.
  const zoomControls = useRef({ zoomIn: () => {}, zoomOut: () => {}, reset: () => {}, fit: () => {} });
  useEffect(() => {
    zoomControls.current = {
      zoomIn: () => size && zoomAt(size.width / 2, size.height / 2, 1.25, true),
      zoomOut: () => size && zoomAt(size.width / 2, size.height / 2, 1 / 1.25, true),
      reset: () => size && zoomAt(size.width / 2, size.height / 2, 1 / camera.target.scale, true),
      fit: () => {
        if (!size) return;
        touch(false);
        camera.set(fitted(size), { glide: revealed });
      },
    };
  });
  useEffect(() => {
    publishZoom({ scale: view.scale, zoomIn: () => zoomControls.current.zoomIn(), zoomOut: () => zoomControls.current.zoomOut(), reset: () => zoomControls.current.reset(), fit: () => zoomControls.current.fit() });
  }, [view.scale]);
  useEffect(() => () => publishZoom(null), []);
  const shownId = interact?.id ?? (selected && placed.has(selected) && !placing ? selected : null);
  // Where a screen stands on the canvas now, in the canvas's own window: what an opened one grows from and shrinks back to.
  const standing = (id: string): Box => {
    const spot = at(id);
    return { left: view.x + spot.x * view.scale, top: view.y + spot.y * view.scale, width: widthOf(id) * view.scale, height: heightOf(id) * view.scale };
  };
  const openInteract = (id: string) => {
    setUsing(null);
    // The press that opened it is over. A tap on a screen leaves it recorded as a drag begun (nothing clears it, as the
    // screen keeps the release to itself), and the next pointer movement over the canvas would carry the screen along.
    drag.current = null;
    // An element selected to edit is let go of: the screen is being used now, not picked from.
    if (picking?.target) picking.onPick(null, null);
    setSelected(id);
    setInteract({ id, open: false });
    // Painted where it stood first, so growing is seen.
    requestAnimationFrame(() => requestAnimationFrame(() => setInteract((now) => (now && now.id === id ? { ...now, open: true } : now))));
  };
  function closeInteract() {
    setInteract((now) => (now ? { ...now, open: false } : now));
    window.setTimeout(() => setInteract((now) => (now && !now.open ? null : now)), INTERACT_MS + 40);
  }
  const grab = (event: React.PointerEvent, id: string) => {
    // With Space held, a press on a screen pans like anywhere else.
    if (placing || space.current) return;
    event.stopPropagation();
    drag.current = { x: event.clientX, y: event.clientY, from: camera.target, moved: false, pan: false, screen: id, origin: offsets[id] ?? { x: 0, y: 0 }, group: bunch.copies.includes(id) ? groupBase() : undefined };
  };
  const toScreen = (x: number, y: number) => ({ x: view.x + x * view.scale, y: view.y + y * view.scale });

  // One arrow for each tap, from a screen's copies to the next screen's: out of the last copy and into the first when it
  // leads on to a later column, and between the first copies otherwise.
  const [first, final] = [devices[0], devices[devices.length - 1]];
  const arrows = flow.edges.flatMap((edge, i) => {
    const [fromId, toId] = [copyKey(first.id, edge.from), copyKey(first.id, edge.to)];
    if (!placed.has(fromId) || !placed.has(toId)) return [];
    const node = { width: first.width * SCREEN_SCALE };
    const from = at(fromId);
    const to = at(toId);
    const tallFrom = heightOf(fromId);
    const tallTo = heightOf(toId);
    const end = copyKey(final.id, edge.from);
    let path: string;
    let mid: { x: number; y: number };
    let room: number;
    if (to.x > from.x) {
      // On to a later column: out of the right edge, into the left.
      const a = toScreen(at(end).x + widthOf(end), at(end).y + heightOf(end) / 2);
      const b = toScreen(to.x, to.y + tallTo / 2);
      const reach = Math.max(24, Math.abs(b.x - a.x) / 2);
      path = `M${a.x},${a.y} C${a.x + reach},${a.y} ${b.x - reach},${b.y} ${b.x},${b.y}`;
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      room = Math.abs(b.x - a.x);
    } else if (to.y > from.y) {
      // Down the column: out of the bottom, into the top.
      const a = toScreen(from.x + node.width / 2, from.y + tallFrom);
      const b = toScreen(to.x + node.width / 2, to.y);
      const reach = Math.max(30, Math.abs(b.y - a.y) / 2);
      path = `M${a.x},${a.y} C${a.x},${a.y + reach} ${b.x},${b.y - reach} ${b.x},${b.y}`;
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      room = Math.abs(b.y - a.y);
    } else {
      // Back to something earlier: round underneath.
      const a = toScreen(from.x + node.width / 2, from.y + tallFrom);
      const b = toScreen(to.x + node.width / 2, to.y + tallTo);
      const reach = 60 + 30 * view.scale;
      path = `M${a.x},${a.y} C${a.x},${a.y + reach} ${b.x},${b.y + reach} ${b.x},${b.y}`;
      mid = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + reach * 0.75 };
      room = Infinity;
    }
    const active = !!selected && [edge.from, edge.to].includes(screenOfCopy(selected));
    // A label needs room to sit in: it shows when the gap is wide enough, or when the arrow is selected.
    return [{ key: `${edge.from}-${edge.to}-${i}`, path, mid, label: active || room >= 80 ? edge.label : undefined, active }];
  });

  // A placed component takes the size it turns out to be once its page has loaded: the stage draws it at its own size (`[data-stage]`).
  const measurePiece = (id: string) => {
    const rect = frames.current.get(id)?.contentDocument?.querySelector("[data-stage]")?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    setPieces((was) => was.map((piece) => (copyKey("stage", piece.id) === id && (piece.width !== width || piece.height !== height) ? { ...piece, width, height } : piece)));
  };
  // A component dragged out of the panel is let go of on the canvas: it becomes a screen there, centred on the pointer, and is kept.
  const dropping = (event: React.DragEvent) => event.dataTransfer.types.includes(COMPONENT_DRAG_TYPE);
  const drop = (event: React.DragEvent) => {
    if (!dropping(event) || !box.current) return;
    event.preventDefault();
    let item: { id?: string; label?: string; width?: number; height?: number };
    try {
      item = JSON.parse(event.dataTransfer.getData(COMPONENT_DRAG_TYPE));
    } catch {
      return;
    }
    if (!item.id) return;
    const rect = box.current.getBoundingClientRect();
    const now = camera.target;
    const world = { x: (event.clientX - rect.left - now.x) / now.scale, y: (event.clientY - rect.top - now.y) / now.scale };
    const piece: Piece = { id: `piece-${Math.random().toString(36).slice(2, 8)}`, parent: frameAt(world.x, world.y), story: item.id, label: item.label ?? "Component", props: {}, width: Math.max(Math.round(item.width ?? 0), 80), height: Math.max(Math.round(item.height ?? 0), 48) };
    const id = copyKey("stage", piece.id);
    setOffsets((was) => ({ ...was, [id]: { x: world.x - (piece.width * SCREEN_SCALE) / 2, y: world.y - (piece.height * SCREEN_SCALE) / 2 - LABEL_HEIGHT } }));
    setPieces((was) => [...was, piece]);
    setSelected(id);
  };

  // A point on the canvas, as the screen under it and where that is in the screen's own page.
  const pointIn = (clientX: number, clientY: number) => {
    const rect = box.current!.getBoundingClientRect();
    const now = camera.target;
    const world = { x: (clientX - rect.left - now.x) / now.scale, y: (clientY - rect.top - now.y) / now.scale };
    const copy = copies.find((item) => {
      const spot = at(item.id);
      return world.x >= spot.x && world.x <= spot.x + widthOf(item.id) && world.y >= spot.y && world.y <= spot.y + heightOf(item.id);
    });
    const frame = copy ? frames.current.get(copy.id) ?? null : null;
    // The page a question is put to: the live one, or the copy's.
    const page = frame ? pageOf(frame) : copy ? copyPages.current.get(copy.id) ?? null : null;
    if (!copy || !page) return null;
    const spot = at(copy.id);
    return { copy, frame, page, x: (world.x - spot.x) / SCREEN_SCALE, y: (world.y - spot.y) / SCREEN_SCALE };
  };
  const place = async (event: React.MouseEvent<HTMLDivElement>) => {
    // Letting go of a drag isn't a click on anything.
    if (drag.current?.moved || !comments) return;
    const found = pointIn(event.clientX, event.clientY);
    if (!found) return;
    const anchor = await found.page.anchorAt(found.x, found.y);
    if (!anchor) return;
    comments.onFocus(null);
    setDraft({ copyId: found.copy.id, anchor: setups ? anchor : { ...anchor, flowScreen: found.copy.screen.id } });
  };
  // A tap on a screen selects the element under it too; one on a page's bare background lets go of what was.
  // A second tap goes a level into what is selected (`into`), or types over its words when there is no level left.
  const pick = async (clientX: number, clientY: number, deep: boolean, into = false) => {
    const found = picking && pointIn(clientX, clientY);
    if (!picking || !found) return;
    // A tap inside the selected element keeps it; otherwise the same element hover outlined: the top-level group, or with ⌘ the one at the bottom.
    const from = picked && !deep && !inspect && picked.copyId === found.copy.id ? { selector: picked.part.selector, into } : undefined;
    if (into && !from) return void type(clientX, clientY);
    // Words selected: a second tap on them types, rather than going a level in (or on to something else).
    if (into && (picked?.part.text != null || picked?.part.segments) && (await type(clientX, clientY, picked.part.selector))) return;
    const part = await found.page.partAt(found.x, found.y, deep || !!inspect, from);
    if (into && !part) return void type(clientX, clientY);
    setPickedOn(part ? { selector: part.selector, copyId: found.copy.id } : null);
    setEchoes([]);
    if (part) void echo(found.copy, part.selector, (frame) => selectorBox(frame, part.selector));
    if (part || picking.target) picking.onPick(found.frame, part, found.frame ? null : found.page.scope);
  };
  // A second tap on words types over them, where they are.
  // With `only`, just the words with that selector; returns whether it began typing. Where other elements are among the words, the piece of text under the point.
  const type = async (clientX: number, clientY: number, only?: string) => {
    const found = picking && pointIn(clientX, clientY);
    if (!found) return false;
    const part = editable(await found.page.partAt(found.x, found.y), found.x, found.y);
    if (!part || (only && part.selector !== only)) return false;
    setTyping({ part, copyId: found.copy.id });
    return true;
  };
  // An element's box in its screen's own pixels, outlined on the canvas as it is now.
  const outline = (key: string, copyId: string, box: Box, component?: boolean) => {
    const corner = onCanvas(copyId, { x: box.left, y: box.top });
    const scale = SCREEN_SCALE * view.scale;
    return (
      <Fragment key={key}>
        <PinTarget left={corner.x} top={corner.y} width={box.width * scale} height={box.height * scale} component={component} />
        {box.children?.map((child, index) => {
          const inside = onCanvas(copyId, { x: child.left, y: child.top });
          return <PinTarget key={index} dashed left={inside.x} top={inside.y} width={child.width * scale} height={child.height * scale} />;
        })}
      </Fragment>
    );
  };
  // While placing, the element a click would pin to is outlined under the pointer, in its screen's own pixels so it
  // stays on it as the canvas moves. Asked for at most once a frame; a late answer is shown and the pointer's new place asked for.
  const [aimed, setTarget] = useState<{ copyId: string; box: Box } | null>(null);
  const target = aimed && copyOf.has(aimed.copyId) ? aimed : null;
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const asking = useRef(0);
  // ⌘ held: reach the element at the very bottom, not the top-level group (as in Figma).
  const reaching = useRef(false);
  const point = (at: { x: number; y: number } | null, deep = false) => {
    pointer.current = at;
    reaching.current = deep;
    if (!at) {
      cancelAnimationFrame(asking.current);
      asking.current = 0;
      setTarget(null);
      return;
    }
    if (asking.current) return;
    asking.current = requestAnimationFrame(() => {
      asking.current = 0;
      const now = pointer.current;
      const found = now && pointIn(now.x, now.y);
      if (!found) return setTarget(null);
      // Components are told by where the handoff found them, as a page's React tree can't say for the ones the server draws.
      const wholes = inspect ? componentRoots(inspect.elements) : [];
      // Placing a comment pins to the deepest element, and handoff picks by section, so both reach all the way in; only editing starts at the group.
      const deep = reaching.current || placing || !!inspect || altNow.current;
      void Promise.all([found.page.boxAt(found.x, found.y, { deep, groups: !placing, from: picked && !deep && picked.copyId === found.copy.id ? { selector: picked.part.selector } : undefined }), wholes.length && found.frame ? handoffSourceAt(found.frame, found.x, found.y, wholes) : null]).then(([box, whole]) => {
        // Gone from the canvas meanwhile. Otherwise it is shown even if the pointer has moved on (a page on another address answers a moment later, and dropping every late answer would leave the outline behind until the pointer stopped), and asked again.
        if (!pointer.current) return;
        const shown = whole ? { ...whole.box, component: true } : box;
        setTarget(shown ? { copyId: found.copy.id, box: shown } : null);
        if (pointer.current !== now) repoint.current(pointer.current, reaching.current);
      });
    });
  };
  useEffect(() => () => cancelAnimationFrame(asking.current), []);
  // Pressing or letting go of ⌘ with the pointer still re-picks under it. Kept current by an effect, as `point` closes over the view.
  const repoint = useRef(point);
  useEffect(() => {
    repoint.current = point;
  });
  useEffect(() => {
    if (!selecting || placing) return;
    const change = (event: KeyboardEvent | FocusEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Meta" && event.key !== "Control" && event.key !== "Alt") return;
      if (pointer.current) repoint.current(pointer.current, event instanceof KeyboardEvent && event.type === "keydown");
    };
    window.addEventListener("keydown", change);
    window.addEventListener("keyup", change);
    window.addEventListener("blur", change);
    return () => {
      window.removeEventListener("keydown", change);
      window.removeEventListener("keyup", change);
      window.removeEventListener("blur", change);
    };
  }, [selecting, placing]);
  if (!placing && !selecting && aimed) setTarget(null);
  // Where a spot inside a screen is, on the canvas as it is now and in the window.
  const onCanvas = (copyId: string, spot: Spot) => toScreen(at(copyId).x + spot.x * SCREEN_SCALE, at(copyId).y + spot.y * SCREEN_SCALE);
  const inWindow = (point: { x: number; y: number }) => ({ left: origin.left + point.x, top: origin.top + point.y });
  const openComment = comments?.list.find((item) => item.id === comments.focus?.id);
  const openAt = found.find((item) => item.id === openComment?.id && pinOn?.id === item.id && pinOn.copyId === item.copyId) ?? found.find((item) => item.id === openComment?.id);
  const draftAt = found.find((item) => item.key === "draft");
  // Copies are for looking. What works by reaching into the pages needs them live until those read copies too: a comment being
  // placed, an element selected for editing (picking is on whenever a version can be edited, so being able to pick doesn't count),
  // the handoff's inspector, and comments' pins, which are found on the live pages. The screen that is selected is live too, so a
  // tap on it picks as it always has.
  // What Alt shows: from what is selected (an element picked inside a screen, else a screen, else a frame) to what the pointer is over (an element in a
  // screen, else a screen or a frame). Over nothing, or over the selection itself, it is the room round the selection inside its parent: the frame it is
  // in, or for an element its screen. All in the canvas's own units; the labels are in pixels of the design.
  const measured = (() => {
    if (!alt || !cursor) return null;
    const frameRect = (one: CanvasFrame): Rect => ({ id: `frame:${one.id}`, x: one.x, y: one.y, width: one.width, height: one.height });
    const screenRect = (id: string): Rect => ({ id, ...at(id), width: widthOf(id), height: heightOf(id) });
    const inScreen = (id: string, within: Box): Rect => {
      const spot = at(id);
      return { id: `part:${id}`, x: spot.x + within.left * SCREEN_SCALE, y: spot.y + within.top * SCREEN_SCALE, width: within.width * SCREEN_SCALE, height: within.height * SCREEN_SCALE };
    };
    let from: Rect | null = null;
    let parent: Rect | null = null;
    if (picked) {
      from = inScreen(picked.copyId, picked.part.box);
      parent = screenRect(picked.copyId);
    } else if (selected && copyOf.has(selected)) {
      from = screenRect(selected);
      const owner = shapes.find((one) => one.id === parentOf(selected));
      parent = owner ? frameRect(owner) : null;
    } else if (shape) {
      const one = shapes.find((item) => item.id === shape);
      from = one ? frameRect(one) : null;
    }
    if (!from) return null;
    const over = (rect: Rect) => cursor.x >= rect.x && cursor.x <= rect.x + rect.width && cursor.y >= rect.y && cursor.y <= rect.y + rect.height;
    let to: Rect | null = null;
    if (target && over(screenRect(target.copyId))) to = inScreen(target.copyId, target.box);
    else to = [...copies].reverse().map((copy) => screenRect(copy.id)).find(over) ?? [...shapes].reverse().map(frameRect).find(over) ?? null;
    const itself = !!to && [to.x - from.x, to.y - from.y, to.width - from.width, to.height - from.height].every((n) => Math.abs(n) < 0.5);
    const pointed = to && !itself ? to : null;
    const against = pointed ?? parent;
    return against ? { pointed, spans: measure(from, against) } : null;
  })();
  const needsLive = placing || !!inspect || (visible && !!list?.length);
  const asCopies = copiesChosen && !needsLive;

  return (
    <div
      ref={box}
      onDragOver={(event) => {
        if (!dropping(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={drop}
      onPointerLeave={() => {
        lastPointer.current = null;
        setCursor(null);
      }}
      // With Space held a press is a pan, whatever it lands on: seen first, before a screen, a frame, a picked part's layer or a panel can take it.
      // (Controls other than screens keep their presses.)
      onPointerDownCapture={(event) => {
        const spaced = space.current || event.button === 1;
        const target = event.target as Element;
        if (!spaced || interactNow.current || (target.closest("button, input, textarea, select, a, [data-pin]") && !target.closest("[data-screen]"))) return;
        event.stopPropagation();
        setUsing(null);
        drag.current = { x: event.clientX, y: event.clientY, from: camera.target, moved: false, pan: true, spaced: true };
      }}
      onPointerDown={(event) => {
        // Nothing inside a screen that is being used reaches here (its page takes the press), so this is outside it.
        setUsing(null);
        // Around the screens a drag draws a box to select with; Space (or the middle button) pans instead. A canvas placing a comment keeps panning.
        const spaced = space.current || event.button === 1;
        const pan = spaced || placing;
        // Panning with Space is not a click on anything: what is selected stays selected.
        if (!spaced) {
          setShape(null);
          setBunch((now) => (now.copies.length || now.frames.length ? { copies: [], frames: [] } : now));
        }
        drag.current = { x: event.clientX, y: event.clientY, from: camera.target, moved: false, pan, spaced, lasso: !pan && event.button === 0 };
      }}
      onPointerMove={(event) => {
        lastPointer.current = { x: event.clientX, y: event.clientY };
        if (altNow.current && !event.buttons) setCursor(worldOf(event.clientX, event.clientY));
        // An opened screen holds still: nothing under it is being moved.
        if (interactNow.current) return;
        const start = drag.current;
        if (!start || !(event.buttons & (start.pan ? 5 : 1))) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        const { screen, origin } = start;
        if (screen && origin) {
          // Moved with the pointer, in the canvas's own units; with Shift held, along whichever way it has gone further.
          let x = dx / start.from.scale;
          let y = dy / start.from.scale;
          if (event.shiftKey) {
            if (Math.abs(x) > Math.abs(y)) y = 0;
            else x = 0;
          }
          const free = event.metaKey || event.ctrlKey;
          if (start.group) {
            const { rect, skip } = groupRect(start.group, x, y);
            const nudge = lineUp(rect, skip, free);
            moveGroup(start.group, x + nudge.dx, y + nudge.dy);
          } else {
            const rest = placed.get(screen) ?? { x: 0, y: 0 };
            const nudge = lineUp({ id: screen, x: rest.x + origin.x + x, y: rest.y + LABEL_HEIGHT + origin.y + y, width: widthOf(screen), height: heightOf(screen) }, new Set([screen]), free);
            setSelected(screen);
            setOffsets((now) => ({ ...now, [screen]: { x: origin.x + x + nudge.dx, y: origin.y + y + nudge.dy } }));
          }
          return;
        }
        if (start.lasso) {
          const rect = box.current!.getBoundingClientRect();
          setLasso({ x: start.x - rect.left, y: start.y - rect.top, x2: event.clientX - rect.left, y2: event.clientY - rect.top });
          return;
        }
        if (!start.pan) return;
        touch(true);
        camera.set({ ...start.from, x: start.from.x + dx, y: start.from.y + dy });
      }}
      onDoubleClick={(event) => {
        // A double-click on a screen is the screen's own, and while placing a comment a click is a comment.
        if (placing || interactNow.current || (event.target as Element).closest("button, [data-screen-name]") || !box.current) return;
        const rect = box.current.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, DOUBLE_CLICK_ZOOM, true);
      }}
      onPointerUp={(event) => {
        const done = drag.current;
        setGuides((now) => (now.length ? [] : now));
        // Let go of a pan made with Space: not a tap, so nothing is selected or let go of.
        if (done?.spaced) {
          window.setTimeout(() => (drag.current = null), 0);
          return;
        }
        if (done?.lasso && done.moved && box.current) {
          const rect = box.current.getBoundingClientRect();
          const found = touching({ x: done.x - rect.left, y: done.y - rect.top, x2: event.clientX - rect.left, y2: event.clientY - rect.top });
          const total = found.copies.length + found.frames.length;
          // One thing is the ordinary selection (its panel, its picking); several are a group, moved and deleted together.
          if (total === 1) {
            setSelected(found.copies[0] ?? null);
            setShape(found.frames[0] ?? null);
          } else {
            setSelected(null);
            setShape(null);
            setBunch(found);
          }
          setLasso(null);
          window.setTimeout(() => (drag.current = null), 0);
          return;
        }
        // A tap on the canvas around the screens lets go of an element selected to edit; a control or a pin pressed is not that.
        if (done && !done.moved && !done.screen && inspecting.current && !(event.target as Element).closest("button, [data-pin], textarea")) {
          setInspected(null);
          setEchoes([]);
          select(null);
        }
        if (done && !done.moved && !done.screen && picking?.target && !(event.target as Element).closest("button, [data-pin], textarea")) picking.onPick(null, null);
        // A placed component let go of over a frame is in it from then on, and out of it when let go of elsewhere.
        if (done?.moved && done.screen && isPiece(done.screen)) {
          const spot = at(done.screen);
          const parent = frameAt(spot.x + widthOf(done.screen) / 2, spot.y + heightOf(done.screen) / 2);
          setPieces((now) => now.map((piece) => (copyKey("stage", piece.id) === done.screen && piece.parent !== parent ? { ...piece, parent } : piece)));
        }
        if (done?.moved && done.screen && done.origin) {
          moves.current.past.push({ id: done.screen, from: done.origin, to: offsetsNow.current[done.screen] ?? { x: 0, y: 0 } });
          moves.current.future = [];
        }
        // Letting go of a drag isn't a click on anything; a tap on a screen's name selects it.
        if (!drag.current?.moved) setSelected(drag.current?.screen ?? null);
        // And, to an engineer, the screen's name is the frame itself: the whole design, with nothing in it picked.
        if (inspect && done && !done.moved && done.screen && (event.target as Element).closest("[data-screen-name]")) {
          setInspected(null);
          setEchoes([]);
          select({ kind: "frame", screenId: screenOfCopy(done.screen) });
        }
        window.setTimeout(() => (drag.current = null), 0);
      }}
      style={{
        backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
      }}
      className={`absolute inset-0 touch-none overflow-hidden ${panning ? "cursor-grab active:cursor-grabbing [&_*]:!cursor-[inherit]" : ""}`}
    >
      <div ref={worldEl} className="absolute left-0 top-0 origin-top-left" style={{ visibility: size ? undefined : "hidden" }}>
        {shapes.map((one) => (
          <div
            key={one.id}
            onPointerDown={(event) => {
              // With Space held a press pans, wherever it is: the canvas hears it.
              if (space.current || event.button === 1) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              const together = bunch.frames.includes(one.id);
              if (!together) {
                setBunch((now) => (now.copies.length || now.frames.length ? { copies: [], frames: [] } : now));
                setShape(one.id);
                setSelected(null);
              }
              movingShape.current = { id: one.id, x: event.clientX, y: event.clientY, from: { x: one.x, y: one.y }, scale: camera.target.scale, group: together ? groupBase() : undefined };
            }}
            onPointerMove={(event) => {
              const move = movingShape.current;
              if (!move || move.id !== one.id) return;
              let dx = (event.clientX - move.x) / move.scale;
              let dy = (event.clientY - move.y) / move.scale;
              if (event.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy)) dy = 0;
                else dx = 0;
              }
              const free = event.metaKey || event.ctrlKey;
              if (move.group) {
                const { rect, skip } = groupRect(move.group, dx, dy);
                const nudge = lineUp(rect, skip, free);
                moveGroup(move.group, dx + nudge.dx, dy + nudge.dy);
              } else {
                const skip = new Set([`frame:${one.id}`, ...childrenOf(one.id)]);
                const nudge = lineUp({ id: `frame:${one.id}`, x: move.from.x + dx, y: move.from.y + dy, width: one.width, height: one.height }, skip, free);
                updateFrame(one.id, { x: move.from.x + dx + nudge.dx, y: move.from.y + dy + nudge.dy });
              }
            }}
            onPointerUp={() => {
              movingShape.current = null;
              setGuides([]);
            }}
            onPointerEnter={() => setHoverShape(one.id)}
            onPointerLeave={() => setHoverShape((now) => (now === one.id ? null : now))}
            style={{ left: one.x, top: one.y, width: one.width, height: one.height, background: one.fill ?? "#ffffff", borderRadius: one.radius, outline: shape === one.id || bunch.frames.includes(one.id) ? `${2 / view.scale}px solid var(--selection)` : hoverShape === one.id ? `${1 / view.scale}px solid var(--selection)` : undefined, outlineOffset: 0 }}
            className="absolute cursor-default"
          />
        ))}
        {size ? kept.map(({ id, screen, device: on, index }) => {
          // Its device is on; otherwise it is only being kept.
          const shown = copyOf.has(id);
          const spot = shown ? at(id) : { x: 0, y: 0 };
          return (
            <Screen
              key={id}
              data-screen=""
              {...(USE_IN_PLACE ? { role: "button", tabIndex: 0 } : { type: "button" })}
              onPointerDown={(event: React.PointerEvent) => grab(event, id)}
              // The element a tap would select is outlined under the pointer; not while anything is pressed (a screen being moved, the canvas panned).
              onPointerMove={(event: React.PointerEvent) => {
                const frame = parentOf(id);
                const deep = event.metaKey || event.ctrlKey;
                // In a frame, pointing at it is pointing at the frame; ⌘ reaches what is in it.
                if (frame && !deep && !event.buttons) {
                  setHoverShape(frame);
                  if (selecting && !placing) point(null);
                  return;
                }
                setHoverShape(null);
                if (selecting && !placing) point(event.buttons ? null : { x: event.clientX, y: event.clientY }, deep);
              }}
              onPointerLeave={() => {
                setHoverShape(null);
                if (selecting && !placing) point(null);
              }}
              onPointerUp={(event: React.PointerEvent) => {
                if (drag.current?.moved || drag.current?.spaced) return;
                event.stopPropagation();
                // A tap is over: left recorded as a drag begun (this keeps the release from the canvas, which would clear it), the next movement over the canvas would carry the screen along.
                drag.current = null;
                // A tap on something in a frame selects the frame, as on a page the top-level group comes first; ⌘ reaches what is in it.
                const owner = parentOf(id);
                if (owner && !(event.metaKey || event.ctrlKey)) {
                  setShape(owner);
                  setSelected(null);
                  if (picking?.target) picking.onPick(null, null);
                  return;
                }
                setShape(null);
                setSelected(id);
                // The first tap selects the part under it as well; a second on the same screen, soon after (a double-click, a
                // double-tap: there is no double-click event on every touch screen), goes a level into what is selected, and types over its words when it can't.
                const now = performance.now();
                if (lastTap.current?.id === id && now - lastTap.current.at < DOUBLE_TAP_MS) {
                  lastTap.current = null;
                  void pick(event.clientX, event.clientY, event.metaKey || event.ctrlKey, true);
                } else {
                  lastTap.current = { id, at: now };
                  void pick(event.clientX, event.clientY, event.metaKey || event.ctrlKey);
                  void inspectAt(event.clientX, event.clientY);
                }
              }}
              aria-label={devices.length > 1 ? `${screen.name}, ${on.name}` : screen.name}
              aria-pressed={selected === id}
              style={{
                display: shown ? undefined : "none",
                left: spot.x,
                top: spot.y,
                width: widthOf(id),
                height: heightOf(id),
                // The frame's outline stays two pixels wide however far in or out you are, and is only for the frame itself: an element picked on it is outlined instead.
                outline: (selected === id || bunch.copies.includes(id)) && picked?.copyId !== id ? `${2 / view.scale}px solid var(--selection)` : undefined,
                outlineOffset: 3 / view.scale,
                "--i": Math.min(index, 8),
                // Out of sight until the whole canvas arrives (a device switched on later shows its placeholder straight away); and while it is opened, since that is it.
                opacity: revealed ? undefined : 0,
                visibility: interact?.id === id && loadedId === screen.id ? "hidden" : undefined,
                clipPath: clipOf(id, spot),
              } as React.CSSProperties}
              className={`absolute block text-left ${isPiece(id) ? "[&>span[aria-hidden]]:border-0 [&>span[aria-hidden]]:bg-transparent" : "overflow-hidden rounded-[calc(var(--r-device)*0.5)] bg-surface"} ${opening.has(id) ? "stagger-in" : ""} ${arrived(id) ? "" : "pointer-events-none"}`}
            >
              <ScreenSurface
                asCopies={asCopies}
                live={usingId === id}
                interactive={usingId === id}
                onLeave={() => setUsing(null)}
                registerCopy={(page) => {
                  if (page) copyPages.current.set(id, page);
                  else copyPages.current.delete(id);
                }}
                chosen={copiesChosen}
                known={pageHeights[id] !== undefined}
                onReady={() => {
                  setReadyIds((now) => (now.has(id) ? now : new Set(now).add(id)));
                  if (isPiece(id)) measurePiece(id);
                  // Edits made before this page was there (its device switched on since) show on it too.
                  if (pickingNow.current?.busy) pickingNow.current.onPage();
                }}
                pageHeight={pageHeight(id)}
                onMeasured={(found) => setPageHeights((now) => (now[id] === found ? now : { ...now, [id]: found }))}
                register={(element) => {
                  if (element) return void frames.current.set(id, element);
                  frames.current.delete(id);
                  // Gone with its device: switched on again, it loads again, as a placeholder until it has.
                  setReadyIds((now) => without(now, id));
                  setOpening((now) => without(now, id));
                }}
                src={`${withParams(screen.url ?? base, screen.params)}${Object.keys(screen.params).length ? "&" : "?"}${PREVIEW_QUERY}`}
                device={on}
              />
              {fold && pageHeight(id) > on.height ? (
                <span aria-hidden style={{ top: on.height * SCREEN_SCALE }} className="pointer-events-none absolute inset-x-0 bottom-0 bg-surface opacity-50" />
              ) : null}
              {/* A layer of the canvas's own over the page, so a swipe lands on the canvas and never on something that scrolls inside the screen, whatever address the page is on. */}
              {/* Not over the screen that is being used: that one takes the pointer itself. */}
              {usingId === id ? null : <span aria-hidden className="absolute inset-0 [will-change:transform]" />}
            </Screen>
          );
        }) : null}
        {size && sheet && withSheet ? <ComponentsFrame marks={sheet.marks} pages={Object.fromEntries(flow.screens.map((screen) => [screen.id, `${withParams(base, screen.params)}${Object.keys(screen.params).length ? "&" : "?"}${PREVIEW_QUERY}`]))} devices={devices} scale={SCREEN_SCALE} onSize={setSheetSize} left={flowWidth + GAP.x} /> : null}
      </div>

      {/* While the pages load: a quiet loader in the middle, which gives way as they arrive. */}
      <div
        aria-live="polite"
        className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${revealed ? "opacity-0" : ""}`}
      >
        <div className="flex flex-col items-center gap-3">
          {/* Turns; with reduced motion it breathes instead, so it still says something is happening. */}
          <svg aria-hidden viewBox="0 0 24 24" className="spin size-7 text-foreground-muted">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
            <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="text-ui text-foreground-muted">{saying}</span>
        </div>
      </div>

      {placing ? (
        <div
          onClick={(event) => void place(event)}
          onPointerMove={(event) => point({ x: event.clientX, y: event.clientY })}
          onPointerLeave={() => point(null)}
          className="absolute inset-0 cursor-crosshair"
        />
      ) : null}

      {/* Everything drawn over the screens fades in with them, and the pins with it. */}
      <div data-ready={revealed ? "" : undefined} className="fade-in pointer-events-none absolute inset-0">
      {size ? (
        <>
          <svg aria-hidden width={size.width} height={size.height} className="pointer-events-none absolute inset-0 text-foreground-subtle">
            <defs>
              <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M1 1.5 9 5 1 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {arrows.map((arrow) => (
              <path
                key={arrow.key}
                d={arrow.path}
                fill="none"
                stroke={arrow.active ? "var(--foreground)" : "currentColor"}
                strokeWidth="1.5"
                markerEnd="url(#flow-arrow)"
                style={{ color: arrow.active ? "var(--foreground)" : undefined }}
              />
            ))}
          </svg>

          {arrows.map((arrow) =>
            arrow.label ? (
              <span
                key={`${arrow.key}-label`}
                style={{ left: arrow.mid.x, top: arrow.mid.y }}
                className="pointer-events-none absolute max-w-48 -translate-x-1/2 -translate-y-1/2 truncate rounded-[var(--r-full)] bg-surface px-2.5 py-1 text-xs text-foreground-muted"
              >
                {arrow.label}
              </span>
            ) : null,
          )}

          {guides.map((guide, index) => {
            const from = guide.axis === "x" ? toScreen(guide.at, guide.from) : toScreen(guide.from, guide.at);
            const to = guide.axis === "x" ? toScreen(guide.at, guide.to) : toScreen(guide.to, guide.at);
            return (
              <span
                key={`guide-${index}`}
                aria-hidden
                style={guide.axis === "x" ? { left: from.x - 0.5, top: from.y, width: 1, height: to.y - from.y } : { left: from.x, top: from.y - 0.5, width: to.x - from.x, height: 1 }}
                className="pointer-events-none absolute bg-[var(--guide)]"
              />
            );
          })}
          {measured?.pointed ? (
            <span
              aria-hidden
              style={{ left: toScreen(measured.pointed.x, measured.pointed.y).x, top: toScreen(measured.pointed.x, measured.pointed.y).y, width: measured.pointed.width * view.scale, height: measured.pointed.height * view.scale }}
              className="pointer-events-none absolute border border-[var(--guide)]"
            />
          ) : null}
          {measured?.spans.map((span, index) => {
            const a = toScreen(span.x1, span.y1);
            const b = toScreen(span.x2, span.y2);
            const across = span.y1 === span.y2;
            const cap = "pointer-events-none absolute bg-[var(--guide)]";
            return (
              <Fragment key={`measure-${index}`}>
                <span aria-hidden style={across ? { left: a.x, top: a.y - 0.5, width: b.x - a.x, height: 1 } : { left: a.x - 0.5, top: a.y, width: 1, height: b.y - a.y }} className={cap} />
                <span aria-hidden style={across ? { left: a.x - 0.5, top: a.y - 4, width: 1, height: 8 } : { left: a.x - 4, top: a.y - 0.5, width: 8, height: 1 }} className={cap} />
                <span aria-hidden style={across ? { left: b.x - 0.5, top: b.y - 4, width: 1, height: 8 } : { left: b.x - 4, top: b.y - 0.5, width: 8, height: 1 }} className={cap} />
                <span
                  style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-sm)] bg-[var(--guide)] px-1.5 py-0.5 text-xs font-medium tabular-nums text-[var(--guide-foreground)]"
                >
                  {Math.round(span.length / SCREEN_SCALE)}
                </span>
              </Fragment>
            );
          })}
          {shapes.map((one) => {
            const spot = toScreen(one.x, one.y);
            return (
              <span
                key={`${one.id}-name`}
                style={{ left: spot.x, top: spot.y - 22, maxWidth: Math.max(60, one.width * view.scale) }}
                className={`pointer-events-none absolute truncate text-xs font-medium ${shape === one.id ? "text-foreground" : "text-foreground-muted"}`}
              >
                {one.name}
              </span>
            );
          })}
          {copies.map(({ id, screen, device: on }) => {
            // A placeholder has its name too.
            if (!revealed || isPiece(id)) return null;
            const spot = toScreen(at(id).x, at(id).y);
            // The name is a handle too: pressed, it selects its screen and moves it.
            return (
              <span
                key={`${id}-name`}
                data-screen-name
                onPointerDown={(event) => grab(event, id)}
                style={{ left: spot.x, top: spot.y - 22, maxWidth: Math.max(60, widthOf(id) * view.scale) }}
                className={`absolute flex items-center gap-1.5 text-xs font-medium ${placing ? "pointer-events-none" : "pointer-events-auto cursor-grab"} ${selected === id ? "text-foreground" : "text-foreground-muted"}`}
              >
                {/* With several devices on, each copy says which it is. */}
                <span className="truncate">{devices.length > 1 ? `${screen.name} · ${on.name}` : screen.name}</span>
                {ready?.(screen.id) ? (
                  <span role="img" aria-label="Ready for dev" title="Ready for dev" className="grid size-4 shrink-0 place-items-center rounded-[var(--r-xs)] bg-success text-success-foreground">
                    <CodeIcon className="size-3" />
                  </span>
                ) : null}
              </span>
            );
          })}
          {/* A tap on a screen offers to use it here, above its name. */}
          {selected && placed.has(selected) && !placing && !interact ? (
            <div
              style={{ left: toScreen(at(selected).x, at(selected).y).x + (widthOf(selected) * view.scale) / 2, top: toScreen(at(selected).x, at(selected).y).y - 30 }}
              className="pointer-events-auto absolute -translate-x-1/2 flex -translate-y-full items-center gap-2"
            >
              {USE_IN_PLACE ? (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={() => setUsing(usingId ? null : selected)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-floating ${usingId ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "border border-border bg-surface text-foreground hover:bg-surface-hover"}`}
              >
                {usingId ? "Done" : "Use here"}
              </button>
              ) : null}
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={() => openInteract(selected)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] bg-accent py-1.5 pl-2.5 pr-3 text-xs font-medium text-accent-foreground shadow-floating hover:bg-accent-hover"
              >
                <PlayIcon className="size-3.5" />
                Interact
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {size && comments && visible ? (
        <div className="absolute inset-0">
          {found
            .filter((item) => item.key !== "draft")
            .map((item) => {
              const comment = comments.list.find((entry) => entry.id === item.id);
              const point = onCanvas(item.copyId, item.spot);
              if (!comment) return null;
              return (
                <Pin
                  key={item.key}
                  comment={comment}
                  left={point.x}
                  top={point.y}
                  selected={comments.focus?.id === comment.id}
                  onClick={() => {
                    const opening = comments.focus?.id !== comment.id;
                    tapped.current = opening ? comment.id : null;
                    setPinOn(opening ? { id: comment.id, copyId: item.copyId } : null);
                    comments.onFocus(opening ? comment.id : null);
                  }}
                />
              );
            })}
          {draft && draftAt ? <DraftPin left={onCanvas(draftAt.copyId, draftAt.spot).x} top={onCanvas(draftAt.copyId, draftAt.spot).y} /> : null}
          {/* Not while a comment is being written: its pin marks the spot then. */}
          {placing && target && !draft ? outline("target", target.copyId, target.box) : null}
        </div>
      ) : null}
      {size && inspected && copyOf.has(inspected.copyId) ? (
        <div className="pointer-events-none absolute inset-0">
          {outline("inspected", inspected.copyId, inspected.box, true)}
          {echoes.filter((item) => item.key === inspected.id && copyOf.has(item.copyId)).map((item) => outline(`echo-${item.copyId}`, item.copyId, item.box, true))}
        </div>
      ) : null}
      {/* Where the version can be edited: the element under the pointer, and the one selected, marked the same way. */}
      {size && selecting ? (
        <div className="absolute inset-0">
          {picked ? outline("picked", picked.copyId, picked.part.box, !!(picked.part.component || picked.part.inside)) : null}
          {picked ? echoes.filter((item) => item.key === picked.part.selector && copyOf.has(item.copyId)).map((item) => outline(`echo-${item.copyId}`, item.copyId, item.box, !!(picked.part.component || picked.part.inside))) : null}
          {target ? outline("target", target.copyId, target.box, target.box.component) : null}
          {typing
            ? (() => {
                // Where the words are now, if the part being typed over is the one selected, which is kept up to date.
                const { box } = picked && picked.part.selector === typing.part.selector && picked.copyId === typing.copyId && typing.part.node === undefined ? picked.part : typing.part;
                const corner = onCanvas(typing.copyId, { x: box.left, y: box.top });
                const scale = SCREEN_SCALE * view.scale;
                return (
                  <TextInPlace
                    part={typing.part}
                    frame={frames.current.get(typing.copyId)}
                    scope={copyPages.current.get(typing.copyId)?.scope}
                    left={corner.x}
                    top={corner.y}
                    width={box.width * scale}
                    height={box.height * scale}
                    scale={scale}
                    onLive={(text) => picking?.onText(typing.part, text)}
                    onDone={(text) => {
                      setTyping(null);
                      if (text !== null) picking?.onText(typing.part, text);
                    }}
                  />
                );
              })()
            : null}
        </div>
      ) : null}
      </div>

      {openComment && openAt && visible ? (
        <CommentCard
          comment={openComment}
          replies={comments?.replies[openComment.id] ?? []}
          at={inWindow(onCanvas(openAt.copyId, openAt.spot))}
          onClose={() => comments?.onFocus(null)}
          onReply={comments!.onReply}
          onResolve={(comment, resolved) => {
            // Resolving closes it at once.
            if (resolved) comments!.onFocus(null);
            comments!.onResolve(comment, resolved);
          }}
          onLike={comments!.onLike}
          onDelete={comments!.onDelete}
          onCopy={comments!.onCopy}
          onUndo={comments!.onUndo}
        />
      ) : null}
      {draft && draftAt && comments ? (
        <Card at={inWindow(onCanvas(draftAt.copyId, draftAt.spot))}>
          <Composer
            key={`${draft.copyId}${draft.anchor.selector}${draft.anchor.x}${draft.anchor.y}`}
            onCancel={() => {
              setDraft(null);
              setRetry({ text: "" });
            }}
            initialText={retry.text}
            onPost={(text) => {
              // Closed at once; the comment is on the canvas, breathing, until it is saved. If it isn't, what was written comes back.
              const placed = draft;
              setDraft(null);
              setRetry({ text: "" });
              void comments.onAdd(text, placed.anchor, setups?.[screenOfCopy(placed.copyId)], copyOf.get(placed.copyId)?.device.id).then((saved) => {
                if (saved) return;
                setRetry({ text });
                setDraft(placed);
              });
            }}
          />
        </Card>
      ) : null}

      {/* A selected frame's properties, beside the canvas. */}
      {shapes.find((one) => one.id === shape) && !framing ? (
        <div
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          className="absolute bottom-16 right-4 top-4 z-[var(--z-raised)] hidden w-[var(--dev-panel-width)] overflow-y-auto rounded-[var(--r-tile)] border border-border bg-surface-elevated shadow-floating sm:block"
        >
          <FramePanel frame={shapes.find((one) => one.id === shape)!} unit={1 / SCREEN_SCALE} surface="#ffffff" onChange={(patch) => updateFrame(shape!, patch)} onDelete={() => removeFrame(shape!)} />
        </div>
      ) : null}

      {/* Development only: whether screens are drawn as copies. The rest of the canvas's controls are the bar below and the zoom beside the comments. */}
      {COPIES_OFFERED ? (
        <div className="absolute bottom-4 left-4">
          <IconButton
            tooltipSide="above"
            label={copiesChosen ? "Draw screens live" : "Draw screens as copies"}
            aria-pressed={copiesChosen}
            className={copiesChosen ? controlOn : ""}
            onClick={() => {
              // Switching on reads every page afresh, so the copies are of what the pages are now.
              if (!copiesChosen) forgetCopies();
              chooseCopies(!copiesChosen);
            }}
          >
            <CopyIcon className="size-[1.125rem]" />
          </IconButton>
        </div>
      ) : null}

      {/* A screen opened to be used: it grows from where it stood into the middle of the canvas, over a blurred scrim, with Done above it. The selected screen's page is kept ready here, out of sight, so opening it shows no loading. */}
      {shownId && size
        ? (() => {
            const copy = copyOf.get(shownId);
            if (!copy) return null;
            // Opened at its own device's size, whichever the main view is on.
            const { screen, device } = copy;
            const open = interact?.open ?? false;
            const ready = loadedId === screen.id;
            // On a phone it fills the view. Elsewhere it is the chosen device at the chosen size, as in the prototype's own view:
            // fitted to the room, or at its zoom and never bigger than the room, in the middle.
            const narrow = size.width < 640;
            const margin = narrow ? 0 : INTERACT.margin;
            const room = { width: size.width - margin * 2, height: size.height - INTERACT.top - margin };
            const most = Math.min(room.width / device.width, room.height / device.height);
            const scale = fit ? most : Math.min(zoom, most);
            // What the page is laid out at, before it is scaled: the device, or on a phone the whole view.
            const page = narrow ? room : { width: device.width, height: device.height };
            const drawn = narrow ? room : { width: device.width * scale, height: device.height * scale };
            const to: Box = { left: (size.width - drawn.width) / 2, top: INTERACT.top + (room.height - drawn.height) / 2, ...drawn };
            const standingNow = standing(shownId);
            // Closed, it is back where it stood on the canvas, wherever the canvas has got to.
            const shell = open ? to : standingNow;
            // Only a phone is opened in an app; its bars, in the page's pixels and in the drawing's.
            const chrome = device.kind === "phone" && inApp && inApp.id !== "none" ? inApp : null;
            const inBars = chrome ? barsOf(chrome, device, scrolledDown) : { top: 0, bottom: 0 };
            const bars = chrome ? { top: inBars.top * (page.width / chrome.width), bottom: inBars.bottom * (page.width / chrome.width) } : { top: 0, bottom: 0 };
            // Only while it is open (or opening, or closing) does it travel: kept ready, it follows the canvas exactly.
            const motion = interact ? { transitionDuration: "var(--dur-deliberate)", transitionTimingFunction: "var(--curve-spatial)" } : { transitionProperty: "none" };
            const fade = { opacity: open ? 1 : 0, transition: "opacity var(--dur-deliberate) var(--curve-standard)" };
            return (
              <div
                // One for a screen, not for each copy of it: the same page, so going from one device's copy to another's resizes it and doesn't load it again.
                key={screen.id}
                data-interacting
                // Nothing here is the canvas's: a press or a double-click on the scrim must not pan it or zoom it to where it landed.
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                className={`absolute inset-0 z-[var(--z-raised)] ${interact ? "" : "pointer-events-none invisible"}`}
              >
                {/* Only while it is open: a blurred layer left over the canvas is one more layer for the browser to composite, which is what makes scaled pages soft in Safari. */}
                {interact ? (
                  <>
                    <div onClick={closeInteract} style={fade} className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" />
                    <div style={{ height: INTERACT.top, ...fade }} // Above the screen beneath it, so a menu opened from here hangs over the screen and not behind it.
                      className="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-raised)] grid grid-cols-[1fr_auto_1fr] items-center px-4">
                      {/* Picking a phone makes no sense on a phone. */}
                      <div className="pointer-events-auto hidden [grid-column:2] sm:block">{controls?.({ scale, device })}</div>
                      <IconButton className="pointer-events-auto [grid-column:3] justify-self-end" onClick={closeInteract}>
                        Done
                      </IconButton>
                    </div>
                  </>
                ) : null}
                <div
                  // Open, it is centred on the canvas as it is at this moment, not as it was last measured (which waits for the room
                  // to settle): with the side panel closing at the same time, it travels to the middle of the room that is opening up, in step with it.
                  style={{ ...shell, ...(open ? { left: `calc(50% - ${to.width / 2}px)` } : {}), ...(interact ? { transitionProperty: "left, top, width, height" } : {}), ...motion }}
                  className={`absolute overflow-hidden rounded-[var(--r-device)] ${ready ? "bg-surface shadow-[var(--elev-overlay)]" : ""}`}
                >
                  {/* The page and the app's bars are laid out together at the page's own size, and scaled as one. */}
                  <div
                    style={{
                      width: page.width,
                      height: page.height,
                      // Drawn as small as the screen on the canvas, and growing to its own size with the box around it.
                      transform: `scale(${open ? to.width / page.width : standingNow.width / page.width})`,
                      transformOrigin: "0 0",
                      ...(interact ? { transitionProperty: "transform, opacity" } : { transitionProperty: "none" }),
                      transitionDuration: interact ? "var(--dur-deliberate)" : undefined,
                      transitionTimingFunction: interact ? "var(--curve-spatial)" : undefined,
                      opacity: ready ? 1 : 0,
                    }}
                    className="absolute left-0 top-0"
                  >
                    <iframe
                      src={embedded(withParams(screen.url ?? base, screen.params))}
                      title={screen.name}
                      onLoad={(event) => {
                        setLoadedId(screen.id);
                        picking?.onPage();
                        stopWatching.current?.();
                        setScrolledDown(false);
                        stopWatching.current = watchScrolled(event.currentTarget, setScrolledDown);
                      }}
                      // Laid out in what the bars leave, and following them as Safari's grows and shrinks.
                      style={{ top: bars.top, height: page.height - bars.top - bars.bottom }}
                      className="absolute left-0 block w-full border-0 bg-surface transition-[top,height] duration-[var(--dur-standard)] ease-[var(--curve-standard)] motion-reduce:transition-none"
                      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
                    />
                    {chrome ? (
                      <>
                        <InAppChrome app={chrome} minimized={scrolledDown} compact={!!device.homeButton} height={inBars.top} k={page.width / chrome.width} edge="top" />
                        <InAppChrome app={chrome} minimized={scrolledDown} compact={!!device.homeButton} height={inBars.bottom} k={page.width / chrome.width} edge="bottom" />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })()
        : null}
      {lasso ? (
        <div
          style={{ left: Math.min(lasso.x, lasso.x2), top: Math.min(lasso.y, lasso.y2), width: Math.abs(lasso.x2 - lasso.x), height: Math.abs(lasso.y2 - lasso.y), background: "var(--selection-muted)" }}
          className="pointer-events-none absolute border border-[var(--selection)]"
        />
      ) : null}
      {framing ? (
        <div
          // Over everything, so the drag is the frame's and nothing under it hears it.
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const rect = event.currentTarget.getBoundingClientRect();
            const [x, y] = [event.clientX - rect.left, event.clientY - rect.top];
            setSketch({ x, y, x2: x, y2: y });
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSketch((now) => (now ? { ...now, x2: event.clientX - rect.left, y2: event.clientY - rect.top } : now));
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            if (sketch) addFrame(sketch);
            setSketch(null);
            setFraming(false);
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          style={{ zIndex: "var(--z-sticky)" }}
          className="absolute inset-0 cursor-crosshair"
        >
          {sketch ? (
            <div
              style={{ left: Math.min(sketch.x, sketch.x2), top: Math.min(sketch.y, sketch.y2), width: Math.abs(sketch.x2 - sketch.x), height: Math.abs(sketch.y2 - sketch.y), background: "var(--selection-muted)" }}
              className="pointer-events-none absolute border border-[var(--selection)]"
            />
          ) : null}
        </div>
      ) : null}
      {/* Always on: the tools, as in Figma. Pointer is the default; Frame opens the devices to start from, above it. */}
      <div style={{ zIndex: "var(--z-sticky)" }} onPointerDown={(event) => event.stopPropagation()} className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
        <div
          inert={!framing}
          role="group"
          aria-label="Frame sizes"
          className={`flex origin-bottom items-stretch gap-1 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-1 shadow-floating transition-[opacity,translate,scale] duration-[var(--dur-standard)] ease-[var(--curve-standard)] motion-reduce:transition-none ${framing ? "pointer-events-auto" : "pointer-events-none translate-y-2 scale-95 opacity-0"}`}
        >
          {DEVICES.map((on) => {
            const Icon = deviceIcons[on.id];
            return (
              <button
                key={on.id}
                type="button"
                onClick={() => placeDevice(on)}
                className="flex min-w-32 items-center gap-2.5 rounded-[var(--r-control)] px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
              >
                <Icon className="size-5 shrink-0 text-foreground-muted" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">{on.name}</span>
                  <span className="text-xs text-foreground-subtle">{`${on.width} × ${on.height}`}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div role="toolbar" aria-label="Canvas tools" className="pointer-events-auto flex items-center gap-1 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-1 shadow-floating">
          <IconButton
            tooltipSide="above"
            label="Move (V)"
            variant="ghost"
            aria-pressed={!framing}
            className={!framing ? controlOn : ""}
            onClick={() => {
              setSketch(null);
              setFraming(false);
            }}
          >
            <PointerIcon className="size-[1.125rem]" />
          </IconButton>
          <IconButton
            tooltipSide="above"
            label="Frame (F)"
            variant="ghost"
            aria-pressed={framing}
            className={framing ? controlOn : ""}
            onClick={() => {
              setShape(null);
              setSketch(null);
              setFraming((on) => !on);
            }}
          >
            <FrameIcon className="size-[1.125rem]" />
          </IconButton>
        </div>
      </div>
      {zooming && !framing ? (
        <div
          // Over everything, so the drag is the box's and nothing under it (a screen, a pan, a pick) hears it.
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const rect = event.currentTarget.getBoundingClientRect();
            const [x, y] = [event.clientX - rect.left, event.clientY - rect.top];
            setMarquee({ x, y, x2: x, y2: y });
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMarquee((now) => (now ? { ...now, x2: event.clientX - rect.left, y2: event.clientY - rect.top } : now));
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            // A click without a drag zooms in a bit, round the point clicked.
            if (marquee && !zoomTo(marquee)) {
              const rect = event.currentTarget.getBoundingClientRect();
              zoomAt(event.clientX - rect.left, event.clientY - rect.top, CLICK_ZOOM);
            }
            setMarquee(null);
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          style={{ zIndex: "var(--z-sticky)" }}
          className="absolute inset-0 cursor-zoom-in"
        >
          {marquee ? (
            <div
              style={{
                left: Math.min(marquee.x, marquee.x2),
                top: Math.min(marquee.y, marquee.y2),
                width: Math.abs(marquee.x2 - marquee.x),
                height: Math.abs(marquee.y2 - marquee.y),
                background: "var(--selection-muted)",
              }}
              className="pointer-events-none absolute border border-[var(--selection)]"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One screen, live, at the phone's own size and scaled down. The canvas
 * mounts it once its room has settled; it shows in the reveal after that.
 */
/**
 * What a screen is drawn with: the page running in a frame, or (when copies are on and the page can be read) a static
 * copy of it. While a copy is being read the screen is a placeholder, and a page that can't be read stays live.
 */
function ScreenSurface({ asCopies, live, interactive, onLeave, chosen, known, registerCopy, ...frame }: { asCopies: boolean; live: boolean; interactive: boolean; onLeave: () => void; chosen: boolean; known: boolean; registerCopy: (page: FramePage | null) => void } & Omit<React.ComponentProps<typeof ScreenFrame>, "interactive" | "onLeave" | "donate">) {
  // The selected screen is the one being worked on, so it is the page itself.
  const wantsCopy = asCopies && !live;
  const copy = useScreenCopy(frame.src, frame.device.width, wantsCopy);
  const { src, device } = frame;
  // While copies are wanted the page that is already there offers itself to be read, once it has loaded and settled.
  const offer = useCallback((element: HTMLIFrameElement) => donate(src, device.width, element), [src, device.width]);
  // While copies are being tried out, each screen says what it is, and why when it is live.
  const badge = (text: string, title?: string) =>
    chosen ? (
      <span title={title} className="pointer-events-auto absolute left-2 top-2 z-[var(--z-raised)] rounded-[var(--r-full)] bg-surface px-2 py-0.5 text-xs text-foreground-muted shadow-[var(--elev-overlay)]">
        {text}
      </span>
    ) : null;
  if (wantsCopy && copy?.state === "ready" && copy.snapshot) {
    return (
      <>
        <ScreenCopy snapshot={copy.snapshot} device={device} pageHeight={frame.pageHeight} scale={SCREEN_SCALE} known={known} onReady={frame.onReady} onMeasured={frame.onMeasured} register={registerCopy} />
        {badge("copy")}
      </>
    );
  }
  return (
    <>
      <ScreenFrame {...frame} interactive={interactive} onLeave={onLeave} donate={wantsCopy && copy?.state !== "unavailable" ? offer : undefined} />
      {badge(!asCopies ? "live: a tool or comments need it" : live ? "live: selected" : copy?.state === "unavailable" ? "live: can't read this page" : "reading…", copy?.error)}
    </>
  );
}

function ScreenFrame({
  src,
  device,
  pageHeight,
  onMeasured,
  onReady,
  register,
  interactive = false,
  onLeave,
  donate,
}: {
  src: string;
  device: Device;
  /** The page takes the pointer, as in a window of its own (the screen is being used where it stands). */
  interactive?: boolean;
  /** Told when the page asks to be left (Escape, in a page the studio can reach into). */
  onLeave?: () => void;
  /** Offers this frame to be read as a static copy, once it has loaded and settled. */
  donate?: (frame: HTMLIFrameElement) => void;
  /** How tall the page is drawn, in its own pixels. */
  pageHeight: number;
  /** Told how tall the page turns out to be, if that matters: it is measured shortly after it loads, and once more later. */
  onMeasured?: (height: number) => void;
  /** Told once the page has loaded and settled, which is when it is fit to be seen. */
  onReady: () => void;
  register: (element: HTMLIFrameElement | null) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(0);
  // Whether the page is on another address (a live version's dev server), which can't be read from here.
  const [across, setAcross] = useState(false);

  useEffect(() => {
    register(frame.current);
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument;
    return loaded && doc ? applyEmbed(doc) : undefined;
  }, [loaded]);

  // A screen on the canvas is a picture of its page, not somewhere to scroll: a wheel or swipe that lands inside it
  // (Safari sends them in, whatever pointer-events says) moves nothing there and is handed to the canvas as its own.
  useEffect(() => {
    const element = frame.current;
    const doc = element?.contentDocument;
    // Not while the screen is being used: then a wheel is the page's own.
    if (!loaded || interactive || !element || !doc) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = element.getBoundingClientRect();
      const scale = rect.width / element.offsetWidth;
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          clientX: rect.left + event.clientX * scale,
          clientY: rect.top + event.clientY * scale,
        }),
      );
    };
    doc.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => doc.removeEventListener("wheel", onWheel, { capture: true });
  }, [loaded, interactive]);

  // Escape leaves a screen that is being used, from inside its page when that can be reached.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!interactive || !loaded || !doc) return undefined;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onLeave?.();
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, loaded]);

  // Offered to be read as a copy once the page is there and has settled; at once if it has settled already.
  const settled = useRef(false);
  useEffect(() => {
    if (!donate || !loaded) return undefined;
    const timer = window.setTimeout(() => frame.current && donate(frame.current), settled.current ? 0 : READY_AFTER_LOAD_MS + 100);
    return () => window.clearTimeout(timer);
  }, [donate, loaded]);

  useEffect(() => {
    if (!loaded || !onMeasured) return undefined;
    const timers = MEASURE_AT_MS.map((ms) =>
      window.setTimeout(async () => {
        const element = frame.current;
        // A page on a dev server of its own can't be looked into from here, so it is asked (see `measureAcross`).
        const found = element ? (element.contentDocument ? measurePage(element, device.height) : await measureAcross(element, device.height)) : 0;
        if (found) onMeasured(Math.min(MAX_PAGE, found));
      }, ms),
    );
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Ready a moment after it loads, or after long enough without: a slow page doesn't hold the others back.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (loaded) settled.current = true;
      onReady();
    }, loaded ? READY_AFTER_LOAD_MS : GIVE_UP_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return (
    <>
    {/* Until its page has loaded: a placeholder the size of the screen, a faint fill inside an edge, breathing. It goes
        the moment the page is there, fading away over it, and a page that is already there never has one. */}
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-[var(--z-raised)] rounded-[inherit] border border-border bg-surface-hover transition-opacity duration-[var(--fade-duration)] ease-[var(--fade-curve)] ${loaded ? "opacity-0" : "pulse-soft"}`}
    />
    <iframe
      ref={frame}
      src={src}
      title="Screen"
      tabIndex={-1}
      // Nothing inside it is to be used here. `pointer-events` stops at the frame's edge: the page inside is its own
      // document, and Safari scrolls a carousel in it straight from a swipe. Inert reaches the page too. It also hides
      // the page from `elementFromPoint`, which comments need: the studio lifts it for the moment it reads a page it
      // can see into (`frame-page.ts`), but a page on another address reads itself, so that one is left to the layer
      // over it (in `FlowCanvas`) and isn't made inert.
      inert={!across && !interactive}
      onLoad={() => {
        setAcross(!frame.current?.contentDocument);
        setLoaded((count) => count + 1);
      }}
      // A page whose colour scheme differs from the studio's is given an opaque backdrop by the browser; the stage's is light, so its frame says so and stays clear.
      style={{ width: device.width, height: pageHeight, transform: `scale(${SCREEN_SCALE})`, colorScheme: device.id === "stage" ? "light" : undefined }}
      className={`${interactive ? "" : "pointer-events-none"} block origin-top-left border-0`}
      sandbox="allow-scripts allow-forms allow-same-origin"
    />
    </>
  );
}

/**
 * The same, for a page on another address: the frame is set to a phone's height and the page is asked, with a message,
 * how tall it is (the prototype answers; see studio-measure.ts in its `src/lib`). A page that doesn't answer is left at a phone's height.
 */
function measureAcross(frame: HTMLIFrameElement, phone: number) {
  return new Promise<number>((resolve) => {
    const page = frame.contentWindow;
    if (!page) return resolve(0);
    const was = frame.style.height;
    frame.style.height = `${phone}px`;
    const done = (height: number) => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      frame.style.height = was;
      resolve(height);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source === page && event.data?.type === "studio:size" && typeof event.data.height === "number") done(event.data.height);
    };
    const timer = window.setTimeout(() => done(0), 800);
    window.addEventListener("message", onMessage);
    page.postMessage({ type: "studio:measure" }, "*");
  });
}

/**
 * How tall a screen's whole page is, laid out as on the phone it stands for. It is measured with the frame at the
 * phone's height (set and put back before anything is drawn), so a page that grows with its window can't feed on itself.
 */
function measurePage(frame: HTMLIFrameElement, phone: number) {
  const doc = frame.contentDocument;
  if (!doc?.body) return 0;
  const was = frame.style.height;
  frame.style.height = `${phone}px`;
  const height = pageHeightOf(doc);
  frame.style.height = was;
  return height;
}

/**
 * Most pages scroll the document; an app-like one is pinned to the screen and scrolls a box inside it (a sheet, a
 * results page), so its document is always a phone tall. Then it is the screen plus whatever that box holds below the
 * fold: drawn that tall, the box has room for all of it. The box is the one in front, under the middle of the screen,
 * not a page further back (a homepage under a quiz) nor a list or carousel inside it.
 *
 * Drawn taller than a phone, anything made at least as tall as the screen (`min-h-screen`, `min-h-full`) would stretch
 * with it and push what follows down, so it is kept at its phone height first.
 */
function pageHeightOf(doc: Document) {
  const win = doc.defaultView!;
  let box: Element | null = null;
  for (let element = doc.elementFromPoint(win.innerWidth / 2, win.innerHeight / 2); element && element !== doc.body && element !== doc.documentElement; element = element.parentElement) {
    if (element.clientHeight < win.innerHeight / 2 || element.scrollHeight <= element.clientHeight) continue;
    if (!/auto|scroll/.test(win.getComputedStyle(element).overflowY)) continue;
    box = element;
    break;
  }
  const screen = box ? box.clientHeight : win.innerHeight;
  for (const element of (box ?? doc.body).querySelectorAll<HTMLElement>("*")) {
    // A percentage is given back as one, not in pixels: it is of the parent's height.
    const given = win.getComputedStyle(element).minHeight;
    const least = given.endsWith("%") ? (parseFloat(given) / 100) * (element.parentElement?.clientHeight ?? 0) : parseFloat(given);
    if (least >= screen - 1) element.style.setProperty("min-height", `${least}px`, "important");
  }
  const hidden = box ? box.scrollHeight - box.clientHeight : 0;
  return Math.max(doc.documentElement.scrollHeight, win.innerHeight + hidden);
}
