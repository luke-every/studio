"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, useSyncExternalStore } from "react";

import { ArrowIcon, CodeIcon, EllipseIcon, PolygonIcon, StarIcon, FrameIcon, LineIcon, RectangleIcon, ImageIcon, PlayIcon, PointerIcon, TextIcon } from "@/components/shell/nav-icons";
import { CanvasCamera, zoomAbout } from "@/lib/canvas-camera";
import { dataUrlOf, encodeImage } from "@/lib/image";
import { detectLayout, flow as flowLayout, paddingOf, type Layout } from "@/lib/canvas-layout";
import { copiedFill } from "@/lib/canvas-clipboard";
import { fillsOf, readCanvas, STICKY_COLORS, writeCanvas, type CanvasFrame, type CanvasShape, type FillLayer, type Offsets, type Piece } from "@/lib/canvas-saved";
import { COMPONENT_DRAG_TYPE } from "./components-panel";
import { COPIES_OFFERED, donate, useCopiesChoice, useScreenCopy } from "@/lib/screen-copies";
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
import { Card, CommentCard, Composer, DraftPin, NOTE_GAP, NOTE_WIDTH, NoteMark, noteHeight, noteScale, Pin, PinTarget, type CommentsUi } from "./comment-parts";
import { editable, type Part } from "@/lib/edit-part";

import { TextInPlace } from "./edit-layer";
import { BunchPanel, FramePanel, PiecePanel, type AlignMode, type TextStyle } from "./frame-panel";
import { LayersPanel, type LayerRow } from "./layers-panel";
import { StickyNote } from "./sticky-note";
import { StickyTool } from "./sticky-tool";
import { ToolGroup, type ToolOption } from "./tool-group";
import { deviceIcons } from "./view-menu";
import { publishZoom } from "@/lib/canvas-zoom";
import { measure, snapGaps, snapMove, snapResize, type Guide, type Rect, type Span } from "@/lib/canvas-geometry";
import { boxOfTexts } from "@/lib/section-box";
import { handoffPartBox, handoffSourceAt, pageOf, selectorBox, type FramePage } from "./frame-page";
import { childrenIn, type PageTree } from "@/lib/page-tree";
import { useVariants, variantLabel } from "@/lib/use-variants";
import { usePinWatch } from "./use-pin-watch";
import { useCloudCanvas } from "./use-cloud-canvas";
import { useSharedComments } from "./shared-comments";
import { useUser } from "@/lib/use-user";

/** A pointer from a drawing, its point at `x y`; the usual crosshair where drawings aren't used. */
const drawnCursor = (svg: string, x: number, y: number) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, crosshair`;
/** Placing a comment: a speech bubble, its tail where the comment lands. */
const COMMENT_CURSOR = drawnCursor("<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M3 25V9a6 6 0 0 1 6-6h10a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H8z' fill='#111' stroke='#fff' stroke-width='2' stroke-linejoin='round'/></svg>", 3, 25);
/** Placing a note for the developers: a dot with its dotted line out to a box, the dot where the note lands. */
const NOTE_CURSOR = drawnCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='28' viewBox='0 0 32 28'><path d='M8 14h6' stroke='#fff' stroke-width='4'/><path d='M8 14h6' stroke='#111' stroke-width='1.5' stroke-dasharray='2 2'/><rect x='14' y='6' width='15' height='16' rx='3' fill='#111' stroke='#fff' stroke-width='2'/><circle cx='5' cy='14' r='3.5' fill='#111' stroke='#fff' stroke-width='2'/></svg>", 5, 14);
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
/** Resizing snaps from a little further off than moving does: an edge is hard to put exactly on another's. */
const RESIZE_SNAP_PX = 7;
/** Where the stage prototype is served: the empty page that draws one real component of the website, given its story. */
const STAGE = "/p/stage/v0-2";
/** Whether a copy's key is a placed component's (see `pieceDevice`): it is drawn as the component alone, with no frame, name or page behind it. */
const isPiece = (id: string) => id.startsWith("stage/");
/** A component placed on the canvas is a screen of its own on this device, as big as the component is. */
const pieceDevice = (piece: Piece): Device => ({ id: "stage", name: "Component", kind: "desktop", width: piece.width, height: piece.height });
const LAYER = "/canvas-layer.html";
const pieceScreen = (piece: Piece): FlowScreen => piece.kind ? { id: piece.id, name: piece.label, url: LAYER, params: { kind: piece.kind, ...Object.fromEntries(Object.entries(piece.props).filter(([key]) => !(piece.kind === "text" && key === "w")).map(([key, value]) => [key, String(value)])) } } : ({ id: piece.id, name: piece.label, url: STAGE, params: { id: piece.story, ...(Object.keys(piece.props).length ? { props: JSON.stringify(piece.props) } : {}) } });
/** The bar's shapes menu: what each draws. */
const SHAPE_OPTIONS: ToolOption[] = [
  { id: "rectangle", label: "Rectangle", icon: <RectangleIcon className="size-4" />, shortcut: "R" },
  { id: "line", label: "Line", icon: <LineIcon className="size-4" />, shortcut: "L" },
  { id: "arrow", label: "Arrow", icon: <ArrowIcon className="size-4" />, shortcut: "⇧L" },
  { id: "ellipse", label: "Ellipse", icon: <EllipseIcon className="size-4" />, shortcut: "O" },
  { id: "polygon", label: "Polygon", icon: <PolygonIcon className="size-4" /> },
  { id: "star", label: "Star", icon: <StarIcon className="size-4" /> },
];
/** A sticky note is this big (in the canvas's own units) when it is put down, and square; its other shape is a quarter wider (5 to 4), with the same least height. */
const STICKY_SIZE = 120;
const STICKY_WIDE = 1.25;
/** Pulled out sideways, a note keeps its shape until the pull passes the middle of the way between its two shapes, and then goes to the other at once. */
const STICKY_POP = (1 + STICKY_WIDE) / 2;
/** Shapes drawn as lines and paths in an SVG over their box (the rest are the box itself). */
const drawnAsLines = (shape?: CanvasFrame["shape"]) => shape === "line" || shape === "arrow" || shape === "path" || shape === "polygon" || shape === "star";
/** An arrow's head: two strokes back from its tip, in the box's units. */
function arrowhead(one: CanvasFrame) {
  const [x1, y1, x2, y2] = [0, one.flip ? one.height : 0, one.width, one.flip ? 0 : one.height];
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(8, (one.strokeWidth ?? 1) * 6);
  const wing = (turn: number) => `${x2 - size * Math.cos(angle + turn)},${y2 - size * Math.sin(angle + turn)}`;
  return `${wing(-0.5)} ${x2},${y2} ${wing(0.5)}`;
}
/** The pictures kept for the canvas (see `storeImage`), read from storage once each. */
const pictures = new Map<string, string>();
const pictureOf = (name: string) => {
  let data = pictures.get(name);
  if (data === undefined) {
    try {
      data = localStorage.getItem(`proto:canvas-image:${name}`) ?? "";
    } catch {
      data = "";
    }
    pictures.set(name, data);
  }
  return data;
};
/** How a frame's picture sits in it. */
/** A frame's fills as one CSS background: each is a layer, the first (the top of its list) drawn over the rest. */
const backgroundOf = (frame: CanvasFrame) => {
  const layers = fillsOf(frame)
    .filter((fill) => !fill.hidden)
    .map((fill) => (fill.kind === "solid" ? `linear-gradient(${fill.color}, ${fill.color})` : pictureOf(fill.name) ? `url("${pictureOf(fill.name)}") ${FILL_MODES[fill.mode]}` : ""))
    .filter(Boolean);
  return layers.length ? layers.join(", ") : "transparent";
};
const FILL_MODES = { fill: "center / cover no-repeat", fit: "center / contain no-repeat", tile: "0 0 / auto repeat", stretch: "0 0 / 100% 100% no-repeat" } as const;
const Screen = (USE_IN_PLACE ? "div" : "button") as React.ElementType;
const GAP = { x: 140, y: 90 };
const LABEL_HEIGHT = 26;
/** The least a frame or image is resized to, in the canvas's own units. */
const MIN_SIZE = 8;
/** The clear space between one device's copy of a screen and the next device's, beside it: less than between screens, so a screen's copies read as a group. */
const DEVICE_GAP = 48;
/**
 * The canvas draws a screen at half its size (SCREEN_SCALE), so the zoom the person is told is that scale times a half: 100% is real size, a 390 wide phone 390
 * pixels across, as the dimensions say. These two are the canvas's own scale, so 400% at most is 8 here.
 */
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;
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
  cloud,
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
  bar,
  tools,
  layersOpen = false,
  onLayersOpen,
  topLeft,
  topRight,
  editHistory,
  focusFind,
  sidePanel,
  sideFull = false,
  deviceChoice,
  onDeviceChoice,
  uiHidden = false,
  viewOnly = false,
}: {
  flow: Flow;
  /** Looked at, not worked in (a share link): nothing about how the screens are drawn is shown. */
  viewOnly?: boolean;
  /** More for the bar at the foot of the canvas, after its tools: the zoom and the comments. */
  bar?: React.ReactNode;
  /** More tools for the bar at the foot, after text and image (the components button). */
  tools?: React.ReactNode;
  /** Whether the layers panel is shown on the left. */
  layersOpen?: boolean;
  onLayersOpen?: (open: boolean) => void;
  /** The controls at the top left, over the layers, and at the top right, over the properties: one card each. */
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  /** Undo and redo while editing: a card of their own, just left of the top right one. */
  editHistory?: React.ReactNode;
  /** Lines of one section of the copy: once the screens are in, the view goes to where they are. */
  focusFind?: string[];
  /** Under the controls at the top right, in the same card, in place of nothing: the comments while commenting. */
  sidePanel?: React.ReactNode;
  /** The side panel fills the card's height (the comments and the notes, which ask questions that open over it) instead of being as tall as it is. */
  sideFull?: boolean;
  /** The devices chosen to show the screens on, once somebody has: kept with the canvas, here and in the cloud. `onDeviceChoice` is told of the ones the canvas has kept. */
  deviceChoice?: string[];
  onDeviceChoice?: (ids: string[]) => void;
  /** ⌘. : the canvas's own controls (panels, the bar at the foot) are put out of sight. */
  uiHidden?: boolean;
  /** The prototype's address, without any screen's parameters. */
  base: string;
  /** Which version's canvas this is in the cloud: it is saved there, and read from there when opened. */
  cloud?: { slug: string; version: string };
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
  // What shows of something inside frames that clip: only where every one of those frames, up the chain, is. Nothing is cut when it is all inside (the cut would take its outline too).
  const clipFor = (parentId: string | undefined, box: { x: number; y: number; width: number; height: number }) => {
    let [left, top, right, bottom] = [-Infinity, -Infinity, Infinity, Infinity];
    for (let up = parentId; up; ) {
      const frame = shapes.find((one) => one.id === up);
      if (!frame) break;
      if (frame.clip) [left, top, right, bottom] = [Math.max(left, frame.x), Math.max(top, frame.y), Math.min(right, frame.x + frame.width), Math.min(bottom, frame.y + frame.height)];
      up = frame.parent;
    }
    if (left === -Infinity) return undefined;
    const cut = [Math.max(0, top - box.y), Math.max(0, box.x + box.width - right), Math.max(0, box.y + box.height - bottom), Math.max(0, left - box.x)];
    return cut.some((n) => n > 0) ? `inset(${cut.map((n) => `${n}px`).join(" ")})` : undefined;
  };
  const clipOf = (id: string, spot: { x: number; y: number }) => clipFor(pieces.find((piece) => copyKey("stage", piece.id) === id)?.parent, { x: spot.x, y: spot.y, width: widthOf(id), height: heightOf(id) });
  // A placed component is the size of the component itself (measured when its page has loaded), never a page's height.
  const pageHeight = (id: string) => (isPiece(id) ? copyOf.get(id)?.device.height : pageHeights[id]) ?? copyOf.get(id)?.device.height ?? 0;
  const heightOf = (id: string) => pageHeight(id) * SCREEN_SCALE;
  const widthOf = (id: string) => (copyOf.get(id)?.device.width ?? 0) * SCREEN_SCALE;
  // The layout as for one device, each screen's place wide enough for all its copies side by side and as tall as the
  // tallest of them. What is measured here is the screens alone, without the gap after the last.
  const group = devices.reduce((sum, on) => sum + on.width * SCREEN_SCALE, 0) + DEVICE_GAP * (devices.length - 1);
  const tallest = (id: string) => Math.max(...devices.map((on) => heightOf(copyKey(on.id, id))));
  // A screen with a note for the developers has room after it for the note, so the next screen isn't under it.
  const noted = new Set<string>();
  for (const note of comments?.notes ?? []) {
    if (!setups) {
      if (note.anchor.flowScreen) noted.add(note.anchor.flowScreen);
    } else for (const [screenId, setup] of Object.entries(setups)) if (setupOf(setup) === setupOf(note.variant)) noted.add(screenId);
  }
  const laid = layoutFlow(flow, { width: group + GAP.x, height: 0 }, Infinity, (id) => tallest(id) + GAP.y + LABEL_HEIGHT, (id) => (noted.has(id) ? NOTE_WIDTH + NOTE_GAP : 0));
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
  // Written a moment after the last change rather than on every frame of a drag, and at once when the page is left.
  const unwritten = useRef<{ base: string; saved: Parameters<typeof writeCanvas>[1] } | null>(null);
  const writeNow = useCallback(() => {
    if (unwritten.current) writeCanvas(unwritten.current.base, unwritten.current.saved);
    unwritten.current = null;
  }, []);
  useEffect(() => {
    if (unwritten.current && unwritten.current.base !== base) writeNow();
    unwritten.current = { base, saved: { offsets, pieces, frames: shapes, devices: deviceChoice } };
    const timer = window.setTimeout(writeNow, 300);
    return () => window.clearTimeout(timer);
  }, [base, offsets, pieces, shapes, deviceChoice, writeNow]);
  useEffect(() => {
    window.addEventListener("pagehide", writeNow);
    return () => {
      window.removeEventListener("pagehide", writeNow);
      writeNow();
    };
  }, [writeNow]);
  // Opened: the choice this browser kept is put back (the cloud's, when it has one, comes with the canvas).
  const keptDevices = useRef(onDeviceChoice);
  useEffect(() => {
    keptDevices.current = onDeviceChoice;
  });
  useEffect(() => {
    const kept = readCanvas(base).devices;
    if (kept) keptDevices.current?.(kept);
  }, [base]);
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
  const [copiesChosen] = useCopiesChoice();
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
  // Lets go of what is selected for the handoff (its outline, and its panel beside the canvas): for Escape, which only reaches the latest of these through a ref.
  const letGoInspect = useRef<() => void>(() => {});
  useEffect(() => {
    letGoInspect.current = () => {
      setInspected(null);
      setEchoes([]);
      select(null);
    };
  });
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

  // Notes are found on the pages the way comments are: they have a place in a screen too.
  const list = comments ? [...comments.list, ...comments.notes] : undefined;
  // The notes opened out past the lines they show at first.
  const [longNotes, setLongNotes] = useState<ReadonlySet<string>>(new Set());
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

  // Asked to look at a section (a link in a copy doc): once the screens have arrived, the view goes to the box that holds its lines on the first screen that has
  // them, or to the first screen when none does (the lines are in a closed modal, or the words have changed since the link was made).
  const sectionKey = focusFind?.join("|");
  useEffect(() => {
    if (!sectionKey || !focusFind || !size || !revealed || !copies.length) return;
    let stop = false;
    const timers: number[] = [];
    const go = (attempt: number) => {
      if (stop) return;
      for (const copy of copies) {
        // A screen drawn as a static copy answers from its recorded geometry; a live one is read where it stands.
        const page = copyPages.current.get(copy.id);
        const doc = frames.current.get(copy.id)?.contentDocument;
        const found = page?.findBox ? page.findBox(focusFind) : doc ? boxOfTexts(doc, focusFind) : null;
        if (!found) continue;
        const spot = at(copy.id);
        const world = { x: spot.x + found.left * SCREEN_SCALE, y: spot.y + found.top * SCREEN_SCALE, width: found.width * SCREEN_SCALE, height: found.height * SCREEN_SCALE };
        const space = clear(size);
        // Not closer than 100%, with room around it: the section is seen among its page, not filling the window.
        const scale = Math.min(1 / SCREEN_SCALE, MAX_ZOOM, space.width / (world.width * 1.7), space.height / (world.height * 1.7));
        touch(true);
        // And outlined, so what it is can be seen.
        setInspected({ id: "section", copyId: copy.id, box: { left: found.left, top: found.top, width: found.width, height: found.height } });
        camera.set({ scale, x: size.width / 2 - (world.x + world.width / 2) * scale, y: INSET.top + space.height / 2 - (world.y + world.height / 2) * scale }, { glide: true });
        return;
      }
      if (attempt < 3) {
        timers.push(window.setTimeout(() => go(attempt + 1), 600));
        return;
      }
      const first = copies[0];
      const spot = at(first.id);
      const space = clear(size);
      const tall = heightOf(first.id);
      const scale = Math.min(MAX_ZOOM, space.width / widthOf(first.id), space.height / tall);
      touch(true);
      camera.set({ scale, x: size.width / 2 - (spot.x + widthOf(first.id) / 2) * scale, y: INSET.top + space.height / 2 - (spot.y + tall / 2) * scale }, { glide: true });
    };
    timers.push(window.setTimeout(() => go(0), 300));
    return () => {
      stop = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
    // Once for each link, when the screens are in: not each time the layout or the size moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, revealed, !!size]);

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
      if (textingNow.current) {
        event.stopPropagation();
        setTexting(false);
        return;
      }
      if (shapingNow.current) {
        event.stopPropagation();
        setShaping(null);
        setSketch(null);
        setPenned([]);
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
      // A screen that was tapped keeps the keyboard's focus ring, which would read as still selected.
      if ((event.target as HTMLElement | null)?.closest?.("[data-screen]")) (event.target as HTMLElement).blur();
      // What is selected for the handoff lets go too: its panel is beside the canvas, and closes with it.
      const handoff = inspecting.current;
      if (handoff) letGoInspect.current();
      if (!selectedNow.current) {
        if (handoff) event.stopPropagation();
        return;
      }
      // With an element selected in it too, the same press lets go of both: the page hears it and lets go of its part.
      if (!pickingNow.current?.target) event.stopPropagation();
      setSelected(null);
    };
    // Before the page's own, which listens after this in the same pass.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Undo and redo for everything on the canvas: where screens, components, text, images and frames are, what they are, and what is in what. Each change is
  // kept as the three things the canvas is made of; changes that follow one another quickly (a drag, a resize, a paste and its tidying) are one step, and
  // none is kept while the pointer is still down.
  type Snap = { offsets: Offsets; pieces: Piece[]; shapes: CanvasFrame[] };
  const history = useRef<{ past: Snap[]; future: Snap[]; now: Snap }>({ past: [], future: [], now: { offsets, pieces, shapes } });
  // The canvas in the cloud: taken when opened, saved a moment after each change. What it brings in starts the undo history afresh.
  const user = useUser();
  const sharedAs = useSharedComments();
  const [, setPictureArrived] = useState(0);
  const cloudStatus = useCloudCanvas({
    cloud,
    token: sharedAs?.token,
    base,
    viewOnly,
    by: user.name,
    canvas: { offsets, pieces, frames: shapes, devices: deviceChoice },
    adopt: (found) => {
      history.current = { past: [], future: [], now: { offsets: found.offsets, pieces: found.pieces, shapes: found.frames } };
      setOffsets(found.offsets);
      setPieces(found.pieces);
      setShapes(found.frames);
      if (found.devices) onDeviceChoice?.(found.devices);
    },
    havePicture: (name) => !!pictureOf(name),
    pictureData: pictureOf,
    putPicture: (name, data) => {
      pictures.set(name, data);
      try {
        localStorage.setItem(`proto:canvas-image:${name}`, data);
      } catch {
        // Storage full: it is there for this session.
      }
      setPictureArrived((now) => now + 1);
    },
  });
  const latest = useRef<Snap>({ offsets, pieces, shapes });
  const pressed = useRef(false);
  useEffect(() => {
    latest.current = { offsets, pieces, shapes };
  });
  useEffect(() => {
    const set = (on: boolean) => () => void (pressed.current = on);
    const [down, up] = [set(true), set(false)];
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);
  useEffect(() => {
    const h = history.current;
    if (h.now.offsets === offsets && h.now.pieces === pieces && h.now.shapes === shapes) return undefined;
    let timer = 0;
    const commit = () => {
      if (pressed.current) {
        timer = window.setTimeout(commit, 150);
        return;
      }
      h.past.push(h.now);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      h.now = { offsets, pieces, shapes };
    };
    timer = window.setTimeout(commit, 300);
    return () => window.clearTimeout(timer);
  }, [offsets, pieces, shapes]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA"].includes(target?.tagName ?? "")) return;
      // A canvas that is closed stays loaded out of sight: its keys are not for it then.
      if (box.current?.closest("[inert]")) return;
      // With edits made and not saved, these keys undo and redo those (the page's own doing), not what was done on the canvas.
      if (pickingNow.current?.busy) return;
      const redo = key === "y" || event.shiftKey;
      const h = history.current;
      // A change not yet kept as a step is kept now, so undoing straight after it undoes it.
      const live = latest.current;
      if (live.offsets !== h.now.offsets || live.pieces !== h.now.pieces || live.shapes !== h.now.shapes) {
        h.past.push(h.now);
        h.now = live;
        h.future = [];
      }
      const snap = redo ? h.future.pop() : h.past.pop();
      if (!snap) return;
      event.preventDefault();
      (redo ? h.past : h.future).push(h.now);
      h.now = snap;
      setOffsets(snap.offsets);
      setPieces(snap.pieces);
      setShapes(snap.shapes);
      // What is selected may no longer be there.
      setSelected((now) => (now && isPiece(now) && !snap.pieces.some((piece) => copyKey("stage", piece.id) === now) ? null : now));
      setShape((now) => (now && !snap.shapes.some((one) => one.id === now) ? null : now));
      setBunch({ copies: [], frames: [] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A press on a screen or its name moves that screen (`screen`, from where it was: `origin`), and only that screen (or all that are
  // selected together, if it is one of them). One on the canvas around them draws a box that selects what it touches; with Space
  // held, a press anywhere pans instead, as in Figma.
  const drag = useRef<{ x: number; y: number; from: View; moved: boolean; pan: boolean; /** Pressed with Space (or the middle button): only moves the view, and leaves the selection as it is. */ spaced?: boolean; lasso?: boolean; screen?: string; origin?: { x: number; y: number }; group?: GroupBase; /** Pressed with Alt: a copy is left behind once it is dragged. */ dup?: Chosen } | null>(null);
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
  // Shift adds a thing to the selection, or takes it out when it is in.
  const toggleSelected = (copy?: string, frame?: string) => {
    const now = bunchNow.current;
    const base = now.copies.length || now.frames.length ? now : { copies: selectedNow.current ? [selectedNow.current] : [], frames: shapeNow.current ? [shapeNow.current] : [] };
    const flip = (list: string[], id?: string) => (id ? (list.includes(id) ? list.filter((one) => one !== id) : [...list, id]) : list);
    setBunch({ copies: flip(base.copies, copy), frames: flip(base.frames, frame) });
    setSelected(null);
    setShape(null);
    if (pickingNow.current?.target) pickingNow.current.onPick(null, null);
  };
  // Where everything in the group is, to move it all by the same distance from there. What is in a selected frame goes with it.
  const groupBase = (): GroupBase => {
    const keys = new Set(bunch.copies);
    for (const id of bunch.frames) for (const key of childrenOf(id)) keys.add(key);
    const all = new Set(bunch.frames.flatMap((id) => [id, ...framesIn(id)]));
    return {
      copies: Object.fromEntries([...keys].map((key) => [key, offsets[key] ?? { x: 0, y: 0 }])),
      frames: Object.fromEntries(shapes.filter((one) => all.has(one.id)).map((one) => [one.id, { x: one.x, y: one.y }])),
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
  // Equal spacing too: between two things, or the same gap as they have to each other; the gaps are drawn as spans.
  const [gapSpans, setGapSpans] = useState<Span[]>([]);
  const clearGuides = () => {
    setGuides((now) => (now.length ? [] : now));
    setGapSpans((now) => (now.length ? [] : now));
  };
  const lineUp = (moving: Rect, skip: ReadonlySet<string>, free: boolean) => {
    if (free) {
      clearGuides();
      return { dx: 0, dy: 0 };
    }
    const [targets, near] = [everythingBut(skip), SNAP_PX / camera.target.scale];
    const edge = snapMove(moving, targets, near);
    // Where it has already lined up by an edge on a side, that is what holds there; the gaps are for the other.
    const gap = snapGaps({ ...moving, x: moving.x + edge.dx, y: moving.y + edge.dy }, targets, near);
    const spans = gap.spans.filter((span) => (span.y1 === span.y2 ? edge.dx === 0 : edge.dy === 0));
    setGuides(edge.guides);
    setGapSpans(spans);
    return { dx: edge.dx !== 0 ? edge.dx : gap.dx, dy: edge.dy !== 0 ? edge.dy : gap.dy };
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
  // A shape tool in hand (R rectangle, O ellipse, L line, P pen): the first three are drawn by dragging; the pen by clicking its points, ending on Enter, a double-click, or a click back on the first.
  const [shaping, setShaping] = useState<CanvasShape | null>(null);
  const [penned, setPenned] = useState<{ x: number; y: number }[]>([]);
  const [penAt, setPenAt] = useState<{ x: number; y: number } | null>(null);
  // The shape last chosen from the bar's shapes menu: what its button holds.
  const [shapeKind, setShapeKind] = useState<CanvasShape>("rectangle");
  // The sticky note tool (S): the colour a new one is, and the one whose words are being typed.
  const [stickyColor, setStickyColor] = useState<string>(STICKY_COLORS[0].color);
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const shapingNow = useRef<CanvasShape | null>(null);
  useEffect(() => {
    shapingNow.current = shaping;
  });
  const [sketch, setSketch] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [shape, setShape] = useState<string | null>(null);
  // The frame under the pointer, outlined as an element is on a page. What is in a frame is reached through it, as on a page: pointing at it
  // is pointing at the frame, and ⌘ (or Ctrl) reaches the piece in it, and then the element in that.
  const [hoverShape, setHoverShape] = useState<string | null>(null);
  // A text or image under the pointer: outlined as a frame is, selected or not.
  const [hoverLayer, setHoverLayer] = useState<string | null>(null);
  // The other ways the selected component can be shown, once one is selected.
  const selectedStory = selected && isPiece(selected) ? pieces.find((piece) => copyKey("stage", piece.id) === selected && !piece.kind)?.story : undefined;
  const variants = useVariants(selectedStory, !viewOnly && !!selectedStory);
  const parentOf = (id: string) => (isPiece(id) ? pieces.find((piece) => copyKey("stage", piece.id) === id)?.parent : undefined);
  // T: the text tool. A click puts a text where it is; it is typed in at once, and again on a double click.
  const [texting, setTexting] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const textingNow = useRef(false);
  const framingNow = useRef(false);
  const shapeNow = useRef<string | null>(null);
  useEffect(() => {
    framingNow.current = framing;
    textingNow.current = texting;
    shapeNow.current = shape;
  });
  const removeFrameNow = useRef<(id: string) => void>(() => {});
  const deleteGroupNow = useRef<(together: { copies: string[]; frames: string[] }) => void>(() => {});
  const movingShape = useRef<{ id: string; x: number; y: number; from: { x: number; y: number }; scale: number; group?: GroupBase; dup?: Chosen; moved?: boolean } | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A canvas that is closed stays loaded out of sight: its keys are not for it then.
      if (box.current?.closest("[inert]")) return;
      const tool = event.shiftKey && event.key.toLowerCase() === "l" ? "arrow" : event.shiftKey ? undefined : ({ r: "rectangle", o: "ellipse", l: "line", s: "sticky" } as Record<string, CanvasShape>)[event.key.toLowerCase()];
      if (tool && !event.repeat && !viewOnly) {
        shapeActs.current.pick(tool);
      } else if (event.key === "Enter" && shapingNow.current === "path") {
        shapeActs.current.finish(false);
      } else if (event.key.toLowerCase() === "v" && !event.repeat) {
        setShaping(null);
        setPenned([]);
        setSketch(null);
        setFraming(false);
        setTexting(false);
      } else if (event.key.toLowerCase() === "t" && !event.repeat && !viewOnly) {
        setShaping(null);
        setPenned([]);
        setShape(null);
        setSketch(null);
        setFraming(false);
        setTexting((on) => !on);
      } else if (event.key.toLowerCase() === "f" && !event.repeat) {
        setShaping(null);
        setPenned([]);
        setTexting(false);
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
      const goneFrames = new Set(together.frames.flatMap((id) => [id, ...framesIn(id)]));
      setShapes((now) => now.filter((one) => !goneFrames.has(one.id)));
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

  // Where the corner being dragged goes: with Shift held, as far along as it has gone either way (a square, a circle), or for a line the nearest 45 degrees.
  const pulledTo = (from: { x: number; y: number }, x: number, y: number, locked: boolean, line: boolean) => {
    if (!locked) return { x2: x, y2: y };
    const [dx, dy] = [x - from.x, y - from.y];
    if (line) {
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(dy, dx) / step) * step;
      const length = Math.hypot(dx, dy);
      return { x2: from.x + length * Math.cos(angle), y2: from.y + length * Math.sin(angle) };
    }
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return { x2: from.x + (dx < 0 ? -size : size), y2: from.y + (dy < 0 ? -size : size) };
  };
  // The shape tools. Dragged out, a rectangle, ellipse or line is a frame with a shape; the pen's points are kept as fractions of the box round them, so the path scales when it is resized.
  const pickShape = (kind: CanvasShape, chosen = false) => {
    setShape(null);
    setSketch(null);
    setPenned([]);
    setFraming(false);
    setTexting(false);
    if (kind !== "path" && kind !== "sticky") setShapeKind(kind);
    setShaping((now) => (now === kind && !chosen ? null : kind));
  };
  const shapeNames: Record<CanvasShape, string> = { rectangle: "Rectangle", ellipse: "Ellipse", line: "Line", arrow: "Arrow", polygon: "Polygon", star: "Star", path: "Path", sticky: "Sticky note" };
  /** The corners of a triangle, or of a five-pointed star, as fractions of the box they fill. */
  const cornersOf = (kind: "polygon" | "star"): [number, number][] =>
    kind === "polygon"
      ? [[0.5, 0], [1, 1], [0, 1]]
      : Array.from({ length: 10 }, (_, i) => {
          const [r, a] = [i % 2 ? 0.19 : 0.5, (i * Math.PI) / 5];
          return [0.5 + r * Math.sin(a), 0.5 - r * Math.cos(a)] as [number, number];
        });
  const putShape = (kind: CanvasShape, box: { x: number; y: number; width: number; height: number }, more: Partial<CanvasFrame> = {}) => {
    const id = `frame-${Math.random().toString(36).slice(2, 8)}`;
    const line = kind === "line" || kind === "arrow" || kind === "path";
    setShapes((was) => [
      ...was,
      {
        id,
        name: `${shapeNames[kind]} ${was.filter((one) => one.shape === kind).length + 1}`,
        ...box,
        shape: kind,
        // Inside the frame it lands in, which it then moves with.
        parent: frameAt(box.x + box.width / 2, box.y + box.height / 2),
        fill: kind === "line" || kind === "arrow" ? undefined : "#d9d9d9",
        stroke: line ? "#111111" : undefined,
        strokeWidth: line ? 1 : undefined,
        ...more,
      },
    ]);
    setShape(id);
    setSelected(null);
    setShaping(null);
    return id;
  };
  // A note carried out of the bar and let go of over the canvas (not over the bar again): put down there, centred on the pointer, and typed on.
  const dropSticky = (color: string, clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    if (document.elementFromPoint(clientX, clientY)?.closest('[role="toolbar"]')) return;
    const at = worldOf(clientX, clientY);
    setStickyColor(color);
    setEditingSticky(putShape("sticky", { x: at.x - STICKY_SIZE / 2, y: at.y - STICKY_SIZE / 2, width: STICKY_SIZE, height: STICKY_SIZE }, { fill: color, radius: 4, text: "", author: user.name || undefined, base: STICKY_SIZE }));
  };
  const addShape = (kind: CanvasShape, area: { x: number; y: number; x2: number; y2: number }) => {
    const now = camera.target;
    const dragged = Math.abs(area.x2 - area.x) >= 4 || Math.abs(area.y2 - area.y) >= 4;
    const x = (Math.min(area.x, area.x2) - now.x) / now.scale;
    const y = (Math.min(area.y, area.y2) - now.y) / now.scale;
    const straight = kind === "line" || kind === "arrow";
    const [width, height] = dragged ? [Math.abs(area.x2 - area.x) / now.scale, Math.abs(area.y2 - area.y) / now.scale] : straight ? [100, 0] : kind === "sticky" ? [STICKY_SIZE, STICKY_SIZE] : [100, 100];
    if (kind === "sticky") {
      // A sticky note is in the colour in hand, and is typed on at once.
      // A square, as big as the drag was in its larger direction; that is its base.
      const side = dragged ? Math.max(width, height) : STICKY_SIZE;
      setEditingSticky(putShape(kind, { x, y, width: side, height: side }, { fill: stickyColor, radius: 4, text: "", author: user.name || undefined, base: side }));
      return;
    }
    putShape(kind, { x, y, width, height }, straight ? { flip: dragged && area.x2 > area.x !== area.y2 > area.y } : kind === "polygon" || kind === "star" ? { points: cornersOf(kind), closed: true } : {});
  };
  const finishPath = (closed: boolean) => {
    const points = penned;
    setPenned([]);
    setPenAt(null);
    if (points.length < 2) return setShaping(null);
    const now = camera.target;
    const world = points.map((point) => ({ x: (point.x - now.x) / now.scale, y: (point.y - now.y) / now.scale }));
    const [left, top] = [Math.min(...world.map((point) => point.x)), Math.min(...world.map((point) => point.y))];
    const [width, height] = [Math.max(Math.max(...world.map((point) => point.x)) - left, 1), Math.max(Math.max(...world.map((point) => point.y)) - top, 1)];
    putShape("path", { x: left, y: top, width, height }, { points: world.map((point) => [(point.x - left) / width, (point.y - top) / height] as [number, number]), closed, fill: closed ? "#d9d9d9" : undefined });
  };
  const shapeActs = useRef({ pick: pickShape, finish: finishPath });
  useEffect(() => {
    shapeActs.current = { pick: pickShape, finish: finishPath };
  });

  // Pressing a frame, on its body or its name, selects it and (dragged) moves it, with the others if it is one of several selected.
  const frameDown = (event: React.PointerEvent<HTMLElement>, one: CanvasFrame) => {
    // With Space held a press pans, wherever it is: the canvas hears it.
    if (space.current || event.button === 1) return;
    event.stopPropagation();
    if (event.shiftKey) return toggleSelected(undefined, one.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const together = bunch.frames.includes(one.id);
    if (!together) {
      setBunch((now) => (now.copies.length || now.frames.length ? { copies: [], frames: [] } : now));
      setShape(one.id);
      setSelected(null);
      // What was picked inside a screen or piece (an element, its panel) is let go of: the frame is the selection now.
      if (pickingNow.current?.target) pickingNow.current.onPick(null, null);
      letGoInspect.current();
    }
    const dup = event.altKey && !viewOnly ? (together ? selectedPieces() : { keys: childrenOf(one.id), frames: [one.id, ...framesIn(one.id)] }) : undefined;
    movingShape.current = { id: one.id, x: event.clientX, y: event.clientY, from: { x: one.x, y: one.y }, scale: camera.target.scale, group: together ? groupBase() : undefined, dup };
  };
  const frameMove = (event: React.PointerEvent<HTMLElement>, one: CanvasFrame) => {
    const move = movingShape.current;
    if (!move || move.id !== one.id) return;
    if (!move.moved && Math.hypot(event.clientX - move.x, event.clientY - move.y) >= 4) move.moved = true;
    // A frame in an auto layout is carried by the pointer while it is dragged, and goes back in (or on, into another) when it is let go of.
    if (move.moved) holdLayout.current = true;
    if (move.dup && move.moved) {
      leaveCopy(move.dup);
      move.dup = undefined;
    }
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
      const skip = new Set([`frame:${one.id}`, ...childrenOf(one.id), ...framesIn(one.id).map((id) => `frame:${id}`)]);
      const nudge = lineUp({ id: `frame:${one.id}`, x: move.from.x + dx, y: move.from.y + dy, width: one.width, height: one.height }, skip, free);
      const [x, y] = [move.from.x + dx + nudge.dx, move.from.y + dy + nudge.dy];
      updateFrame(one.id, { x, y });
      if (move.moved) aimAt(frameTarget(one.id, x + one.width / 2, y + one.height / 2));
    }
  };
  const frameUp = () => {
    const move = movingShape.current;
    movingShape.current = null;
    clearGuides();
    if (holdLayout.current) {
      holdLayout.current = false;
      setSettle((now) => now + 1);
    }
    setDropInto(null);
    // A frame let go of over another is in it from then on, and out of it when let go of elsewhere; drawn above it, with what is in it.
    const one = move?.moved && !move.group ? shapes.find((item) => item.id === move.id) : undefined;
    if (!one) return;
    const parent = frameTarget(one.id, one.x + one.width / 2, one.y + one.height / 2);
    if (parent === one.parent) return;
    const moving = new Set([one.id, ...framesIn(one.id)]);
    setShapes((now) => [...now.filter((item) => !moving.has(item.id)), ...now.filter((item) => moving.has(item.id)).map((item) => (item.id === one.id ? { ...item, parent } : item))]);
  };
  // Resizing from the eight handles on a selected frame or image, as in Figma: a corner keeps its opposite one still, an edge moves only itself, Shift keeps
  // the proportions (from a corner) and Alt grows it from the middle. A frame follows the pointer; an image shows its new box and takes it on letting go.
  type Area = { x: number; y: number; width: number; height: number };
  const resizeFrom = useRef<{ id: string; image: boolean; handle: [number, number]; px: number; py: number; start: Area; base: number } | null>(null);
  const [resizeDraft, setResizeDraft] = useState<Area | null>(null);
  // The sticky note being pulled wide or square: its width goes over a moment, so the change is seen as a pop.
  const [popping, setPopping] = useState<string | null>(null);
  const areaOf = (start: Area, [hx, hy]: [number, number], dx: number, dy: number, keep: boolean, centre: boolean): Area => {
    const grow = centre ? 2 : 1;
    let width = start.width + (hx === 1 ? dx : hx === 0 ? -dx : 0) * grow;
    let height = start.height + (hy === 1 ? dy : hy === 0 ? -dy : 0) * grow;
    if (keep && hx !== 0.5 && hy !== 0.5) {
      const by = Math.max(width / start.width, height / start.height);
      width = start.width * by;
      height = start.height * by;
    }
    width = Math.max(MIN_SIZE, width);
    height = Math.max(MIN_SIZE, height);
    const x = centre ? start.x + (start.width - width) / 2 : hx === 0 ? start.x + start.width - width : start.x;
    const y = centre ? start.y + (start.height - height) / 2 : hy === 0 ? start.y + start.height - height : start.y;
    return { x, y, width, height };
  };
  const startResize = (event: React.PointerEvent<HTMLElement>, id: string, image: boolean, handle: [number, number], start: Area) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeFrom.current = { id, image, handle, px: event.clientX, py: event.clientY, start, base: shapes.find((one) => one.id === id)?.base ?? Math.min(start.width, start.height) };
  };
  // A text's width is put on the words where they are drawn, so they reflow as it is dragged, with nothing loaded again (the width is not part of the layer's address).
  // Its height follows the lines, read back from there.
  const fitText = (id: string, width?: number) => {
    const layer = (copyPages.current.get(id)?.scope?.querySelector("#layer") ?? frames.current.get(id)?.contentDocument?.getElementById("layer")) as HTMLElement | null | undefined;
    const wide = width ?? Number(pieceByKey(id)?.props.w);
    if (!layer || !wide) return;
    layer.style.width = `${wide}px`;
    layer.style.maxWidth = "none";
    layer.style.whiteSpace = "pre-wrap";
    const height = Math.ceil(layer.offsetHeight);
    if (height) setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === id && piece.height !== height ? { ...piece, height } : piece)));
  };
  // A component's size is put on its outermost element where it is drawn, as a text's width is on its words: it reflows as it is dragged, nothing loads again, and the box
  // round it then takes the size it really came to (a component can refuse to be smaller than what it holds).
  const fitComponent = (id: string, width?: number, height?: number) => {
    const piece = pieceByKey(id);
    const stage = (copyPages.current.get(id)?.scope?.querySelector("[data-stage]") ?? frames.current.get(id)?.contentDocument?.querySelector("[data-stage]")) as HTMLElement | null | undefined;
    const root = stage?.firstElementChild as HTMLElement | null | undefined;
    if (!stage || !root || !piece) return;
    const [w, h] = [width ?? piece.fixedWidth, height ?? piece.fixedHeight];
    root.style.width = w ? `${w}px` : "";
    root.style.height = h ? `${h}px` : "";
    root.style.maxWidth = w ? "none" : "";
    root.style.boxSizing = w || h ? "border-box" : "";
    const [seenW, seenH] = [Math.ceil(stage.offsetWidth), Math.ceil(stage.offsetHeight)];
    if (seenW && seenH) setPieces((all) => all.map((one) => (copyKey("stage", one.id) === id && (one.width !== seenW || one.height !== seenH) ? { ...one, width: seenW, height: seenH } : one)));
  };
  // What a placed piece was given for a size is put on it again when its page comes or loads again.
  const applyFixed = (id: string) => {
    const piece = pieceByKey(id);
    if (piece?.kind === "text") fitText(id);
    else if (piece && !piece.kind && (piece.fixedWidth || piece.fixedHeight)) fitComponent(id);
  };
  // Twice on a handle: that side goes back to hugging what the component holds.
  const hugComponent = (id: string, [hx, hy]: [number, number]) => {
    setPieces((all) => all.map((one) => (copyKey("stage", one.id) === id ? { ...one, ...(hx !== 0.5 ? { fixedWidth: undefined } : {}), ...(hy !== 0.5 ? { fixedHeight: undefined } : {}) } : one)));
    requestAnimationFrame(() => fitComponent(id, hx !== 0.5 ? 0 : undefined, hy !== 0.5 ? 0 : undefined));
  };
  // A text with no width of its own: as wide as its words, as tall as its lines.
  const fitWords = (id: string) => {
    const layer = (copyPages.current.get(id)?.scope?.querySelector("#layer") ?? frames.current.get(id)?.contentDocument?.getElementById("layer")) as HTMLElement | null | undefined;
    if (!layer) return;
    layer.style.width = "";
    layer.style.whiteSpace = "pre";
    layer.style.maxWidth = "none";
    const [width, height] = [Math.ceil(layer.offsetWidth), Math.ceil(layer.offsetHeight)];
    if (!width || !height) return;
    setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, width, height, sizing: { ...piece.sizing, width: undefined }, props: Object.fromEntries(Object.entries(piece.props).filter(([key]) => key !== "w")) } : piece)));
  };
  // A frame drawn tight round what is in it, in the way of the handle (with its layout's padding kept): width, height or both. Its contents stay where they are.
  const fitFrame = (id: string, [hx, hy]: [number, number]) => {
    const frame = shapes.find((one) => one.id === id);
    if (!frame) return;
    const boxes = [
      ...pieces.filter((piece) => piece.parent === id && copyOf.has(copyKey("stage", piece.id))).map((piece) => {
        const key = copyKey("stage", piece.id);
        const spot = at(key);
        return { x: spot.x, y: spot.y, width: widthOf(key), height: heightOf(key) };
      }),
      ...shapes.filter((one) => one.parent === id),
    ];
    if (!boxes.length) return;
    const pad = (frame.layout?.padding ?? 0) * SCREEN_SCALE;
    const left = Math.min(...boxes.map((box) => box.x)) - pad;
    const top = Math.min(...boxes.map((box) => box.y)) - pad;
    const right = Math.max(...boxes.map((box) => box.x + box.width)) + pad;
    const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + pad;
    // And it keeps hugging: that side is set to follow what is in it from now on.
    setShapes((all) => all.map((one) => (one.id !== id ? one : { ...one, ...(hx !== 0.5 ? { x: left, width: right - left } : {}), ...(hy !== 0.5 ? { y: top, height: bottom - top } : {}), sizing: { ...one.sizing, ...(hx !== 0.5 ? { width: "hug" as const } : {}), ...(hy !== 0.5 ? { height: "hug" as const } : {}) } })));
  };
  const moveResize = (event: React.PointerEvent<HTMLElement>) => {
    const now = resizeFrom.current;
    if (!now) return;
    // A sticky note has two shapes, square and wide. Pulled from its right edge it goes from one to the other as the pull passes the middle of the way, at once;
    // pulled from a corner it is scaled as a whole (its words with it), keeping the shape it has.
    const sticky = !now.image && shapes.find((one) => one.id === now.id)?.shape === "sticky";
    if (sticky && now.handle[0] === 1 && now.handle[1] === 0.5) {
      const reach = now.start.width + (event.clientX - now.px) / view.scale;
      const width = now.base * (reach > now.base * STICKY_POP ? STICKY_WIDE : 1);
      clearGuides();
      setPopping(now.id);
      setShapes((all) => all.map((one) => (one.id === now.id ? { ...one, width } : one)));
      return;
    }
    const keep = event.shiftKey || (sticky && now.handle[0] !== 0.5 && now.handle[1] !== 0.5);
    let area = areaOf(now.start, now.handle, (event.clientX - now.px) / view.scale, (event.clientY - now.py) / view.scale, keep, event.altKey);
    // The edges pulled line up with other things' edges and middles (the frame it is in too), as a moved layer does; ⌘ or Ctrl turns that off, and Alt (from the middle) keeps to its own.
    // With Shift held at a corner the proportions are kept: each pulled edge is tried on its own, the nearer one wins, and both sides follow it.
    if (!(event.metaKey || event.ctrlKey || event.altKey)) {
      const skip = now.image ? new Set([now.id]) : new Set([`frame:${now.id}`, ...childrenOf(now.id), ...framesIn(now.id).map((id) => `frame:${id}`)]);
      const targets = everythingBut(skip);
      const near = RESIZE_SNAP_PX / camera.target.scale;
      const [hx, hy] = now.handle;
      if (keep && hx !== 0.5 && hy !== 0.5) {
        const [alongX, alongY] = [snapResize({ id: now.id, ...area }, [hx, 0.5], targets, near).area, snapResize({ id: now.id, ...area }, [0.5, hy], targets, near).area];
        const [offX, offY] = [Math.abs(alongX.width - area.width), Math.abs(alongY.height - area.height)];
        const by = offX > 0 && (offY === 0 || offX <= offY) ? alongX.width / area.width : offY > 0 ? alongY.height / area.height : 1;
        if (by !== 1) {
          const [width, height] = [area.width * by, area.height * by];
          if (width >= MIN_SIZE && height >= MIN_SIZE) area = { x: hx === 0 ? now.start.x + now.start.width - width : now.start.x, y: hy === 0 ? now.start.y + now.start.height - height : now.start.y, width, height };
        }
        setGuides(snapResize({ id: now.id, ...area }, now.handle, targets, 0.01).guides);
      } else {
        const snapped = snapResize({ id: now.id, ...area }, now.handle, targets, near);
        if (snapped.area.width >= MIN_SIZE && snapped.area.height >= MIN_SIZE) area = { x: snapped.area.x, y: snapped.area.y, width: snapped.area.width, height: snapped.area.height };
        setGuides(snapped.guides);
      }
    } else clearGuides();
    if (now.image && pieceByKey(now.id) && !pieceByKey(now.id)!.kind) {
      const [width, height] = [Math.round(area.width / SCREEN_SCALE), Math.round(area.height / SCREEN_SCALE)];
      const spot = placed.get(now.id) ?? { x: 0, y: 0 };
      const [pullW, pullH] = [now.handle[0] !== 0.5, now.handle[1] !== 0.5];
      setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === now.id ? { ...piece, ...(pullW ? { fixedWidth: width, width } : {}), ...(pullH ? { fixedHeight: height, height } : {}), sizing: { ...piece.sizing, ...(pullW ? { width: undefined } : {}), ...(pullH ? { height: undefined } : {}) } } : piece)));
      setOffsets((all) => ({ ...all, [now.id]: { x: area.x - spot.x, y: area.y - LABEL_HEIGHT - spot.y } }));
      fitComponent(now.id, pullW ? width : undefined, pullH ? height : undefined);
      return;
    }
    if (now.image && pieceByKey(now.id)?.kind === "text") {
      const width = Math.round(area.width / SCREEN_SCALE);
      const spot = placed.get(now.id) ?? { x: 0, y: 0 };
      setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === now.id ? { ...piece, width, sizing: { ...piece.sizing, width: undefined }, props: { ...piece.props, w: width } } : piece)));
      setOffsets((all) => ({ ...all, [now.id]: { x: area.x - spot.x, y: all[now.id]?.y ?? 0 } }));
      fitText(now.id, width);
      return;
    }
    if (now.image) return setResizeDraft(area);
    // By hand now: the sides pulled are its own size from here on (a hugging frame stops hugging that side).
    const [hx, hy] = now.handle;
    setShapes((all) => all.map((one) => (one.id === now.id ? { ...one, ...area, ...(sticky ? { base: now.base * (area.width / now.start.width) } : {}), sizing: { ...one.sizing, ...(hx !== 0.5 ? { width: "fixed" as const } : {}), ...(hy !== 0.5 ? { height: "fixed" as const } : {}) } } : one)));
  };
  const endResize = () => {
    const now = resizeFrom.current;
    resizeFrom.current = null;
    clearGuides();
    setPopping(null);
    const area = resizeDraft;
    setResizeDraft(null);
    if (!now?.image || !area) return;
    const spot = placed.get(now.id) ?? { x: 0, y: 0 };
    const [width, height] = [Math.round(area.width / SCREEN_SCALE), Math.round(area.height / SCREEN_SCALE)];
    setOffsets((all) => ({ ...all, [now.id]: { x: area.x - spot.x, y: area.y - LABEL_HEIGHT - spot.y } }));
    // A text takes only its width (it wraps there, and is as tall as its words); an image its whole box.
    setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) !== now.id ? piece : piece.kind === "text" ? { ...piece, width, props: { ...piece.props, w: width } } : { ...piece, width, height, props: { ...piece.props, w: width, h: height } })));
  };
  const sizePiece = (id: string, width: number, height: number) => {
    if (pieceByKey(id)?.kind === "text") requestAnimationFrame(() => fitText(id, width));
    if (pieceByKey(id) && !pieceByKey(id)!.kind) {
      setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, fixedWidth: width, fixedHeight: height, sizing: undefined } : piece)));
      requestAnimationFrame(() => fitComponent(id, width, height));
      return;
    }
    setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) !== id ? piece : piece.kind === "text" ? { ...piece, width, sizing: { ...piece.sizing, width: undefined }, props: { ...piece.props, w: width } } : { ...piece, width, height, sizing: undefined, props: { ...piece.props, w: width, h: height } })));
  };
  // Filling needs room to fill: a frame that hugs what is in it has none, so the frame it is filling is given a size of its own on that side (the one it has now), as Figma does.
  const roomToFill = (parentId: string | undefined, side: "width" | "height") => {
    const parent = shapes.find((one) => one.id === parentId);
    if (parent && frameMode(parent, side) === "hug") setShapes((all) => all.map((one) => (one.id === parentId ? { ...one, sizing: { ...one.sizing, [side]: "fixed" as const } } : one)));
  };
  // Pinning a layer (or letting it go) from its panel: its distances to the frame's edges are read afresh from where it is.
  const pinLayer = (id: string, axis: "x" | "y", value: "none" | "start" | "end" | "both" | "center") => {
    pinMemo.current.delete(id);
    const set = (pin: CanvasFrame["pin"]) => {
      const next = { ...pin, [axis]: value === "none" ? undefined : value };
      return next.x || next.y ? next : undefined;
    };
    if (id.startsWith("frame:")) setShapes((all) => all.map((one) => (one.id === id.slice(6) ? { ...one, pin: set(one.pin) } : one)));
    else setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, pin: set(piece.pin) } : piece)));
  };
  // How a layer is sized along a side, from its panel.
  const modePiece = (id: string, side: "width" | "height", mode: "fixed" | "hug" | "fill") => {
    const piece = pieceByKey(id);
    if (!piece) return;
    if (mode === "fill") roomToFill(piece.parent, side);
    if (mode === "hug" && piece.kind === "text" && side === "width") return fitWords(id);
    if (!piece.kind) {
      // A component hugs when it has no size of its own on that side; fixed keeps the size it has; fill takes what the layout leaves.
      // Filling keeps the size it has until the layout gives it the room's.
      const fills = mode === "fill";
      setPieces((all) => all.map((one) => (copyKey("stage", one.id) !== id ? one : { ...one, ...(fills ? {} : side === "width" ? { fixedWidth: mode === "fixed" ? one.width : undefined } : { fixedHeight: mode === "fixed" ? one.height : undefined }), sizing: { ...one.sizing, [side]: fills ? "fill" : undefined } })));
      if (!fills) requestAnimationFrame(() => fitComponent(id, side === "width" ? (mode === "fixed" ? piece.width : 0) : undefined, side === "height" ? (mode === "fixed" ? piece.height : 0) : undefined));
      return;
    }
    setPieces((all) =>
      all.map((one) => {
        if (copyKey("stage", one.id) !== id) return one;
        const sizing = { ...one.sizing, [side]: mode === "fill" ? "fill" : undefined };
        // A text set to its own width keeps the one it has.
        return one.kind === "text" && side === "width" && mode === "fixed" ? { ...one, sizing, props: { ...one.props, w: one.width } } : { ...one, sizing };
      }),
    );
  };
  const styleText = (id: string, patch: Partial<TextStyle>) => setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, props: { ...piece.props, ...patch } } : piece)));
  const HANDLES: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
  const handlesFor = (id: string, image: boolean, area: Area, sides = false, fit?: (handle: [number, number]) => void, label?: string, tone = "var(--selection)", sticky = false) => {
    const corner = toScreen(area.x, area.y);
    const [w, h] = [area.width * view.scale, area.height * view.scale];
    return (
      <Fragment key={`resize-${id}`}>
        {image && resizeDraft ? <span aria-hidden style={{ left: corner.x, top: corner.y, width: w, height: h }} className="pointer-events-none absolute border border-[var(--selection)]" /> : null}
        {label ? (
          <span
            aria-hidden
            style={{ left: corner.x + w / 2, top: corner.y + h + 10, background: tone }}
            className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-[var(--r-sm)] px-1.5 py-0.5 text-xs font-medium tabular-nums text-[var(--selection-foreground)]"
          >
            {label}
          </span>
        ) : null}
        {HANDLES.filter(([hx, hy]) => (!sides || hy === 0.5) && (!sticky || (hx === 1 && hy === 0.5) || (hx !== 0.5 && hy !== 0.5))).map(([hx, hy]) => (
          <span
            key={`${hx}-${hy}`}
            onPointerDown={(event) => startResize(event, id, image, [hx, hy], { x: area.x, y: area.y, width: area.width, height: area.height })}
            onPointerMove={moveResize}
            // Twice on a handle fits that way (width, height or both) to what is inside.
            onDoubleClick={(event) => {
              event.stopPropagation();
              fit?.([hx, hy]);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              endResize();
            }}
            style={{ left: corner.x + w * hx, top: corner.y + h * hy, cursor: hx === 0.5 ? "ns-resize" : hy === 0.5 ? "ew-resize" : hx === hy ? "nwse-resize" : "nesw-resize" }}
            className="pointer-events-auto absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--selection)] bg-[var(--selection-foreground)]"
          />
        ))}
      </Fragment>
    );
  };
  // A frame's changes, and what goes with it: what is in a frame moves with it, and goes with it.
  // The frames inside a frame, at any depth.
  const framesIn = (id: string): string[] => shapes.filter((one) => one.parent === id).flatMap((one) => [one.id, ...framesIn(one.id)]);
  // What is in a frame, however deep: its own pieces and those of the frames in it.
  const childrenOf = (frameId: string) => {
    const within = new Set([frameId, ...framesIn(frameId)]);
    return pieces.filter((piece) => piece.parent && within.has(piece.parent)).map((piece) => copyKey("stage", piece.id));
  };
  // The frame a frame would go into if let go with its middle at (x, y): the one drawn last that holds the point, never itself or what is in it.
  const frameTarget = (id: string, x: number, y: number) => {
    const own = new Set([id, ...framesIn(id)]);
    return [...shapes].reverse().find((one) => !one.shape && !own.has(one.id) && x >= one.x && x <= one.x + one.width && y >= one.y && y <= one.y + one.height)?.id;
  };
  // Moves things by amounts, as dragging does: a piece or screen by its offset, a frame (`frame:` and its id) with everything in it.
  const moveBy = (by: Record<string, { dx: number; dy: number }>) => {
    const offsetBy: Record<string, { x: number; y: number }> = {};
    const frameBy: Record<string, { dx: number; dy: number }> = {};
    for (const [id, move] of Object.entries(by)) {
      if (!move.dx && !move.dy) continue;
      if (id.startsWith("frame:")) {
        const frameId = id.slice(6);
        for (const one of [frameId, ...framesIn(frameId)]) frameBy[one] = move;
        for (const key of childrenOf(frameId)) offsetBy[key] = { x: move.dx, y: move.dy };
      } else offsetBy[id] = { x: move.dx, y: move.dy };
    }
    setOffsets((now) => ({ ...now, ...Object.fromEntries(Object.entries(offsetBy).map(([key, move]) => [key, { x: (now[key]?.x ?? 0) + move.x, y: (now[key]?.y ?? 0) + move.y }])) }));
    setShapes((now) => now.map((one) => (frameBy[one.id] ? { ...one, x: one.x + frameBy[one.id].dx, y: one.y + frameBy[one.id].dy } : one)));
  };
  // Lines up what is selected (with the box all of it makes, or with the frame a single layer is in) and spreads three or more evenly. Moving is as dragging
  // would be: a frame takes what is in it along.
  const alignSelected = (mode: AlignMode) => {
    type Item = { id: string; x: number; y: number; width: number; height: number };
    const held = new Set(bunch.frames);
    const inHeld = (key: string) => {
      for (let up = pieceByKey(key)?.parent; up; up = shapes.find((one) => one.id === up)?.parent) if (held.has(up)) return true;
      return false;
    };
    const ofFrame = (one: CanvasFrame): Item => ({ id: `frame:${one.id}`, x: one.x, y: one.y, width: one.width, height: one.height });
    const ofKey = (key: string): Item => ({ id: key, x: at(key).x, y: at(key).y, width: widthOf(key), height: heightOf(key) });
    let items: Item[];
    let bounds: Item | null = null;
    if (bunch.copies.length + bunch.frames.length > 1) {
      items = [...bunch.copies.filter((key) => copyOf.has(key) && !inHeld(key)).map(ofKey), ...shapes.filter((one) => held.has(one.id) && !(one.parent && held.has(one.parent))).map(ofFrame)];
    } else {
      const frame = shape ? shapes.find((one) => one.id === shape) : undefined;
      const key = !frame && selected && isPiece(selected) ? selected : undefined;
      const parent = shapes.find((one) => one.id === (frame ? frame.parent : key ? pieceByKey(key)?.parent : undefined));
      if (!parent || (!frame && !key)) return;
      bounds = ofFrame(parent);
      items = [frame ? ofFrame(frame) : ofKey(key!)];
    }
    if (!items.length) return;
    const left = bounds?.x ?? Math.min(...items.map((one) => one.x));
    const top = bounds?.y ?? Math.min(...items.map((one) => one.y));
    const right = bounds ? bounds.x + bounds.width : Math.max(...items.map((one) => one.x + one.width));
    const bottom = bounds ? bounds.y + bounds.height : Math.max(...items.map((one) => one.y + one.height));
    const by: Record<string, { dx: number; dy: number }> = {};
    if (mode === "spreadX" || mode === "spreadY") {
      if (items.length < 3) return;
      const x = mode === "spreadX";
      const sorted = [...items].sort((a, b) => (x ? a.x - b.x : a.y - b.y));
      const size = (one: Item) => (x ? one.width : one.height);
      const first = x ? sorted[0].x : sorted[0].y;
      const last = x ? sorted[sorted.length - 1].x + sorted[sorted.length - 1].width : sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
      const gap = (last - first - sorted.reduce((sum, one) => sum + size(one), 0)) / (sorted.length - 1);
      let cursor = first;
      for (const one of sorted) {
        by[one.id] = x ? { dx: cursor - one.x, dy: 0 } : { dx: 0, dy: cursor - one.y };
        cursor += size(one) + gap;
      }
    } else {
      for (const one of items) {
        by[one.id] = {
          dx: mode === "left" ? left - one.x : mode === "right" ? right - (one.x + one.width) : mode === "centerX" ? (left + right) / 2 - (one.x + one.width / 2) : 0,
          dy: mode === "top" ? top - one.y : mode === "bottom" ? bottom - (one.y + one.height) : mode === "middle" ? (top + bottom) / 2 - (one.y + one.height / 2) : 0,
        };
      }
    }
    moveBy(by);
  };
  // The arrow keys move what is selected (a frame takes what is in it): by a pixel, or by eight with Shift held. Not what is locked.
  const nudge = (dx: number, dy: number) => {
    const together = bunchNow.current;
    const many = together.copies.length + together.frames.length > 0;
    const chosen = many ? together.frames : shapeNow.current ? [shapeNow.current] : [];
    const top = chosen.filter((id) => !chosen.some((other) => other !== id && framesIn(other).includes(id)) && !frameState(id, "locked"));
    const inside = new Set(top.flatMap((id) => childrenOf(id)));
    const keys = (many ? together.copies : selectedNow.current ? [selectedNow.current] : []).filter((key) => copyOf.has(key) && !inside.has(key) && !stateOfKey(key, "locked"));
    if (!keys.length && !top.length) return false;
    moveBy({ ...Object.fromEntries(keys.map((key) => [key, { dx, dy }])), ...Object.fromEntries(top.map((id) => [`frame:${id}`, { dx, dy }])) });
    return true;
  };
  const nudgeNow = useRef(nudge);
  useEffect(() => {
    nudgeNow.current = nudge;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.code];
      const target = event.target as HTMLElement | null;
      if (!step || event.metaKey || event.ctrlKey || event.altKey || viewOnly || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || box.current?.closest("[inert]")) return;
      // What is picked inside a screen is being edited: the arrow keys are not for moving the screen then.
      if (pickingNow.current?.target) return;
      const by = (event.shiftKey ? 8 : 1) * SCREEN_SCALE;
      if (nudgeNow.current(step[0] * by, step[1] * by)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewOnly]);
  // Hidden and locked: a frame's setting reaches what is in it.
  const frameState = (id: string | undefined, what: "hidden" | "locked"): boolean => {
    const one = id ? shapes.find((item) => item.id === id) : undefined;
    return !!one && (!!one[what] || frameState(one.parent, what));
  };
  const pieceByKey = (key: string) => pieces.find((piece) => copyKey("stage", piece.id) === key);
  const stateOfKey = (key: string, what: "hidden" | "locked") => {
    const piece = pieceByKey(key);
    return !!piece && (!!piece[what] || frameState(piece.parent, what));
  };
  const [renaming, setRenaming] = useState<string | null>(null);
  const renameLayer = (id: string, name: string) => {
    if (shapes.some((one) => one.id === id)) setShapes((now) => now.map((one) => (one.id === id ? { ...one, name } : one)));
    else setPieces((now) => now.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, label: name } : piece)));
  };
  const toggleLayer = (row: LayerRow, what: "hidden" | "locked") => {
    if (row.kind === "frame") setShapes((now) => now.map((one) => (one.id === row.id ? { ...one, [what]: !one[what] } : one)));
    else setPieces((now) => now.map((piece) => (copyKey("stage", piece.id) === row.id ? { ...piece, [what]: !piece[what] } : piece)));
  };
  // Dragged in the layers: into a frame, or above or below another layer in the frame that one is in. What is drawn later is on top, and the list shows the top first.
  const moveLayer = (drag: LayerRow, target: LayerRow, where: "before" | "after" | "into") => {
    const targetFrame = shapes.find((one) => one.id === target.id);
    const targetPiece = pieceByKey(target.id);
    if (where === "into" && !targetFrame) return;
    const parent = where === "into" ? targetFrame!.id : targetFrame ? targetFrame.parent : targetPiece?.parent;
    if (drag.kind === "frame") {
      if (drag.id === target.id || parent === drag.id || (parent && framesIn(drag.id).includes(parent))) return;
      const moving = new Set([drag.id, ...framesIn(drag.id)]);
      setShapes((now) => {
        const group = now.filter((one) => moving.has(one.id)).map((one) => (one.id === drag.id ? { ...one, parent } : one));
        const rest = now.filter((one) => !moving.has(one.id));
        const near = targetFrame && where !== "into" ? rest.findIndex((one) => one.id === target.id) : -1;
        const at = near < 0 ? rest.length : where === "before" ? near + 1 : near;
        return [...rest.slice(0, at), ...group, ...rest.slice(at)];
      });
      return;
    }
    setPieces((now) => {
      const one = now.find((piece) => copyKey("stage", piece.id) === drag.id);
      if (!one || drag.id === target.id) return now;
      const rest = now.filter((piece) => piece !== one);
      const near = targetPiece && where !== "into" ? rest.findIndex((piece) => piece === targetPiece) : -1;
      const at = near < 0 ? rest.length : where === "before" ? near + 1 : near;
      return [...rest.slice(0, at), { ...one, parent }, ...rest.slice(at)];
    });
  };
  // The frame that would take what is being dragged, outlined so it can be seen.
  const [dropInto, setDropInto] = useState<string | null>(null);
  const aimAt = (target: string | undefined) => setDropInto((now) => (now === (target ?? null) ? now : (target ?? null)));
  const updateFrame = (id: string, patch: Partial<CanvasFrame>) => {
    const was = shapes.find((one) => one.id === id);
    if (!was) return;
    const dx = (patch.x ?? was.x) - was.x;
    const dy = (patch.y ?? was.y) - was.y;
    if (dx || dy) {
      const inside = childrenOf(id);
      setOffsets((now) => ({ ...now, ...Object.fromEntries(inside.map((key) => [key, { x: (now[key]?.x ?? 0) + dx, y: (now[key]?.y ?? 0) + dy }])) }));
    }
    const nested = new Set(dx || dy ? framesIn(id) : []);
    setShapes((now) => now.map((one) => (one.id === id ? { ...one, ...patch } : nested.has(one.id) ? { ...one, x: one.x + dx, y: one.y + dy } : one)));
  };
  const removeFrame = (id: string) => {
    const inside = new Set(childrenOf(id));
    const gone = new Set([id, ...framesIn(id)]);
    setPieces((now) => now.filter((piece) => !piece.parent || !gone.has(piece.parent)));
    setOffsets((now) => Object.fromEntries(Object.entries(now).filter(([key]) => !inside.has(key))));
    setShapes((now) => now.filter((one) => !gone.has(one.id)));
    setShape(null);
  };
  // The frame a point is in, the one drawn last where several overlap; what is put down there belongs to it.
  const frameAt = (x: number, y: number) => [...shapes].reverse().find((one) => !one.shape && x >= one.x && x <= one.x + one.width && y >= one.y && y <= one.y + one.height)?.id;
  // Copying, cutting, pasting and duplicating what is on the canvas: placed components, text and images, and frames with what is in them.
  // The prototype's own screens stay as they are.
  const held = useRef<{ pieces: { piece: Piece; offset: { x: number; y: number } }[]; frames: CanvasFrame[] } | null>(null);
  const pastes = useRef(0);
  type Chosen = { keys: string[]; frames: string[] };
  /** What is selected that can be copied: the group, the frame, or the piece. */
  const selectedPieces = (): Chosen => {
    const keys = new Set<string>();
    const frames = new Set<string>();
    if (bunch.copies.length || bunch.frames.length) {
      bunch.copies.filter(isPiece).forEach((key) => keys.add(key));
      bunch.frames.forEach((id) => frames.add(id));
    } else if (shape) frames.add(shape);
    else if (selected && isPiece(selected)) keys.add(selected);
    for (const id of [...frames]) framesIn(id).forEach((nested) => frames.add(nested));
    for (const id of frames) childrenOf(id).forEach((key) => keys.add(key));
    return { keys: [...keys], frames: [...frames] };
  };
  const readHeld = (sel: Chosen) => ({
    pieces: pieces.filter((piece) => sel.keys.includes(copyKey("stage", piece.id))).map((piece) => ({ piece, offset: offsets[copyKey("stage", piece.id)] ?? { x: 0, y: 0 } })),
    frames: shapes.filter((one) => sel.frames.includes(one.id)),
  });
  const rand = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  /** Puts a copy of what was read down, `dx` and `dy` along; with `rehome`, what is not in a frame of its own goes into the frame it lands over. Returns what the copies are. */
  const spawn = (data: NonNullable<typeof held.current>, dx: number, dy: number, rehome: boolean) => {
    const frameIds = new Map(data.frames.map((one) => [one.id, rand("frame")]));
    const madeFrames = data.frames.map((one) => ({ ...one, id: frameIds.get(one.id)!, parent: one.parent && frameIds.has(one.parent) ? frameIds.get(one.parent) : rehome ? undefined : one.parent, x: one.x + dx, y: one.y + dy }));
    const made = data.pieces.map(({ piece, offset }) => {
      const spot = { x: offset.x + dx, y: offset.y + dy };
      const inOwn = piece.parent ? frameIds.get(piece.parent) : undefined;
      const parent = inOwn ?? (rehome ? frameAt(spot.x + (piece.width * SCREEN_SCALE) / 2, spot.y + LABEL_HEIGHT + (piece.height * SCREEN_SCALE) / 2) : piece.parent);
      return { piece: { ...piece, id: rand("piece"), props: { ...piece.props }, parent }, spot, own: !!inOwn };
    });
    setPieces((now) => [...now, ...made.map((one) => one.piece)]);
    setOffsets((now) => ({ ...now, ...Object.fromEntries(made.map((one) => [copyKey("stage", one.piece.id), one.spot])) }));
    setShapes((now) => [...now, ...madeFrames]);
    return { loose: made.filter((one) => !one.own).map((one) => copyKey("stage", one.piece.id)), frames: data.frames.flatMap((one, at) => (one.parent && frameIds.has(one.parent) ? [] : [madeFrames[at].id])) };
  };
  /** A copy left where the original is, for when the original is dragged away with Alt held. */
  const leaveCopy = (sel: Chosen) => {
    if (sel.keys.length || sel.frames.length) spawn(readHeld(sel), 0, 0, false);
  };
  const copyChosen = () => {
    const sel = selectedPieces();
    if (!sel.keys.length && !sel.frames.length) return null;
    held.current = readHeld(sel);
    pastes.current = 0;
    // The system clipboard stops holding a fill that was copied before, so ⌘V puts down what was copied last.
    void navigator.clipboard?.writeText("studio layers").catch(() => {});
    return sel;
  };
  const cutChosen = () => {
    const sel = copyChosen();
    if (!sel) return false;
    deleteGroupNow.current({ copies: sel.keys, frames: sel.frames });
    setSelected(null);
    setShape(null);
    return true;
  };
  const pasteHeld = () => {
    const data = held.current;
    if (!data) return false;
    // Each paste lands a little further along, so copies don't sit unseen on each other.
    pastes.current += 1;
    const step = 16 * pastes.current;
    const made = spawn(data, step, step, true);
    if (pickingNow.current?.target) pickingNow.current.onPick(null, null);
    letGoInspect.current();
    if (made.frames.length === 1 && !made.loose.length) {
      setBunch({ copies: [], frames: [] });
      setSelected(null);
      setShape(made.frames[0]);
    } else if (made.loose.length === 1 && !made.frames.length) {
      setBunch({ copies: [], frames: [] });
      setShape(null);
      setSelected(made.loose[0]);
    } else {
      setShape(null);
      setSelected(null);
      setBunch({ copies: made.loose, frames: made.frames });
    }
    return true;
  };
  const clipNow = useRef({ copy: copyChosen, cut: cutChosen, paste: pasteHeld });
  useEffect(() => {
    clipNow.current = { copy: copyChosen, cut: cutChosen, paste: pasteHeld };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || viewOnly) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || box.current?.closest("[inert]")) return;
      if (event.code === "KeyC" && clipNow.current.copy()) event.preventDefault();
      else if (event.code === "KeyX" && clipNow.current.cut()) event.preventDefault();
      else if (event.code === "KeyV" && clipNow.current.paste()) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewOnly]);
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
      reset: () => size && zoomAt(size.width / 2, size.height / 2, 1 / SCREEN_SCALE / camera.target.scale, true),
      fit: () => {
        if (!size) return;
        touch(false);
        camera.set(fitted(size), { glide: revealed });
      },
    };
  });
  // ⌘0 is 100%, ⌘+ and ⌘− step in and out: the same as the menu, in place of the browser's own page zoom while the canvas is open.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || box.current?.closest("[inert]")) return;
      const move = event.code === "Digit0" || event.code === "Numpad0" ? "reset" : ["Equal", "NumpadAdd"].includes(event.code) ? "zoomIn" : ["Minus", "NumpadSubtract"].includes(event.code) ? "zoomOut" : null;
      if (!move) return;
      event.preventDefault();
      zoomControls.current[move]();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);
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
    const alone = !bunch.copies.includes(id);
    const dup = event.altKey && !viewOnly && (alone ? isPiece(id) : true) ? (alone ? { keys: [id], frames: [] } : selectedPieces()) : undefined;
    drag.current = { x: event.clientX, y: event.clientY, from: camera.target, moved: false, pan: false, screen: id, origin: offsets[id] ?? { x: 0, y: 0 }, group: alone ? undefined : groupBase(), dup };
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
    const stage = frames.current.get(id)?.contentDocument?.querySelector("[data-stage]");
    const rect = stage?.getBoundingClientRect();
    if (!stage || !rect) return;
    // What is inside counts too: a fixed or absolute element (a site header) takes no room in the stage, but is as big as it is where it sits.
    let [right, bottom] = [rect.right, rect.bottom];
    for (const inner of stage.querySelectorAll("*")) {
      const box = inner.getBoundingClientRect();
      if (box.width && box.height) [right, bottom] = [Math.max(right, box.right), Math.max(bottom, box.bottom)];
    }
    const [wide, tall] = [Math.min(right - rect.left, 4000), Math.min(bottom - rect.top, 4000)];
    if (!wide || !tall) return;
    const width = Math.ceil(wide);
    const height = Math.ceil(tall);
    setPieces((was) => was.map((piece) => (copyKey("stage", piece.id) === id && (piece.width !== width || piece.height !== height) ? { ...piece, width, height } : piece)));
  };
  // A component dragged out of the panel is let go of on the canvas: it becomes a screen there, centred on the pointer, and is kept.
  const dropping = (event: React.DragEvent) => event.dataTransfer.types.includes(COMPONENT_DRAG_TYPE) || (!viewOnly && event.dataTransfer.types.includes("Files"));
  const drop = (event: React.DragEvent) => {
    if (!dropping(event) || !box.current) return;
    event.preventDefault();
    // A picture from disk dropped on the canvas is put down where it lands.
    const picture = [...event.dataTransfer.files].find((one) => one.type.startsWith("image/"));
    if (picture) return void addImage(picture, { x: event.clientX, y: event.clientY });
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
    const piece: Piece = { id: `piece-${Math.random().toString(36).slice(2, 8)}`, parent: frameAt(world.x, world.y), story: item.id, label: item.label ?? "Component", component: item.label, props: {}, // A component with no picture has no size on record: it starts desktop-wide (a section or a header needs the room) and takes its own size once drawn.
      width: item.width ? Math.max(Math.round(item.width), 80) : 1024, height: item.height ? Math.max(Math.round(item.height), 48) : 200 };
    const id = copyKey("stage", piece.id);
    setOffsets((was) => ({ ...was, [id]: { x: world.x - (piece.width * SCREEN_SCALE) / 2, y: world.y - (piece.height * SCREEN_SCALE) / 2 - LABEL_HEIGHT } }));
    setPieces((was) => [...was, piece]);
    setSelected(id);
  };

  // Group (⌥⌘G) and Auto layout (⇧A): what is selected goes into a new frame, round it. Auto layout also reads how those things are
  // arranged (side by side or stacked, how far apart, how they line up) and keeps them that way. Components, texts and images for now.
  // What a group or an auto layout is made of: the selected pieces and frames (not those already inside a selected frame, which go with it).
  const layersSelected = () => {
    const now = bunchNow.current;
    const many = now.copies.length || now.frames.length;
    const chosen = many ? now.frames : shapeNow.current ? [shapeNow.current] : [];
    const frames = chosen.filter((id) => !chosen.some((other) => other !== id && framesIn(other).includes(id)));
    const inside = new Set(frames.flatMap((id) => childrenOf(id)));
    const keys = (many ? now.copies : selectedNow.current ? [selectedNow.current] : []).filter((key) => isPiece(key) && copyOf.has(key) && !inside.has(key));
    return { keys, frames };
  };
  const realBox = (key: string) => ({ id: key, x: at(key).x / SCREEN_SCALE, y: at(key).y / SCREEN_SCALE, width: widthOf(key) / SCREEN_SCALE, height: heightOf(key) / SCREEN_SCALE });
  const wrap = (withLayout: boolean) => {
    const { keys, frames: held } = layersSelected();
    if ((!keys.length && !held.length) || viewOnly) return;
    const framed = shapes.filter((one) => held.includes(one.id));
    const boxes = [...keys.map((key) => ({ id: key, x: at(key).x, y: at(key).y, width: widthOf(key), height: heightOf(key) })), ...framed.map((one) => ({ id: `frame:${one.id}`, x: one.x, y: one.y, width: one.width, height: one.height }))];
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const id = `frame-${Math.random().toString(36).slice(2, 8)}`;
    const layout = withLayout ? detectLayout(boxes.map((box) => ({ ...box, x: box.x / SCREEN_SCALE, y: box.y / SCREEN_SCALE, width: box.width / SCREEN_SCALE, height: box.height / SCREEN_SCALE }))) : undefined;
    // The new frame goes where they were: in the frame they all share, when they do.
    const homes = new Set([...keys.map((key) => pieceByKey(key)?.parent), ...framed.map((one) => one.parent)]);
    const parent = homes.size === 1 ? [...homes][0] : undefined;
    const carried = new Set(held.flatMap((one) => [one, ...framesIn(one)]));
    setShapes((was) => [
      ...was.filter((one) => !carried.has(one.id)),
      { id, parent, name: withLayout ? "Auto layout" : "Group", x: left, y: top, width: right - left, height: bottom - top, fill: "transparent", layout },
      // What went in is drawn above it.
      ...was.filter((one) => carried.has(one.id)).map((one) => (held.includes(one.id) ? { ...one, parent: id } : one)),
    ]);
    setPieces((was) => was.map((piece) => (keys.includes(copyKey("stage", piece.id)) ? { ...piece, parent: id } : piece)));
    setBunch({ copies: [], frames: [] });
    setSelected(null);
    setShape(id);
    setMenu(null);
  };
  const wrapNow = useRef(wrap);
  useEffect(() => {
    wrapNow.current = wrap;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || box.current?.closest("[inert]") || event.repeat) return;
      if (event.code === "KeyG" && event.altKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        wrapNow.current(false);
      } else if (event.code === "KeyA" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        wrapNow.current(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // The menu under the right button: on what is pressed, which is selected first unless it is already part of the selection.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openMenu = (event: React.MouseEvent, on: { copy?: string; frame?: string }) => {
    event.preventDefault();
    event.stopPropagation();
    if (viewOnly) return;
    const now = bunchNow.current;
    if (!(on.copy && now.copies.includes(on.copy)) && !(on.frame && now.frames.includes(on.frame))) {
      setBunch({ copies: [], frames: [] });
      setSelected(on.copy ?? null);
      setShape(on.frame ?? null);
    }
    const rect = box.current!.getBoundingClientRect();
    setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  useEffect(() => {
    if (!menu) return undefined;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target as Element).closest("[data-menu]")) setMenu(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [menu]);
  // A frame with a layout keeps what is in it laid out: in the order it sits in, spaced and lined up as the layout says, and the
  // frame as big as that. Not while something is being dragged (it follows the pointer), and again when it is let go.
  const holdLayout = useRef(false);
  // Each pinned layer's distances to its frame's edges, and the frame as it was when they were read; what it was last sent to, until it gets there.
  const pinMemo = useRef(new Map<string, { parent: { x: number; y: number; width: number; height: number }; left: number; right: number; top: number; bottom: number; cx: number; cy: number; sent?: { x: number; y: number; width: number; height: number; at: number } }>());
  const [, setSettle] = useState(0);
  const [pagesSeen, setPagesSeen] = useState(0);
  // How a frame is sized along each side: its own number, or hugging what is in it. A frame with a layout hugs unless it was given a size.
  const frameMode = (frame: CanvasFrame, side: "width" | "height") => frame.sizing?.[side] ?? (frame.layout ? "hug" : "fixed");
  useEffect(() => {
    if (holdLayout.current) return undefined;
    const moves: Record<string, { x: number; y: number }> = {};
    const shifts: Record<string, { dx: number; dy: number }> = {};
    const frames: Record<string, Partial<Area>> = {};
    const sized: Record<string, { width?: number; height?: number }> = {};
    // What is laid out in a frame is its pieces and the frames directly in it. A frame is looked at after the one it is in: if that moved or sized
    // anything this time, what is inside waits for the next, when it is where it will stay.
    const depth = (frame: CanvasFrame) => {
      let at = 0;
      for (let up = frame.parent; up; up = shapes.find((one) => one.id === up)?.parent) at++;
      return at;
    };
    const touched = new Set<string>();
    const waiting = (frame: CanvasFrame) => {
      for (let up = frame.parent; up; up = shapes.find((one) => one.id === up)?.parent) if (touched.has(up)) return true;
      return false;
    };
    for (const frame of [...shapes].sort((a, b) => depth(a) - depth(b))) {
      if (waiting(frame)) continue;
      const hugW = frameMode(frame, "width") === "hug";
      const hugH = frameMode(frame, "height") === "hug";
      const mine = pieces.filter((piece) => piece.parent === frame.id && copyOf.has(copyKey("stage", piece.id)));
      const inside = shapes.filter((one) => one.parent === frame.id);
      if (!mine.length && !inside.length) continue;
      let patch: Partial<Area> = {};
      if (frame.layout) {
        const layout = frame.layout;
        const row = layout.direction === "row";
        const pad = paddingOf(layout);
        const [mainHug, crossHug] = row ? [hugW, hugH] : [hugH, hugW];
        const [padMain, padCross] = row ? [pad.x, pad.y] : [pad.y, pad.x];
        const [along, across] = row ? (["width", "height"] as const) : (["height", "width"] as const);
        type Item = { id: string; box: { id: string; x: number; y: number; width: number; height: number }; fill: { width: boolean; height: boolean }; sizable: "both" | "width" | "none"; frame?: CanvasFrame };
        const items: Item[] = [
          ...mine.map((piece): Item => {
            const key = copyKey("stage", piece.id);
            return { id: key, box: realBox(key), fill: { width: piece.sizing?.width === "fill", height: piece.sizing?.height === "fill" }, sizable: piece.kind === "text" ? "width" : "both" };
          }),
          ...inside.map((one): Item => ({ id: `frame:${one.id}`, box: { id: `frame:${one.id}`, x: one.x / SCREEN_SCALE, y: one.y / SCREEN_SCALE, width: one.width / SCREEN_SCALE, height: one.height / SCREEN_SCALE }, fill: { width: one.sizing?.width === "fill", height: one.sizing?.height === "fill" }, sizable: "both", frame: one })),
        ];
        const innerMain = (row ? frame.width : frame.height) / SCREEN_SCALE - padMain * 2;
        const innerCross = (row ? frame.height : frame.width) / SCREEN_SCALE - padCross * 2;
        // What fills takes what the rest leaves (shared evenly along the layout, all of it across it); where the frame hugs that side there is nothing to fill.
        const fillsMain = items.filter((item) => !mainHug && item.fill[along] && (item.sizable === "both" || (item.sizable === "width" && along === "width")));
        const taken = items.filter((item) => !fillsMain.includes(item)).reduce((sum, item) => sum + item.box[along], 0) + layout.gap * (items.length - 1);
        const share = fillsMain.length ? Math.max(8, (innerMain - taken) / fillsMain.length) : 0;
        for (const item of items) {
          const want: { width?: number; height?: number } = {};
          if (fillsMain.includes(item)) want[along] = share;
          if (!crossHug && item.fill[across] && (item.sizable === "both" || (item.sizable === "width" && across === "width"))) want[across] = Math.max(8, innerCross);
          for (const side of ["width", "height"] as const) {
            const next = want[side];
            if (next === undefined || Math.abs(next - item.box[side]) <= 0.5) continue;
            item.box[side] = next;
            if (item.frame) frames[item.frame.id] = { ...frames[item.frame.id], [side]: next * SCREEN_SCALE };
            else sized[item.id] = { ...sized[item.id], [side]: next };
            touched.add(frame.id);
          }
        }
        const result = flowLayout(items.map((item) => item.box), layout, { cross: crossHug ? 0 : innerCross, main: mainHug ? undefined : innerMain });
        for (const item of items) {
          const to = { x: frame.x + result.positions[item.id].x * SCREEN_SCALE, y: frame.y + result.positions[item.id].y * SCREEN_SCALE };
          if (item.frame) {
            const [dx, dy] = [to.x - item.frame.x, to.y - item.frame.y];
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
              shifts[item.frame.id] = { dx, dy };
              touched.add(frame.id);
            }
          } else {
            const now = at(item.id);
            if (Math.abs(to.x - now.x) > 0.5 || Math.abs(to.y - now.y) > 0.5) {
              moves[item.id] = { x: (offsets[item.id]?.x ?? 0) + to.x - now.x, y: (offsets[item.id]?.y ?? 0) + to.y - now.y };
              touched.add(frame.id);
            }
          }
        }
        const [width, height] = [result.width * SCREEN_SCALE, result.height * SCREEN_SCALE];
        if (hugW && Math.abs(width - frame.width) > 0.5) patch.width = width;
        if (hugH && Math.abs(height - frame.height) > 0.5) patch.height = height;
      } else if (hugW || hugH) {
        // No layout: it is drawn tight round what is in it, where that is.
        const boxes = [...mine.map((piece) => ({ x: at(copyKey("stage", piece.id)).x, y: at(copyKey("stage", piece.id)).y, width: widthOf(copyKey("stage", piece.id)), height: heightOf(copyKey("stage", piece.id)) })), ...inside];
        const [left, top] = [Math.min(...boxes.map((box) => box.x)), Math.min(...boxes.map((box) => box.y))];
        const [right, bottom] = [Math.max(...boxes.map((box) => box.x + box.width)), Math.max(...boxes.map((box) => box.y + box.height))];
        if (hugW && (Math.abs(left - frame.x) > 0.5 || Math.abs(right - left - frame.width) > 0.5)) patch = { ...patch, x: left, width: right - left };
        if (hugH && (Math.abs(top - frame.y) > 0.5 || Math.abs(bottom - top - frame.height) > 0.5)) patch = { ...patch, y: top, height: bottom - top };
      }
      // Pinned layers in a frame with no layout: where the frame has just been resized they follow it by their pins, and otherwise their distances to its edges are re-read from where they are
      // (so moving one by hand is what sets them). A layer is looked at again only once it has got where it was sent.
      if (!frame.layout) {
        const parentBox = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
        type Child = { id: string; pin: NonNullable<CanvasFrame["pin"]>; box: { x: number; y: number; width: number; height: number }; piece?: Piece; frame?: CanvasFrame };
        const children: Child[] = [
          ...mine.filter((piece) => piece.pin).map((piece): Child => ({ id: copyKey("stage", piece.id), pin: piece.pin!, box: { x: at(copyKey("stage", piece.id)).x, y: at(copyKey("stage", piece.id)).y, width: widthOf(copyKey("stage", piece.id)), height: heightOf(copyKey("stage", piece.id)) }, piece })),
          ...inside.filter((one) => one.pin).map((one): Child => ({ id: `frame:${one.id}`, pin: one.pin!, box: { x: one.x, y: one.y, width: one.width, height: one.height }, frame: one })),
        ];
        for (const child of children) {
          const memo = pinMemo.current.get(child.id);
          const [px, py, pw, ph] = [parentBox.x, parentBox.y, parentBox.width, parentBox.height];
          const grew = !memo || Math.abs(memo.parent.width - pw) > 0.5 || Math.abs(memo.parent.height - ph) > 0.5;
          const waitingOn = memo?.sent && performance.now() - memo.sent.at < 300 && (Math.abs(child.box.x - memo.sent.x) > 0.5 || Math.abs(child.box.y - memo.sent.y) > 0.5 || Math.abs(child.box.width - memo.sent.width) > 0.5 || Math.abs(child.box.height - memo.sent.height) > 0.5);
          if (waitingOn) continue;
          if (!memo || !grew) {
            // Not resized: where it is now is where it is pinned.
            pinMemo.current.set(child.id, { parent: parentBox, left: child.box.x - px, right: px + pw - (child.box.x + child.box.width), top: child.box.y - py, bottom: py + ph - (child.box.y + child.box.height), cx: child.box.x + child.box.width / 2 - (px + pw / 2), cy: child.box.y + child.box.height / 2 - (py + ph / 2) });
            continue;
          }
          const next = { ...child.box };
          const stretch: { width?: number; height?: number } = {};
          if (!hugW && child.pin.x) {
            if (child.pin.x === "start") next.x = px + memo.left;
            else if (child.pin.x === "end") next.x = px + pw - memo.right - child.box.width;
            else if (child.pin.x === "center") next.x = px + pw / 2 + memo.cx - child.box.width / 2;
            else {
              next.x = px + memo.left;
              next.width = Math.max(MIN_SIZE, pw - memo.left - memo.right);
              stretch.width = next.width;
            }
          }
          if (!hugH && child.pin.y) {
            if (child.pin.y === "start") next.y = py + memo.top;
            else if (child.pin.y === "end") next.y = py + ph - memo.bottom - child.box.height;
            else if (child.pin.y === "center") next.y = py + ph / 2 + memo.cy - child.box.height / 2;
            else if (child.piece?.kind !== "text") {
              next.y = py + memo.top;
              next.height = Math.max(MIN_SIZE, ph - memo.top - memo.bottom);
              stretch.height = next.height;
            }
          }
          pinMemo.current.set(child.id, { ...memo, parent: parentBox, sent: { ...next, at: performance.now() } });
          const [dx, dy] = [next.x - child.box.x, next.y - child.box.y];
          if (child.frame) {
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) shifts[child.frame.id] = { dx, dy };
            if (stretch.width !== undefined || stretch.height !== undefined) frames[child.frame.id] = { ...frames[child.frame.id], ...stretch };
          } else {
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moves[child.id] = { x: (offsets[child.id]?.x ?? 0) + dx, y: (offsets[child.id]?.y ?? 0) + dy };
            if (stretch.width !== undefined || stretch.height !== undefined) sized[child.id] = { width: stretch.width !== undefined ? stretch.width / SCREEN_SCALE : undefined, height: stretch.height !== undefined ? stretch.height / SCREEN_SCALE : undefined };
          }
          touched.add(frame.id);
        }
      }
      if (Object.keys(patch).length) frames[frame.id] = { ...frames[frame.id], ...patch };
    }
    if (!Object.keys(moves).length && !Object.keys(frames).length && !Object.keys(sized).length && !Object.keys(shifts).length) return undefined;
    // On the next frame, so a render never sets what it is drawn from.
    const frame = requestAnimationFrame(() => {
      // A frame carried along carries what is in it, however deep.
      const carried: Record<string, { x: number; y: number }> = {};
      const carriedFrames: Record<string, { dx: number; dy: number }> = {};
      for (const [id, shift] of Object.entries(shifts)) {
        carriedFrames[id] = shift;
        for (const nested of framesIn(id)) carriedFrames[nested] = shift;
        for (const key of childrenOf(id)) carried[key] = { x: shift.dx, y: shift.dy };
      }
      if (Object.keys(moves).length || Object.keys(carried).length) setOffsets((now) => ({ ...now, ...moves, ...Object.fromEntries(Object.entries(carried).map(([key, by]) => [key, { x: (now[key]?.x ?? 0) + by.x, y: (now[key]?.y ?? 0) + by.y }])) }));
      if (Object.keys(frames).length || Object.keys(carriedFrames).length) setShapes((now) => now.map((one) => ({ ...one, ...(carriedFrames[one.id] ? { x: one.x + carriedFrames[one.id].dx, y: one.y + carriedFrames[one.id].dy } : {}), ...(frames[one.id] ?? {}) })));
      if (Object.keys(sized).length) {
        setPieces((now) =>
          now.map((piece) => {
            const key = copyKey("stage", piece.id);
            const change = sized[key];
            if (!change) return piece;
            const width = change.width !== undefined ? Math.round(change.width) : piece.width;
            const height = change.height !== undefined ? Math.round(change.height) : piece.height;
            if (piece.kind === "text") return { ...piece, width, props: { ...piece.props, w: width } };
            // A component's size is not a prop of it: it is put on the component where it is drawn.
            if (!piece.kind) return { ...piece, width, height, fixedWidth: change.width !== undefined ? width : piece.fixedWidth, fixedHeight: change.height !== undefined ? height : piece.fixedHeight };
            return { ...piece, width, height, props: { ...piece.props, w: width, h: height } };
          }),
        );
        for (const [key, change] of Object.entries(sized)) {
          if (change.width !== undefined && pieceByKey(key)?.kind === "text") fitText(key, Math.round(change.width));
          else if (!pieceByKey(key)?.kind) fitComponent(key, change.width !== undefined ? Math.round(change.width) : undefined, change.height !== undefined ? Math.round(change.height) : undefined);
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  // The layers: frames with what is in them, then what is on its own, then the prototype's screens. Folded frames are kept here.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // A screen's elements, and each of them, are folded until opened (or until one in them is selected).
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const layerRows = (): LayerRow[] => {
    const rows: LayerRow[] = [];
    const frameIds = new Set(shapes.map((one) => one.id));
    const pieceRow = (piece: Piece, depth: number): LayerRow => {
      const id = copyKey("stage", piece.id);
      const text = String(piece.props.text ?? "").replace(/\s+/g, " ").trim();
      return { id, kind: piece.kind ?? "component", name: piece.kind === "text" ? text || "Text" : piece.label, depth, own: true, hovered: hoverLayer === id, hidden: piece.hidden, locked: piece.locked, selected: selected === id || bunch.copies.includes(id) };
    };
    // Frames, with the frames and pieces in them beneath, however deep.
    const frameRows = (frame: CanvasFrame, depth: number) => {
      const kids = pieces.filter((piece) => piece.parent === frame.id && copyOf.has(copyKey("stage", piece.id))).reverse();
      const inner = shapes.filter((one) => one.parent === frame.id).reverse();
      const open = !folded.has(frame.id);
      rows.push({ id: frame.id, kind: "frame", shape: frame.shape, name: frame.name, depth, own: true, hovered: hoverShape === frame.id, hidden: frame.hidden, locked: frame.locked, expandable: kids.length + inner.length > 0, open, selected: shape === frame.id || bunch.frames.includes(frame.id) });
      if (!open) return;
      for (const one of inner) frameRows(one, depth + 1);
      for (const piece of kids) rows.push(pieceRow(piece, depth + 1));
    };
    for (const frame of [...shapes].reverse()) if (!frame.parent || !frameIds.has(frame.parent)) frameRows(frame, 0);
    for (const piece of [...pieces].reverse()) if ((!piece.parent || !frameIds.has(piece.parent)) && copyOf.has(copyKey("stage", piece.id))) rows.push(pieceRow(piece, 0));
    for (const one of kept) {
      if (isPiece(one.id) || !copyOf.has(one.id)) continue;
      const tree = trees[one.id];
      const pickedHere = picked?.copyId === one.id ? picked.part.selector : null;
      const pickedIx = tree && pickedHere ? tree.selector.indexOf(pickedHere) : -1;
      const open = unfolded.has(`screen:${one.id}`);
      rows.push({ id: one.id, kind: "screen", name: devices.length > 1 ? `${one.screen.name} · ${one.device.name}` : one.screen.name, depth: 0, expandable: true, open, selected: (selected === one.id || bunch.copies.includes(one.id)) && pickedIx < 0, device: one.device.id });
      const add = (ix: number, depth: number) => {
        if (!tree) return;
        const kids = childrenIn(tree, ix);
        const key = `${one.id}:${ix}`;
        const here = unfolded.has(`node:${one.id}:${tree.selector[ix]}`);
        rows.push({ id: key, kind: "node", name: tree.name[ix], depth, expandable: kids.length > 0, open: here, selected: ix === pickedIx, copy: one.id, ix });
        if (here) for (const kid of kids.slice(0, 200)) add(kid, depth + 1);
      };
      if (open && tree) for (const root of childrenIn(tree, -1)) add(root, 1);
    }
    // What is inside a selected layer is tinted too, more lightly, as part of the selection.
    let inside = -1;
    for (const row of rows) {
      if (inside >= 0 && row.depth > inside) row.within = true;
      else inside = row.selected ? row.depth : -1;
    }
    return rows;
  };
  const pageFor = (id: string) => {
    const frame = frames.current.get(id);
    return copyPages.current.get(id) ?? (frame ? pageOf(frame) : null);
  };
  // A selected component's own props (what it was drawn with, read from the page), so they can be changed from its panel.
  const [rootProps, setRootProps] = useState<{ id: string; name: string; values: Record<string, string | number | boolean> } | null>(null);
  const propsComponent = selected && isPiece(selected) && !picked && pieceByKey(selected) && !pieceByKey(selected)!.kind ? selected : null;
  const propsKey = JSON.stringify(pieceByKey(propsComponent ?? "")?.props ?? null);
  useEffect(() => {
    if (!propsComponent) return undefined;
    let stale = false;
    // A moment for the page to have drawn (it may have just loaded again with new props).
    const timer = window.setTimeout(async () => {
      const page = pageFor(propsComponent);
      const tree = await page?.tree();
      if (!page || !tree) return;
      for (let at = 0; at < Math.min(tree.selector.length, 8); at++) {
        const part = await page.partOf(tree.selector[at], pieceComponent(propsComponent));
        if (stale) return;
        if (part?.component) return setRootProps({ id: propsComponent, name: part.component.name, values: part.component.props });
      }
      setRootProps(null);
    }, 350);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsComponent, propsKey, pagesSeen]);
  // The layers' trees, read from each screen that is open (and again when a page loads or comes), one page at a time.
  const [trees, setTrees] = useState<Record<string, PageTree>>({});
  const openScreens = kept.filter((one) => !isPiece(one.id) && (unfolded.has(`screen:${one.id}`) || picked?.copyId === one.id)).map((one) => one.id).join(" ");
  useEffect(() => {
    let stale = false;
    const timers: number[] = [];
    // A live page may not be there yet: it is asked again a few times.
    const read = (id: string, tries: number) => {
      void pageFor(id)
        ?.tree()
        .then((tree) => {
          if (stale) return;
          if (tree?.parent.length) setTrees((now) => ({ ...now, [id]: tree }));
          else if (tries > 0) timers.push(window.setTimeout(() => read(id, tries - 1), 600));
        });
    };
    for (const id of openScreens ? openScreens.split(" ") : []) read(id, 8);
    return () => {
      stale = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openScreens, pagesSeen]);
  // An element picked on the canvas is shown: what leads to it is opened, once, and can be closed again by hand.
  const pickedSelector = picked?.part.selector;
  const pickedScreen = picked?.copyId;
  const pickedTree = pickedScreen ? trees[pickedScreen] : undefined;
  useEffect(() => {
    if (!pickedScreen || !pickedSelector || !pickedTree) return undefined;
    const frame = requestAnimationFrame(() => {
      const keys = [`screen:${pickedScreen}`];
      for (let at = pickedTree.parent[pickedTree.selector.indexOf(pickedSelector)]; at !== undefined && at >= 0; at = pickedTree.parent[at]) keys.push(`node:${pickedScreen}:${pickedTree.selector[at]}`);
      setUnfolded((now) => (keys.every((key) => now.has(key)) ? now : new Set([...now, ...keys])));
    });
    return () => cancelAnimationFrame(frame);
  }, [pickedScreen, pickedSelector, pickedTree]);
  // The pointer over a row outlines what it stands for on the canvas, as hovering that would.
  const [rowBox, setRowBox] = useState<{ copyId: string; box: Box } | null>(null);
  const rowAsk = useRef(0);
  const hoverRow = (row: LayerRow | null) => {
    rowAsk.current++;
    const ask = rowAsk.current;
    setHoverShape(row?.kind === "frame" ? row.id : null);
    setHoverLayer(row && row.kind !== "frame" && row.kind !== "node" ? row.id : null);
    const selector = row?.kind === "node" && row.copy !== undefined && row.ix !== undefined ? trees[row.copy]?.selector[row.ix] : undefined;
    const page = row?.copy ? pageFor(row.copy) : null;
    if (!row?.copy || !selector || !page) return setRowBox(null);
    void page.boxOf(selector).then((box) => ask === rowAsk.current && setRowBox(box ? { copyId: row.copy!, box } : null));
  };
  const selectLayer = async (row: LayerRow, shift: boolean) => {
    if (row.kind === "node" && row.copy !== undefined && row.ix !== undefined) {
      // An element of a screen: picked as a tap on it would, for the edit panel.
      const page = pageFor(row.copy);
      const selector = trees[row.copy]?.selector[row.ix];
      const part = page && selector ? await page.partOf(selector) : null;
      const copy = copyOf.get(row.copy);
      if (!page || !part || !copy) return;
      setBunch({ copies: [], frames: [] });
      setShape(null);
      setSelected(row.copy);
      setPickedOn({ selector: part.selector, copyId: row.copy });
      setEchoes([]);
      void echo(copy, part.selector, (frame) => selectorBox(frame, part.selector));
      // As a tap on it would: a live screen is handed over as its frame, a copy as its document.
      const frame = frames.current.get(row.copy) ?? null;
      picking?.onPick(frame, part, frame ? null : page.scope);
      return;
    }
    if (shift) return row.kind === "frame" ? toggleSelected(undefined, row.id) : toggleSelected(row.id);
    setBunch({ copies: [], frames: [] });
    if (pickingNow.current?.target) pickingNow.current.onPick(null, null);
    letGoInspect.current();
    setSelected(row.kind === "frame" ? null : row.id);
    setShape(row.kind === "frame" ? row.id : null);
  };

  // A text or an image put on the canvas: a piece like a component, drawn by public/canvas-layer.html. In a frame when it is put in one.
  const putDown = (piece: Piece, world: { x: number; y: number }, centred: boolean) => {
    const id = copyKey("stage", piece.id);
    setOffsets((was) => ({ ...was, [id]: { x: centred ? world.x - (piece.width * SCREEN_SCALE) / 2 : world.x, y: (centred ? world.y - (piece.height * SCREEN_SCALE) / 2 : world.y) - LABEL_HEIGHT } }));
    setPieces((was) => [...was, { ...piece, parent: frameAt(world.x, world.y) }]);
    setSelected(id);
    return id;
  };
  const worldAt = (clientX: number, clientY: number) => {
    const rect = box.current!.getBoundingClientRect();
    const now = camera.target;
    return { x: (clientX - rect.left - now.x) / now.scale, y: (clientY - rect.top - now.y) / now.scale };
  };
  const newId = () => `piece-${Math.random().toString(36).slice(2, 8)}`;
  const addText = (clientX: number, clientY: number) => {
    const id = putDown({ id: newId(), kind: "text", story: "", label: "Text", props: { text: "Text" }, width: 120, height: 32 }, worldAt(clientX, clientY), false);
    setTexting(false);
    setWriting(id);
  };
  // What was typed is kept; a text with nothing left in it goes. It is drawn again at the width it needs, not the one it had.
  const keepText = (id: string, text: string, fit?: { width: number; height: number }) => {
    setWriting(null);
    if (!text.trim()) {
      setPieces((was) => was.filter((piece) => copyKey("stage", piece.id) !== id));
      setSelected((now) => (now === id ? null : now));
    } else setPieces((was) => was.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, props: { ...piece.props, text }, ...(fit ? { width: piece.props.w ? piece.width : fit.width, height: fit.height } : {}) } : piece)));
  };
  // A picture from disk, kept in this browser (shrunk first, so it fits) under a name; where it goes is up to the caller.
  const storeImage = async (file: File) => {
    try {
      // A big picture would fill the browser's storage on its own: past a megabyte and a half it is kept as WebP or JPEG, and smaller.
      const encoded = await encodeImage(file, { maxSide: 1600, maxBytes: 1_500_000 });
      const data = await dataUrlOf(encoded.blob);
      const name = newId();
      pictures.set(name, data);
      try {
        localStorage.setItem(`proto:canvas-image:${name}`, data);
      } catch {
        // Storage full: it is there for this session, and not kept for the next.
      }
      return { name, width: encoded.sourceWidth, height: encoded.sourceHeight };
    } catch {
      // A file that isn't a picture the browser can read, or storage that is full: nothing is kept.
      return null;
    }
  };
  // A picture pasted or dropped on the canvas is a frame with that picture as its fill, as in Figma: the same as drawing a frame and choosing the picture for it, and sized to the picture.
  const addImage = async (file: File, where?: { x: number; y: number }) => {
    if (!size) return;
    const stored = await storeImage(file);
    if (!stored) return;
    const width = Math.min(stored.width, 400) * SCREEN_SCALE;
    const height = Math.max((width * stored.height) / stored.width, 1);
    const rect = box.current!.getBoundingClientRect();
    const centre = worldAt(where?.x ?? rect.left + size.width / 2, where?.y ?? rect.top + size.height / 2);
    const id = `frame-${Math.random().toString(36).slice(2, 8)}`;
    const [x, y] = [centre.x - width / 2, centre.y - height / 2];
    setShapes((was) => [...was, { id, name: "Image", x, y, width, height, parent: frameAt(centre.x, centre.y), fill: "#ffffff", fillImage: { name: stored.name, mode: "fill" } }]);
    setShape(id);
    setSelected(null);
  };
  // A picture pasted (⌘V with one on the clipboard) goes in the middle of the view.
  const addImageNow = useRef(addImage);
  useEffect(() => {
    addImageNow.current = addImage;
  });
  const storeImageNow = useRef(storeImage);
  useEffect(() => {
    storeImageNow.current = storeImage;
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (viewOnly || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || box.current?.closest("[inert]")) return;
      // A fill copied from a fill row (a colour as hex, or a picture) fills what is selected: frames and shapes, or a text's colour.
      const together = bunchNow.current;
      const frames = together.frames.length ? together.frames : shapeNow.current ? [shapeNow.current] : [];
      const textKey = !frames.length && selectedNow.current ? selectedNow.current : null;
      const file = [...(event.clipboardData?.files ?? [])].find((one) => one.type.startsWith("image/"));
      if (file && frames.length) {
        event.preventDefault();
        // The picture a fill row copied comes back as the one it was, not stored a second time.
        const again = copiedFill.name && file.size === copiedFill.size ? { name: copiedFill.name } : null;
        void (again ? Promise.resolve(again) : storeImageNow.current(file)).then((stored) => {
          if (stored) setShapes((all) => all.map((one) => (frames.includes(one.id) ? { ...one, fills: [{ kind: "image" as const, name: stored.name, mode: "fill" as const }, ...fillsOf(one)] } : one)));
        });
        return;
      }
      if (file) {
        event.preventDefault();
        void addImageNow.current(file);
        return;
      }
      const text = event.clipboardData?.getData("text/plain").trim() ?? "";
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return;
      if (frames.length) {
        event.preventDefault();
        // A fill pasted is a new one, on top of those the frame has.
        setShapes((all) => all.map((one) => (frames.includes(one.id) ? { ...one, fills: [{ kind: "solid" as const, color: text }, ...fillsOf(one)] } : one)));
      } else if (textKey && pieceByKeyNow.current(textKey)?.kind === "text") {
        event.preventDefault();
        setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === textKey ? { ...piece, props: { ...piece.props, color: text } } : piece)));
      }
    };
    // A fill copied from the panel replaces what ⌘C took from the canvas: the last thing copied is what ⌘V puts down.
    const taken = () => {
      held.current = null;
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("studio:clipboard-taken", taken);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("studio:clipboard-taken", taken);
    };
  }, [viewOnly]);
  const pieceByKeyNow = useRef(pieceByKey);
  useEffect(() => {
    pieceByKeyNow.current = pieceByKey;
  });
  // A placed image's picture swapped for another, keeping its box.
  const replaceImage = async (id: string, file: File) => {
    const stored = await storeImage(file);
    if (stored) setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, props: { ...piece.props, image: stored.name } } : piece)));
  };
  // A component put back as it was dragged out of the panel (its own example props), or shown as another of its variants.
  const showVariant = (id: string, story: string) => setPieces((all) => all.map((piece) => (copyKey("stage", piece.id) === id ? { ...piece, story, props: {} } : piece)));
  // A frame's picture in place of its colour.
  const fillWith = async (frameId: string, file: File, at: number) => {
    const stored = await storeImage(file);
    if (!stored) return;
    setShapes((all) =>
      all.map((one) => {
        if (one.id !== frameId) return one;
        const fills = [...fillsOf(one)];
        const was = fills[at];
        fills[at] = { kind: "image", name: stored.name, mode: was?.kind === "image" ? was.mode : "fill" };
        return { ...one, fills };
      }),
    );
  };
  // The field is as big as what is typed in it, as the drawn text is: measured by letting it shrink first.
  const sizeField = (field: HTMLTextAreaElement | null) => {
    if (!field) return;
    field.style.width = "0px";
    field.style.height = "0px";
    field.style.width = `${Math.max(field.scrollWidth, 8)}px`;
    field.style.height = `${field.scrollHeight}px`;
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
    if (isLayer(found.copy.id)) {
      if (picking.target) picking.onPick(null, null);
      setPickedOn(null);
      return;
    }
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
  // A text or an image put on the canvas is one thing: pointing at or tapping it is the layer, never the element it happens to be drawn with.
  // A component put on the canvas is one thing too, until it is entered (a double tap) to reach what it is made of.
  const [entered, setEntered] = useState<string | null>(null);
  const enteredNow = useRef<string | null>(null);
  useEffect(() => {
    if (entered && selected !== entered && !picked) {
      const frame = requestAnimationFrame(() => {
        enteredNow.current = null;
        setEntered(null);
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  });
  const isComponentPiece = (id: string) => !!pieceByKey(id) && !pieceByKey(id)!.kind;
  const pieceComponent = (id: string) => {
    const piece = pieceByKey(id);
    return piece && !piece.kind ? [piece.component ?? piece.label] : undefined;
  };
  const isLayer = (id: string) => {
    const piece = pieceByKey(id);
    return !!piece && (!!piece.kind || enteredNow.current !== id);
  };
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
      if (!found || isLayer(found.copy.id)) return setTarget(null);
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
  // The screen the play button opens: the one selected, or the one an element selected is in (nothing else going on).
  const interactTarget = picked?.copyId ?? selected;
  const interactWith = interactTarget && placed.has(interactTarget) && !placing && !interact && !framing ? interactTarget : null;
  // Zoom and play are offered to the bar above the canvas; play opens whatever is current when it is pressed.
  const playNow = useRef<() => void>(() => {});
  useEffect(() => {
    playNow.current = () => interactWith && openInteract(interactWith);
  });
  const canPlay = !!interactWith;
  useEffect(() => {
    publishZoom({ scale: view.scale * SCREEN_SCALE, zoomIn: () => zoomControls.current.zoomIn(), zoomOut: () => zoomControls.current.zoomOut(), reset: () => zoomControls.current.reset(), fit: () => zoomControls.current.fit(), play: canPlay ? () => playNow.current() : null });
  }, [view.scale, canPlay]);
  const needsLive = placing || !!inspect || (visible && !!list?.length);
  const asCopies = copiesChosen && !needsLive;
  // What the card at the top right has properties for: a text, image or component that is selected (and nothing of it picked), a group, or a frame.
  // Worked out here rather than left to `:has(:empty)` in CSS, which Safari and Chrome don't always look at again when a panel arrives a level down.
  const selectedPiece = selected && isPiece(selected) && !picking?.target && !framing && !interact ? pieces.find((one) => copyKey("stage", one.id) === selected) : undefined;
  const grouped = !viewOnly && !framing && bunch.copies.length + bunch.frames.length > 1;
  const frameSelected = !framing && shapes.some((one) => one.id === shape);
  const hasProperties = !!selectedPiece || grouped || frameSelected;

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
          // A note that was selected is let go of by a press on the canvas around it.
          if (comments?.focus && comments.notes.some((note) => note.id === comments.focus?.id)) {
            comments.onFocus(null);
            // Tapped from the canvas as it was: that is where it goes back to. In note mode the press goes on to leave a note.
            if (comments.peeking) comments.onLeave();
          }
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
        if (start.dup) {
          leaveCopy(start.dup);
          start.dup = undefined;
        }
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
            if (isPiece(screen)) aimAt(frameAt(rest.x + origin.x + x + nudge.dx + widthOf(screen) / 2, rest.y + LABEL_HEIGHT + origin.y + y + nudge.dy + heightOf(screen) / 2));
            holdLayout.current = true;
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
        // Only the bare canvas zooms: a double-click on a screen, a frame, a name, a panel or anything else is that thing's own, and while placing a comment a click is a comment.
        if (placing || interactNow.current || !box.current || (event.target !== event.currentTarget && event.target !== worldEl.current)) return;
        const rect = box.current.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, DOUBLE_CLICK_ZOOM, true);
      }}
      onPointerUp={(event) => {
        const done = drag.current;
        clearGuides();
        // Let go of a pan made with Space: not a tap, so nothing is selected or let go of.
        if (done?.spaced) {
          window.setTimeout(() => (drag.current = null), 0);
          return;
        }
        // Shift on a screen's name (a screen itself handles its own): the screen is added to the selection, or taken out of it.
        if (done?.screen && !done.moved && event.shiftKey) {
          toggleSelected(done.screen);
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
        setDropInto(null);
        // Let go of, what was held out of a layout goes back into it, where it now sits.
        if (holdLayout.current) {
          holdLayout.current = false;
          setSettle((now) => now + 1);
        }
        // A placed component, text or image let go of over a frame is in it from then on, and out of it when let go of elsewhere. So is each one of a group
        // let go of together (but not one that went with its own frame, which moved with it).
        if (done?.moved && done.screen) {
          const ids = done.group ? Object.keys(done.group.copies) : [done.screen];
          const parents = new Map<string, string | undefined>();
          for (const key of ids) {
            if (!isPiece(key) || (done.group && parentOf(key) && done.group.frames[parentOf(key)!])) continue;
            const spot = at(key);
            parents.set(key, frameAt(spot.x + widthOf(key) / 2, spot.y + heightOf(key) / 2));
          }
          if (parents.size) setPieces((now) => now.map((piece) => {
            const key = copyKey("stage", piece.id);
            return parents.has(key) && piece.parent !== parents.get(key) ? { ...piece, parent: parents.get(key) } : piece;
          }));
        }
        if (done?.moved && done.screen && done.origin) {
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
      // Shift is for selecting several: it must not also select the words between one press and the next.
      onMouseDown={(event) => event.shiftKey && event.preventDefault()}
      // Placing a comment or a note: the pointer says so, over everything, as it does while panning.
      style={placing && !panning ? { cursor: comments?.noting ? NOTE_CURSOR : COMMENT_CURSOR } : undefined}
      className={`absolute inset-0 touch-none overflow-hidden ${panning ? "cursor-grab active:cursor-grabbing [&_*]:!cursor-[inherit]" : placing ? "[&_*]:!cursor-[inherit]" : ""}`}
    >
      <div ref={worldEl} className="absolute left-0 top-0 origin-top-left" style={{ visibility: size ? undefined : "hidden" }}>
        {shapes.filter((one) => one.shape !== "sticky").map((one) => (
          <div
            key={one.id}
            onPointerDown={(event) => frameDown(event, one)}
            onContextMenu={(event) => openMenu(event, { frame: one.id })}
            onPointerMove={(event) => frameMove(event, one)}
            onPointerUp={frameUp}
            onPointerEnter={() => setHoverShape(one.id)}
            onPointerLeave={() => setHoverShape((now) => (now === one.id ? null : now))}
            style={{ left: one.x, top: one.y, width: one.width, height: one.height, clipPath: clipFor(one.parent, one), background: drawnAsLines(one.shape) ? "transparent" : backgroundOf(one), borderRadius: one.shape === "ellipse" ? "50%" : one.radius, display: frameState(one.id, "hidden") ? "none" : undefined, pointerEvents: frameState(one.id, "locked") ? "none" : undefined, boxShadow: one.shape === "sticky" ? "var(--elev-floating)" : one.stroke ? `inset 0 0 0 ${one.strokeWidth ?? 1}px ${one.stroke}` : undefined, outline: dropInto === one.id ? `${3 / view.scale}px solid var(--selection)` : shape === one.id || bunch.frames.includes(one.id) ? `${2 / view.scale}px solid var(--selection)` : hoverShape === one.id ? `${1 / view.scale}px solid var(--selection)` : undefined, outlineOffset: 0, transition: popping === one.id ? "width var(--dur-fast) var(--curve-spatial)" : undefined }}
            className="absolute cursor-default"
          >
            {drawnAsLines(one.shape) ? (
              <svg aria-hidden viewBox={`0 0 ${Math.max(one.width, 1)} ${Math.max(one.height, 1)}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
                {one.shape === "line" || one.shape === "arrow" ? (
                  <>
                    <line x1={0} y1={one.flip ? one.height : 0} x2={one.width} y2={one.flip ? 0 : one.height} stroke={one.stroke ?? "#111111"} strokeWidth={one.strokeWidth ?? 1} strokeLinecap="round" />
                    {one.shape === "arrow" ? (
                      <polyline points={arrowhead(one)} fill="none" stroke={one.stroke ?? "#111111"} strokeWidth={one.strokeWidth ?? 1} strokeLinecap="round" strokeLinejoin="round" />
                    ) : null}
                  </>
                ) : one.closed ? (
                  <polygon points={(one.points ?? []).map(([x, y]) => `${x * one.width},${y * one.height}`).join(" ")} fill={one.fill ?? "none"} stroke={one.stroke ?? "none"} strokeWidth={one.strokeWidth ?? 1} strokeLinejoin="round" />
                ) : (
                  <polyline points={(one.points ?? []).map(([x, y]) => `${x * one.width},${y * one.height}`).join(" ")} fill="none" stroke={one.stroke ?? "#111111"} strokeWidth={one.strokeWidth ?? 1} strokeLinejoin="round" strokeLinecap="round" />
                )}
              </svg>
            ) : null}
          </div>
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
              onContextMenu={(event: React.MouseEvent) => openMenu(event, { copy: id })}
              // The element a tap would select is outlined under the pointer; not while anything is pressed (a screen being moved, the canvas panned).
              onPointerMove={(event: React.PointerEvent) => {
                const deep = event.metaKey || event.ctrlKey;
                // What is in a frame is pointed at directly, as in Figma; the frame is what its bare background is.
                setHoverShape(null);
                setHoverLayer((now) => { const next = isLayer(id) && !event.buttons ? id : null; return now === next ? now : next; });
                if (selecting && !placing) point(event.buttons ? null : { x: event.clientX, y: event.clientY }, deep);
              }}
              onPointerLeave={() => {
                setHoverShape(null);
                setHoverLayer((now) => (now === id ? null : now));
                if (selecting && !placing) point(null);
              }}
              onPointerUp={(event: React.PointerEvent) => {
                if (drag.current?.moved || drag.current?.spaced) return;
                event.stopPropagation();
                // A tap is over: left recorded as a drag begun (this keeps the release from the canvas, which would clear it), the next movement over the canvas would carry the screen along.
                drag.current = null;
                if (event.shiftKey) return toggleSelected(id);
                setShape(null);
                setSelected(id);
                // The first tap selects the part under it as well; a second on the same screen, soon after (a double-click, a
                // double-tap: there is no double-click event on every touch screen), goes a level into what is selected, and types over its words when it can't.
                const now = performance.now();
                if (lastTap.current?.id === id && now - lastTap.current.at < DOUBLE_TAP_MS) {
                  lastTap.current = null;
                  if (pieceByKey(id) && !pieceByKey(id)!.kind && enteredNow.current !== id) {
                    // Entered: the element under the pointer, at the bottom, is what it picks.
                    enteredNow.current = id;
                    setEntered(id);
                    void pick(event.clientX, event.clientY, true);
                  } else void pick(event.clientX, event.clientY, event.metaKey || event.ctrlKey, true);
                } else {
                  lastTap.current = { id, at: now };
                  void pick(event.clientX, event.clientY, event.metaKey || event.ctrlKey);
                  void inspectAt(event.clientX, event.clientY);
                }
              }}
              aria-label={devices.length > 1 ? `${screen.name}, ${on.name}` : screen.name}
              aria-pressed={selected === id}
              onDoubleClick={() => pieces.find((piece) => copyKey("stage", piece.id) === id)?.kind === "text" && !viewOnly && setWriting(id)}
              style={{
                display: shown ? undefined : "none",
                left: spot.x,
                top: spot.y,
                width: widthOf(id),
                height: heightOf(id),
                // The frame's outline stays two pixels wide however far in or out you are, and is only for the frame itself: an element picked on it is outlined instead.
                outline: (selected === id || bunch.copies.includes(id)) && picked?.copyId !== id ? `${2 / view.scale}px solid ${isComponentPiece(id) ? "var(--component)" : "var(--selection)"}` : hoverLayer === id ? `${1 / view.scale}px solid ${isComponentPiece(id) ? "var(--component)" : "var(--selection)"}` : undefined,
                outlineOffset: isPiece(id) ? 0 : 3 / view.scale,
                "--i": Math.min(index, 8),
                // Out of sight until the whole canvas arrives (a device switched on later shows its placeholder straight away); and while it is opened, since that is it.
                opacity: revealed ? undefined : 0,
                // The text being typed is the field over it: the drawn one is out of sight meanwhile, or both would show.
                visibility: (interact?.id === id && loadedId === screen.id) || writing === id || stateOfKey(id, "hidden") ? "hidden" : undefined,
                pointerEvents: stateOfKey(id, "hidden") || stateOfKey(id, "locked") ? "none" : undefined,
                clipPath: clipOf(id, spot),
              } as React.CSSProperties}
              className={`absolute block text-left ${isPiece(id) ? "[&>span[aria-hidden]]:border-0 [&>span[aria-hidden]]:bg-transparent" : "overflow-hidden rounded-[calc(var(--r-device)*0.5)] bg-surface"} ${opening.has(id) ? "stagger-in" : ""} ${arrived(id) ? "" : "pointer-events-none"}`}
            >
              <ScreenSurface
                components={pieceComponent(id)}
                asCopies={asCopies}
                live={usingId === id}
                interactive={usingId === id}
                onLeave={() => setUsing(null)}
                registerCopy={(page) => {
                  if (page) {
                    copyPages.current.set(id, page);
                    if (isPiece(id)) requestAnimationFrame(() => applyFixed(id));
                  }
                  else copyPages.current.delete(id);
                  // The layers panel reads these pages, so it is told when one comes or goes.
                  requestAnimationFrame(() => setPagesSeen((n) => n + 1));
                }}
                // The labels saying how a screen is drawn are for developing: copies are the default now, and nobody else is told.
                chosen={COPIES_OFFERED && !viewOnly && copiesChosen}
                known={pageHeights[id] !== undefined}
                onReady={() => {
                  setReadyIds((now) => (now.has(id) ? now : new Set(now).add(id)));
                  if (isPiece(id)) {
                    applyFixed(id);
                    measurePiece(id);
                  }
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
        {writing && copyOf.has(writing) ? (
          <textarea
            key={writing}
            autoFocus
            rows={1}
            wrap="off"
            aria-label="Text"
            defaultValue={String(pieces.find((piece) => copyKey("stage", piece.id) === writing)?.props.text ?? "")}
            ref={sizeField}
            onFocus={(event) => event.currentTarget.select()}
            onInput={(event) => sizeField(event.currentTarget)}
            onBlur={(event) => keepText(writing, event.currentTarget.value, { width: Math.ceil(event.currentTarget.offsetWidth) + 2, height: Math.ceil(event.currentTarget.offsetHeight) })}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            style={{ left: at(writing).x, top: at(writing).y, fontSize: Number(pieceByKey(writing)?.props.size) || 24, fontWeight: Number(pieceByKey(writing)?.props.weight) || 400, color: String(pieceByKey(writing)?.props.color ?? "#111111"), textAlign: (pieceByKey(writing)?.props.align as React.CSSProperties["textAlign"]) ?? "left", lineHeight: 1.3, transform: `scale(${SCREEN_SCALE})`, transformOrigin: "top left", outline: `${2 / view.scale / SCREEN_SCALE}px solid var(--selection)`, borderRadius: 0 } as React.CSSProperties}
            className="absolute m-0 box-content block resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',system-ui,sans-serif] font-normal tracking-normal text-[#111]"
          />
        ) : null}
        {size && sheet && withSheet ? <ComponentsFrame marks={sheet.marks} pages={Object.fromEntries(flow.screens.map((screen) => [screen.id, `${withParams(base, screen.params)}${Object.keys(screen.params).length ? "&" : "?"}${PREVIEW_QUERY}`]))} devices={devices} scale={SCREEN_SCALE} onSize={setSheetSize} left={flowWidth + GAP.x} /> : null}
      </div>

      {/*
        Sticky notes are drawn here, at the size they are on screen, and not inside the world that is scaled: a note in the world is a picture stretched, and soft in
        Safari however far in. Here its box, its words and its shadow are each set to the pixels they take, so they are as sharp as any text at every zoom.
      */}
      {size ? (
        <div className="pointer-events-none absolute inset-0">
          {shapes
            .filter((one) => one.shape === "sticky" && !frameState(one.id, "hidden"))
            .map((one) => (
              <StickyNote
                key={one.id}
                note={one}
                scale={view.scale}
                corner={toScreen(one.x, one.y)}
                background={backgroundOf(one)}
                outline={dropInto === one.id ? "3px solid var(--selection)" : shape === one.id || bunch.frames.includes(one.id) ? "2px solid var(--selection)" : hoverShape === one.id ? "1px solid var(--selection)" : undefined}
                transition={popping === one.id ? "width var(--dur-fast) var(--curve-spatial)" : undefined}
                locked={viewOnly || frameState(one.id, "locked")}
                editing={editingSticky === one.id}
                handlers={{
                  onPointerDown: (event) => frameDown(event, one),
                  onContextMenu: (event) => openMenu(event, { frame: one.id }),
                  onPointerMove: (event) => frameMove(event, one),
                  onPointerUp: frameUp,
                  onPointerEnter: () => setHoverShape(one.id),
                  onPointerLeave: () => setHoverShape((now) => (now === one.id ? null : now)),
                }}
                onEdit={() => setEditingSticky(one.id)}
                onCommit={(text) => {
                  setEditingSticky(null);
                  if (text !== (one.text ?? "")) updateFrame(one.id, { text });
                }}
                // Its height is whatever its words need (never less than its base): kept as it is measured, with no step of its own in the undo.
                onFit={(height) => setShapes((all) => all.map((item) => (item.id === one.id && Math.abs(item.height - height) > 1 ? { ...item, height } : item)))}
              />
            ))}
        </div>
      ) : null}

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
          {[...(measured?.spans ?? []), ...gapSpans].map((span, index) => {
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
            // Only a top-level frame is named on the canvas; what is in one is named in the layers.
            // A sticky note isn't named: it says what it says, and who by.
            if (frameState(one.id, "hidden") || one.parent || one.shape === "sticky") return null;
            const spot = toScreen(one.x, one.y);
            // Double-clicked, the name is a field, right where it is.
            if (renaming === one.id)
              return (
                <input
                  key={`${one.id}-name`}
                  autoFocus
                  aria-label="Frame name"
                  defaultValue={one.name}
                  onFocus={(event) => event.target.select()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== one.name) renameLayer(one.id, name);
                    setRenaming(null);
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      event.currentTarget.value = one.name;
                      event.currentTarget.blur();
                    }
                  }}
                  style={{ left: spot.x, top: spot.y - 24, width: Math.max(96, Math.min(one.width * view.scale, 240)) }}
                  className="pointer-events-auto absolute h-5 rounded-[var(--r-xs)] bg-surface px-1 text-xs font-medium text-foreground outline-none ring-1 ring-[var(--selection)]"
                />
              );
            return (
              <span
                key={`${one.id}-name`}
                onPointerDown={(event) => frameDown(event, one)}
                onPointerMove={(event) => frameMove(event, one)}
                onPointerUp={frameUp}
                onDoubleClick={() => !viewOnly && !one.locked && setRenaming(one.id)}
                style={{ left: spot.x, top: spot.y - 22, maxWidth: Math.max(60, one.width * view.scale) }}
                className={`absolute select-none truncate text-xs font-medium ${placing || framing || one.locked ? "pointer-events-none" : "pointer-events-auto cursor-default"} ${shape === one.id || bunch.frames.includes(one.id) ? "text-foreground" : "text-foreground-muted"}`}
              >
                {one.name}
              </span>
            );
          })}
          {!viewOnly && !framing && !placing && !texting && !bunch.copies.length && !bunch.frames.length
            ? (() => {
                const frame = shape ? shapes.find((one) => one.id === shape) : undefined;
                // The size, under it: each side its number, and `Hug` or `Fill` after it where that is how it is sized.
                const sizeLabel = (area: Area, modes: ["fixed" | "hug" | "fill", "fixed" | "hug" | "fill"]) => modes.map((mode, at) => `${Math.round((at ? area.height : area.width) / SCREEN_SCALE)}${mode === "hug" ? " Hug" : mode === "fill" ? " Fill" : ""}`).join(" × ");
                if (frame) return handlesFor(frame.id, false, frame, false, (handle) => fitFrame(frame.id, handle), sizeLabel(frame, frame.shape ? ["fixed", "fixed"] : [frameMode(frame, "width"), frameMode(frame, "height")]), undefined, frame.shape === "sticky");
                const sized = selected && !picked && pieces.find((piece) => copyKey("stage", piece.id) === selected);
                if (!sized || !copyOf.has(selected!)) return null;
                const spot = at(selected!);
                const area = resizeDraft ?? { x: spot.x, y: spot.y, width: widthOf(selected!), height: heightOf(selected!) };
                const filling = (side: "width" | "height") => sized.sizing?.[side] === "fill";
                const modes: ["fixed" | "hug" | "fill", "fixed" | "hug" | "fill"] =
                  sized.kind === "text"
                    ? [filling("width") ? "fill" : sized.props.w ? "fixed" : "hug", "hug"]
                    : sized.kind
                      ? [filling("width") ? "fill" : "fixed", filling("height") ? "fill" : "fixed"]
                      : [filling("width") ? "fill" : sized.fixedWidth ? "fixed" : "hug", filling("height") ? "fill" : sized.fixedHeight ? "fixed" : "hug"];
                return handlesFor(selected!, true, area, sized.kind === "text", sized.kind === "text" ? () => fitWords(selected!) : !sized.kind ? (handle) => hugComponent(selected!, handle) : undefined, sizeLabel(area, modes), sized.kind ? "var(--selection)" : "var(--component)");
              })()
            : null}
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
                className={`absolute flex select-none items-center gap-1.5 text-xs font-medium ${placing ? "pointer-events-none" : "pointer-events-auto cursor-grab"} ${selected === id ? "text-foreground" : "text-foreground-muted"}`}
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
          {/* A tap on a screen offers to use it here, above its name (off; Interact is in the bar at the foot). */}
          {USE_IN_PLACE && selected && placed.has(selected) && !placing && !interact ? (
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
          {(() => {
            // Each screen's notes go down its right side in the order of their dots, pushed down where they would overlap.
            const bottoms = new Map<string, number>();
            return found
              .flatMap((item) => {
                const note = comments.notes.find((entry) => entry.id === item.id);
                return note && item.key !== "draft" ? [{ item, note, point: onCanvas(item.copyId, item.spot) }] : [];
              })
              .sort((a, b) => a.point.y - b.point.y)
              .map(({ item, note, point }) => {
                const scale = noteScale(view.scale * SCREEN_SCALE);
                const open = longNotes.has(note.id);
                const top = Math.max(point.y - 16 * scale, (bottoms.get(item.copyId) ?? -Infinity) + 8 * scale);
                bottoms.set(item.copyId, top + noteHeight(note.text, open) * scale);
                return (
                  <NoteMark
                    key={item.key}
                    note={note}
                    from={point}
                    edge={toScreen(at(item.copyId).x + widthOf(item.copyId), 0).x}
                    top={top}
                    scale={scale}
                    expanded={open}
                    selected={comments.focus?.id === note.id}
                    onEdit={(text) => comments.onEditNote(note, text)}
                    onExpand={() => setLongNotes((now) => (open ? new Set([...now].filter((id) => id !== note.id)) : new Set(now).add(note.id)))}
                    onOpen={() => {
                      // Tapped again, it is let go of; otherwise it is selected, already in view, so the canvas stays as it is.
                      if (comments.focus?.id === note.id) return comments.onFocus(null);
                      tapped.current = note.id;
                      comments.onOpenNote(note);
                    }}
                  />
                );
              });
          })()}
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
          {picked && !writing ? outline("picked", picked.copyId, picked.part.box, !!(picked.part.component || picked.part.inside)) : null}
          {picked ? echoes.filter((item) => item.key === picked.part.selector && copyOf.has(item.copyId)).map((item) => outline(`echo-${item.copyId}`, item.copyId, item.box, !!(picked.part.component || picked.part.inside))) : null}
          {rowBox && !writing ? outline("row", rowBox.copyId, rowBox.box, rowBox.box.component) : null}
          {target && !writing ? outline("target", target.copyId, target.box, target.box.component) : null}
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
            placeholder={comments.noting ? "Add a note" : undefined}
            onPost={(text) => {
              // Closed at once; the comment is on the canvas, breathing, until it is saved. If it isn't, what was written comes back.
              const placed = draft;
              setDraft(null);
              setRetry({ text: "" });
              void comments.onAdd(text, placed.anchor, setups?.[screenOfCopy(placed.copyId)], copyOf.get(placed.copyId)?.device.id, comments.noting).then((saved) => {
                if (saved) return;
                setRetry({ text });
                setDraft(placed);
              });
            }}
          />
        </Card>
      ) : null}

      {/* One card at the top right: the zoom, play and share, and under them the properties of whatever is selected. */}
      <div className="pointer-events-none absolute bottom-16 right-8 top-8 z-[var(--z-raised)] hidden flex-col items-end sm:flex">
        {editHistory ? (
          <div
            inert={uiHidden}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            className={`pointer-events-auto absolute right-full top-0 mr-2 flex items-center gap-1 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-1.5 shadow-floating transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${uiHidden ? "pointer-events-none opacity-0" : ""}`}
          >
            {editHistory}
          </div>
        ) : null}
        <div
          inert={uiHidden}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          className={`pointer-events-auto flex max-h-full flex-col rounded-[var(--r-tile)] border border-border bg-surface-elevated shadow-floating transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${sidePanel && sideFull ? "h-full" : ""} ${uiHidden ? "pointer-events-none opacity-0" : ""}`}
        >
          {topRight ? <div className="flex shrink-0 items-center justify-end gap-1 p-1.5">{topRight}</div> : null}
          <div className={`min-h-0 flex-1 overflow-y-auto border-t border-divider [scrollbar-width:thin] ${sidePanel || hasProperties ? "" : "hidden"}`}>
            {sidePanel}
            <div className={`w-[var(--dev-panel-width)] min-w-full ${hasProperties ? "" : "hidden"}`}>
      {/* A selected frame's properties, beside the canvas. */}
      {(() => {
        // A text, image or component that is selected: where it is, from its frame's corner when it is in one.
        const piece = selectedPiece;
        if (!piece || !selected) return null;
        const frame = piece.parent ? shapes.find((one) => one.id === piece.parent) : undefined;
        const spot = at(selected);
        const origin = frame ?? { x: 0, y: 0 };
        return (
          <div>
            <PiecePanel
              label={piece.kind === "text" ? "Text" : piece.kind === "image" ? "Image" : piece.label}
              width={piece.width}
              height={piece.height}
              resize={piece.kind === "text" ? "width" : "both"}
              onSize={(width, height) => sizePiece(selected, width, height)}
              sizing={(() => {
                const filling = !!frame?.layout;
                const fill = (side: "width" | "height") => piece.sizing?.[side] === "fill";
                if (piece.kind === "text") return { width: fill("width") ? "fill" : piece.props.w ? "fixed" : "hug", height: "hug", widthModes: filling ? ["fixed", "hug", "fill"] : ["fixed", "hug"], heightModes: ["hug"] } as const;
                if (piece.kind === "image") return { width: fill("width") ? "fill" : "fixed", height: fill("height") ? "fill" : "fixed", widthModes: filling ? ["fixed", "fill"] : ["fixed"], heightModes: filling ? ["fixed", "fill"] : ["fixed"] } as const;
                // A component is as big as it comes (hug), or given a size of its own, or takes what an auto layout leaves.
                return { width: fill("width") ? "fill" : piece.fixedWidth ? "fixed" : "hug", height: fill("height") ? "fill" : piece.fixedHeight ? "fixed" : "hug", widthModes: filling ? ["fixed", "hug", "fill"] : ["fixed", "hug"], heightModes: filling ? ["fixed", "hug", "fill"] : ["fixed", "hug"] } as const;
              })()}
              onSizing={(side, mode) => modePiece(selected, side, mode)}
              onAlign={frame ? alignSelected : undefined}
              pin={frame && !frame.layout ? { x: piece.pin?.x ?? "none", y: piece.pin?.y ?? "none", onChange: (axis, value) => pinLayer(selected, axis, value) } : undefined}
              component={!piece.kind ? { props: rootProps?.id === selected ? Object.entries(rootProps.values).map(([key, value]) => ({ key, value, changed: key in piece.props })) : [], onProp: (key, value) => setPieces((all) => all.map((one) => (copyKey("stage", one.id) === selected ? { ...one, props: { ...one.props, [key]: value } } : one))), variants: variants.map((one) => ({ id: one.id, label: variantLabel(one.name) })), current: piece.story, changed: Object.keys(piece.props).length > 0, onVariant: (story) => showVariant(selected, story), onReset: () => showVariant(selected, piece.story) } : undefined}
              image={piece.kind === "image" ? { fit: piece.props.fit === "fit" || piece.props.fit === "stretch" ? piece.props.fit : "fill", onFit: (fit) => setPieces((all) => all.map((one) => (copyKey("stage", one.id) === selected ? { ...one, props: { ...one.props, fit } } : one))), onReplace: (file) => replaceImage(selected, file) } : undefined}
              text={piece.kind === "text" ? { size: Number(piece.props.size) || 24, weight: Number(piece.props.weight) || 400, color: String(piece.props.color ?? "#111111"), align: (piece.props.align as TextStyle["align"]) ?? "left" } : undefined}
              onText={(patch) => styleText(selected, patch)}
              x={spot.x - origin.x}
              y={spot.y - origin.y}
              inFrame={frame?.name}
              unit={1 / SCREEN_SCALE}
              onMove={(x, y) => setOffsets((now) => ({ ...now, [selected]: { x: (now[selected]?.x ?? 0) + origin.x + x - spot.x, y: (now[selected]?.y ?? 0) + origin.y + y - spot.y } }))}
            />
          </div>
        );
      })()}
      {grouped ? (
        <div>
          <BunchPanel count={bunch.copies.length + bunch.frames.length} onAlign={alignSelected} />
        </div>
      ) : null}
      {frameSelected ? (
        <div>
          <FramePanel frame={shapes.find((one) => one.id === shape)!} onFillImage={(file, at) => fillWith(shape!, file, at)} pictures={pictureOf} onAlign={shapes.find((one) => one.id === shape)?.parent ? alignSelected : undefined} pin={(() => { const own = shapes.find((one) => one.id === shape); const parent = shapes.find((one) => one.id === own?.parent); return own && parent && !parent.layout ? { x: own.pin?.x ?? "none", y: own.pin?.y ?? "none", onChange: (axis: "x" | "y", value: "none" | "start" | "end" | "both" | "center") => pinLayer(`frame:${own.id}`, axis, value) } : undefined; })()} inLayout={!!shapes.find((one) => one.id === shapes.find((item) => item.id === shape)?.parent)?.layout} unit={1 / SCREEN_SCALE} surface="#ffffff" onChange={(patch) => {
                const current = shapes.find((one) => one.id === shape);
                if (patch.sizing?.width === "fill" && current?.sizing?.width !== "fill") roomToFill(current?.parent, "width");
                if (patch.sizing?.height === "fill" && current?.sizing?.height !== "fill") roomToFill(current?.parent, "height");
                updateFrame(shape!, patch);
              }} onAutoLayout={() => { const boxes = [...pieces.filter((piece) => piece.parent === shape && copyOf.has(copyKey("stage", piece.id))).map((piece) => realBox(copyKey("stage", piece.id))), ...shapes.filter((one) => one.parent === shape).map((one) => ({ id: one.id, x: one.x / SCREEN_SCALE, y: one.y / SCREEN_SCALE, width: one.width / SCREEN_SCALE, height: one.height / SCREEN_SCALE }))]; updateFrame(shape!, { layout: detectLayout(boxes) }); }} />
        </div>
      ) : null}
            </div>
          </div>
        </div>
      </div>


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
      {texting ? (
        <div
          // Over everything: the click is the text's, and nothing under it (a screen, a pan, a pick) hears it.
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.stopPropagation();
            addText(event.clientX, event.clientY);
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          style={{ zIndex: "var(--z-sticky)" }}
          className="absolute inset-0 cursor-text"
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
            setSketch((now) => (now ? { ...now, ...pulledTo(now, event.clientX - rect.left, event.clientY - rect.top, event.shiftKey, shaping === "line" || shaping === "arrow") } : now));
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
      {shaping && shaping !== "path" ? (
        <div
          // Over everything, as the frame tool's is: the drag is the shape's.
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const rect = event.currentTarget.getBoundingClientRect();
            const [x, y] = [event.clientX - rect.left, event.clientY - rect.top];
            setSketch({ x, y, x2: x, y2: y });
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSketch((now) => (now ? { ...now, ...pulledTo(now, event.clientX - rect.left, event.clientY - rect.top, event.shiftKey, shaping === "line" || shaping === "arrow") } : now));
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            if (sketch) addShape(shaping, sketch);
            setSketch(null);
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          style={{ zIndex: "var(--z-sticky)" }}
          className="absolute inset-0 cursor-crosshair"
        >
          {sketch ? (
            shaping === "line" || shaping === "arrow" ? (
              <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
                <line x1={sketch.x} y1={sketch.y} x2={sketch.x2} y2={sketch.y2} stroke="var(--selection)" strokeWidth={1.5} />
              </svg>
            ) : (
              <div
                style={{ left: Math.min(sketch.x, sketch.x2), top: Math.min(sketch.y, sketch.y2), width: Math.abs(sketch.x2 - sketch.x), height: Math.abs(sketch.y2 - sketch.y), background: "var(--selection-muted)", borderRadius: shaping === "ellipse" ? "50%" : undefined, clipPath: shaping === "polygon" ? "polygon(50% 0, 100% 100%, 0 100%)" : undefined }}
                className="pointer-events-none absolute border border-[var(--selection)]"
              />
            )
          ) : null}
        </div>
      ) : null}
      {shaping === "path" ? (
        <div
          // Each click is a point; a click back on the first closes the shape, and Enter or a double-click leaves it open.
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPenAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            const first = penned[0];
            if (first && penned.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) <= 8) return finishPath(true);
            setPenned((now) => [...now, point]);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            // The two clicks of the double-click each added a point at the same place: one goes.
            setPenned((now) => (now.length > 1 ? now.slice(0, -1) : now));
            finishPath(false);
          }}
          onClick={(event) => event.stopPropagation()}
          style={{ zIndex: "var(--z-sticky)" }}
          className="absolute inset-0 cursor-crosshair"
        >
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <polyline points={[...penned, ...(penAt ? [penAt] : [])].map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="var(--selection)" strokeWidth={1.5} />
            {penned.map((point, index) => (
              <circle key={index} cx={point.x} cy={point.y} r={index === 0 ? 4 : 3} fill="var(--selection-foreground)" stroke="var(--selection)" strokeWidth={1.5} />
            ))}
          </svg>
        </div>
      ) : null}
      {/* One card at the top left: the version, closing the canvas and the layers button, and under them the layers when open. */}
      <div className="pointer-events-none absolute bottom-16 left-8 top-8 z-[var(--z-raised)] hidden flex-col items-start sm:flex">
        <div
          inert={uiHidden}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          className={`pointer-events-auto flex max-h-full flex-col rounded-[var(--r-tile)] border border-border bg-surface-elevated shadow-floating transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${layersOpen && !viewOnly ? "h-full w-60" : ""} ${uiHidden ? "pointer-events-none opacity-0" : ""}`}
        >
          {topLeft ? (
            <div className="flex shrink-0 items-center gap-1 p-1.5">
              {topLeft}
              <span aria-live="polite" className={`pl-1 pr-2 text-xs transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${cloudStatus === "idle" ? "hidden" : cloudStatus === "offline" ? "text-foreground" : "text-foreground-subtle"}`}>
                {cloudStatus === "saving" ? "Saving" : cloudStatus === "saved" ? "Saved" : cloudStatus === "offline" ? "Offline, will retry" : ""}
              </span>
            </div>
          ) : null}
          {layersOpen && !viewOnly ? (
            <div className="min-h-0 flex-1 overflow-hidden border-t border-divider">
          <LayersPanel
            rows={layerRows()}
            onSelect={selectLayer}
            onRename={(row, name) => renameLayer(row.id, name)}
            onToggle={toggleLayer}
            onMove={moveLayer}
            onHover={hoverRow}
            onFold={(row, all) => {
              const toggle = (now: ReadonlySet<string>, key: string) => (now.has(key) ? new Set([...now].filter((id) => id !== key)) : new Set(now).add(key));
              if (row.kind === "frame") return setFolded((now) => toggle(now, row.id));
              const copy = row.kind === "screen" ? row.id : row.copy;
              const tree = copy ? trees[copy] : undefined;
              const keyOf = (ix: number) => `node:${copy}:${tree?.selector[ix]}`;
              if (!all || !copy || !tree) return setUnfolded((now) => toggle(now, row.kind === "screen" ? `screen:${row.id}` : keyOf(row.ix!)));
              // With alt, everything inside goes the way this one does: all open, or all closed.
              const keys: string[] = row.kind === "screen" ? [`screen:${copy}`] : [];
              const gather = (ix: number) => {
                keys.push(keyOf(ix));
                for (const kid of childrenIn(tree, ix)) gather(kid);
              };
              for (const top of row.kind === "screen" ? childrenIn(tree, -1) : [row.ix!]) gather(top);
              setUnfolded((now) => {
                const next = new Set(now);
                for (const key of keys) {
                  if (row.open) next.delete(key);
                  else next.add(key);
                }
                return next;
              });
            }}
          />
            </div>
          ) : null}
        </div>
      </div>
      {menu ? (
        <div
          data-menu=""
          role="menu"
          style={{ left: menu.x, top: menu.y, zIndex: "var(--z-sticky)" }}
          onContextMenu={(event) => event.preventDefault()}
          className="absolute flex w-56 flex-col rounded-[var(--r-tile)] border border-border bg-surface-elevated p-1 shadow-floating"
        >
          {[
            { label: "Group", keys: "⌥⌘G", run: () => wrap(false) },
            { label: "Add auto layout", keys: "⇧A", run: () => wrap(true) },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={!layersSelected().keys.length && !layersSelected().frames.length}
              onClick={item.run}
              className="flex h-8 items-center justify-between rounded-[var(--r-control)] px-2 text-xs text-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] enabled:hover:bg-surface-inset disabled:text-foreground-subtle"
            >
              {item.label}
              <span className="text-foreground-subtle">{item.keys}</span>
            </button>
          ))}
        </div>
      ) : null}
      {/* Always on: the tools, as in Figma. Pointer is the default; Frame opens the devices to start from, above it. */}
      <div
        inert={!!interact || uiHidden}
        style={{ zIndex: "var(--z-sticky)" }}
        // A press on the bar is not a press on the canvas: letting go of one would count as a tap there, and let go of the selection the bar is about.
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        className={`pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${interact || uiHidden ? "opacity-0" : ""}`}
      >
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
        <div role="toolbar" aria-label="Canvas tools" className="pointer-events-auto flex items-center gap-0 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-1 shadow-floating">
          <IconButton
            tooltipSide="above"
            label="Move (V)"
            variant="ghost"
            aria-pressed={!framing}
            className={!framing ? controlOn : ""}
            onClick={() => {
              setSketch(null);
              setFraming(false);
              setTexting(false);
              setShaping(null);
              setPenned([]);
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
              setTexting(false);
              setShaping(null);
              setPenned([]);
              setFraming((on) => !on);
            }}
          >
            <FrameIcon className="size-[1.125rem]" />
          </IconButton>
          {viewOnly ? null : (
            <>
              <ToolGroup
                options={SHAPE_OPTIONS}
                current={shapeKind}
                active={!!shaping && shaping !== "path" && shaping !== "sticky"}
                onActivate={() => pickShape(shapeKind)}
                onChoose={(id) => pickShape(id as CanvasShape, true)}
              />
              <StickyTool
                active={shaping === "sticky"}
                color={stickyColor}
                size={Math.min(240, Math.max(48, STICKY_SIZE * view.scale))}
                onActivate={() => pickShape("sticky")}
                onColor={(color) => {
                  setStickyColor(color);
                  pickShape("sticky", true);
                }}
                onDrop={dropSticky}
              />
              <IconButton
                tooltipSide="above"
                label="Text (T)"
                variant="ghost"
                aria-pressed={texting}
                className={texting ? controlOn : ""}
                onClick={() => {
                  setShape(null);
                  setSketch(null);
                  setFraming(false);
                  setShaping(null);
                  setPenned([]);
                  setTexting((on) => !on);
                }}
              >
                <TextIcon className="size-[1.125rem]" />
              </IconButton>
              {tools}
            </>
          )}
          {bar ? (
            <>
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
              {bar}
            </>
          ) : null}
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
function ScreenSurface({ asCopies, live, interactive, onLeave, chosen, known, registerCopy, components, ...frame }: { /** Names to take as components in this screen's copy (a component put on the canvas). */ components?: string[]; asCopies: boolean; live: boolean; interactive: boolean; onLeave: () => void; chosen: boolean; known: boolean; registerCopy: (page: FramePage | null) => void } & Omit<React.ComponentProps<typeof ScreenFrame>, "interactive" | "onLeave" | "donate">) {
  // The selected screen is the one being worked on, so it is the page itself.
  const wantsCopy = asCopies && !live;
  const copy = useScreenCopy(frame.src, frame.device.width, wantsCopy);
  const { src, device } = frame;
  // While copies are wanted the page that is already there offers itself to be read, once it has loaded and settled.
  const names = components?.join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const offer = useCallback((element: HTMLIFrameElement) => donate(src, device.width, element, components), [src, device.width, names]);
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
