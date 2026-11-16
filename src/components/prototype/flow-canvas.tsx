"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CodeIcon, FitIcon, PlayIcon } from "@/components/shell/nav-icons";
import type { Mark } from "@/lib/handoff";
import type { SourceEl } from "@/lib/handoff-clip";
import { targetOf, type Selection } from "@/lib/handoff-selection";
import { IconButton } from "@/components/ui/button";
import type { Spot } from "@/lib/anchor";
import { setupOf, type Anchor } from "@/lib/comments";
import { copyKey, fitView, followShift, layoutFlow, screenOfCopy, spreadCopies, withParams, type Flow } from "@/lib/flow";
import type { Device } from "@/lib/phone";
import { applyEmbed } from "@/lib/embed";
import { embedded, PREVIEW_QUERY } from "@/lib/controls";

import { ComponentsFrame } from "./components-frame";
import { Card, CommentCard, Composer, DraftPin, Pin, PinTarget, type CommentsUi } from "./comment-parts";
import type { Part } from "@/lib/edit-part";

import { TextInPlace } from "./edit-layer";
import { handoffPartBox, handoffSourceAt, pageOf, selectorBox } from "./frame-page";
import { usePinWatch } from "./use-pin-watch";

/** How big a screen is drawn on the canvas, as a share of the phone's real size. */
const SCREEN_SCALE = 0.5;
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
    onPick: (frame: HTMLIFrameElement | null, part: Part | null) => void;
    onText: (part: Part, text: string) => void;
    busy: boolean;
    onPage: () => void;
  };
}) {
  // A screen on a device is a copy. Everything below that is kept for a screen (its page's height, where it was dragged to,
  // whether it is selected, the pins on it) is kept under its copy's key, so each copy has its own.
  const copies = devices.flatMap((on) => flow.screens.map((screen, index) => ({ id: copyKey(on.id, screen.id), screen, device: on, index })));
  const copyOf = new Map(copies.map((copy) => [copy.id, copy]));
  // Every device that has been on since the canvas opened, in the order they were switched on. A device switched off
  // keeps its pages, out of sight, so switching it on again shows them as they were instead of loading them again.
  // The order never changes: a frame moved in the page loads again.
  const [seen, setSeen] = useState(devices);
  const unseen = devices.filter((on) => !seen.some((was) => was.id === on.id));
  if (unseen.length) setSeen([...seen, ...unseen]);
  const kept = [...seen, ...unseen].flatMap((on) => flow.screens.map((screen, index) => ({ id: copyKey(on.id, screen.id), screen, device: on, index })));
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
  const pageHeight = (id: string) => pageHeights[id] ?? copyOf.get(id)?.device.height ?? 0;
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
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
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
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<string | null>(null);
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
  const [byHand, setByHand] = useState(false);
  // A zoom that is a single step (a double-click, plus or minus) glides to where it is going; anything done by hand follows the hand.
  const [easing, setEasing] = useState(false);
  const touch = (value: boolean) => {
    touched.current = value;
    setByHand(value);
    setEasing(false);
  };

  // Comments: each screen is its own live page, so a comment is looked for in every one of them.
  const frames = useRef(new Map<string, HTMLIFrameElement>());
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
    if (!inspect || !found) return;
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
    if (size && !touched.current) setView(fitted(size));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, width, height]);

  // Once somebody has moved the view it is left where it is; but a device switched on or off moves every screen after
  // the first along, so the view goes as far as the copy nearest its middle did, and what is on screen stays put.
  const stood = useRef(placed);
  const shown = devices.map((on) => on.id).join();
  useLayoutEffect(() => {
    const before = stood.current;
    if (!size || !touched.current) return;
    setView((now) => {
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
    setView({ scale, x: size.width / 2 - (spot.x + widthOf(entry.copyId) / 2) * scale, y: INSET.top + space.height / 2 - (spot.y + tall / 2) * scale });
    // Only when asked, not each time the layout or the size moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  const zoomAt = (px: number, py: number, factor: number, animate = false) => {
    touch(true);
    setEasing(animate);
    setView((now) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, now.scale * factor));
      const k = scale / now.scale;
      return { scale, x: px - (px - now.x) * k, y: py - (py - now.y) * k };
    });
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
        setView((now) => ({ ...now, x: now.x - event.deltaX, y: now.y - event.deltaY }));
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

  // Once it has arrived, the view glides to where it is sent (a page turning out taller, the Fit button) unless somebody is moving it by hand. The first fit is a place, not a move.
  const gliding = revealed && !byHand;
  // A press on a screen or its name moves that screen (`screen`, from where it was: `origin`), and only that screen; one
  // on the canvas around them pans it, as does one anywhere with Space held, as in Figma.
  const drag = useRef<{ x: number; y: number; from: View; moved: boolean; pan: boolean; screen?: string; origin?: { x: number; y: number } } | null>(null);
  const space = useRef(false);
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    const hold = (on: boolean) => {
      space.current = on;
      setPanning(on);
    };
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== "Space" || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target?.tagName ?? "")) return;
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
  const shownId = interact?.id ?? (selected && placed.has(selected) && !placing ? selected : null);
  // Where a screen stands on the canvas now, in the canvas's own window: what an opened one grows from and shrinks back to.
  const standing = (id: string): Box => {
    const spot = at(id);
    return { left: view.x + spot.x * view.scale, top: view.y + spot.y * view.scale, width: widthOf(id) * view.scale, height: heightOf(id) * view.scale };
  };
  const openInteract = (id: string) => {
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
    drag.current = { x: event.clientX, y: event.clientY, from: view, moved: false, pan: false, screen: id, origin: offsets[id] ?? { x: 0, y: 0 } };
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

  // A point on the canvas, as the screen under it and where that is in the screen's own page.
  const pointIn = (clientX: number, clientY: number) => {
    const rect = box.current!.getBoundingClientRect();
    const world = { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
    const copy = copies.find((item) => {
      const spot = at(item.id);
      return world.x >= spot.x && world.x <= spot.x + widthOf(item.id) && world.y >= spot.y && world.y <= spot.y + heightOf(item.id);
    });
    const frame = copy ? frames.current.get(copy.id) : null;
    if (!copy || !frame) return null;
    const spot = at(copy.id);
    return { copy, frame, x: (world.x - spot.x) / SCREEN_SCALE, y: (world.y - spot.y) / SCREEN_SCALE };
  };
  const place = async (event: React.MouseEvent<HTMLDivElement>) => {
    // Letting go of a drag isn't a click on anything.
    if (drag.current?.moved || !comments) return;
    const found = pointIn(event.clientX, event.clientY);
    if (!found) return;
    const anchor = await pageOf(found.frame).anchorAt(found.x, found.y);
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
    const part = await pageOf(found.frame).partAt(found.x, found.y, deep || !!inspect, from);
    if (into && !part) return void type(clientX, clientY);
    setPickedOn(part ? { selector: part.selector, copyId: found.copy.id } : null);
    setEchoes([]);
    if (part) void echo(found.copy, part.selector, (frame) => selectorBox(frame, part.selector));
    if (part || picking.target) picking.onPick(found.frame, part);
  };
  // A second tap on words types over them, where they are.
  const type = async (clientX: number, clientY: number) => {
    const found = picking && pointIn(clientX, clientY);
    if (!found) return;
    const part = await pageOf(found.frame).partAt(found.x, found.y);
    if (part?.text != null) setTyping({ part, copyId: found.copy.id });
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
  // stays on it as the canvas moves. Asked for at most once a frame; a late answer is dropped if the pointer has moved on.
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
      const deep = reaching.current || placing || !!inspect;
      void Promise.all([pageOf(found.frame).boxAt(found.x, found.y, { deep, groups: !placing }), wholes.length ? handoffSourceAt(found.frame, found.x, found.y, wholes) : null]).then(([box, whole]) => {
        if (pointer.current !== now) return;
        const shown = whole ? { ...whole.box, component: true } : box;
        setTarget(shown ? { copyId: found.copy.id, box: shown } : null);
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
      if (event instanceof KeyboardEvent && event.key !== "Meta" && event.key !== "Control") return;
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

  return (
    <div
      ref={box}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY, from: view, moved: false, pan: true };
      }}
      onPointerMove={(event) => {
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
          setSelected(screen);
          setOffsets((now) => ({ ...now, [screen]: { x: origin.x + x, y: origin.y + y } }));
          return;
        }
        if (!start.pan) return;
        touch(true);
        setView({ ...start.from, x: start.from.x + dx, y: start.from.y + dy });
      }}
      onDoubleClick={(event) => {
        // A double-click on a screen is the screen's own, and while placing a comment a click is a comment.
        if (placing || interactNow.current || (event.target as Element).closest("button, [data-screen-name]") || !box.current) return;
        const rect = box.current.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, DOUBLE_CLICK_ZOOM, true);
      }}
      onPointerUp={(event) => {
        const done = drag.current;
        // A tap on the canvas around the screens lets go of an element selected to edit; a control or a pin pressed is not that.
        if (done && !done.moved && !done.screen && inspecting.current && !(event.target as Element).closest("button, [data-pin], textarea")) {
          setInspected(null);
          setEchoes([]);
          select(null);
        }
        if (done && !done.moved && !done.screen && picking?.target && !(event.target as Element).closest("button, [data-pin], textarea")) picking.onPick(null, null);
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
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        transition: gliding || easing ? `background-position var(--dur-deliberate) var(--curve-standard), background-size var(--dur-deliberate) var(--curve-standard)` : undefined,
      }}
      className={`absolute inset-0 touch-none overflow-hidden ${panning ? "cursor-grab active:cursor-grabbing [&_*]:!cursor-[inherit]" : "active:cursor-grabbing"}`}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        onTransitionEnd={(event) => event.target === event.currentTarget && setEasing(false)}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, visibility: size ? undefined : "hidden", transition: gliding || easing ? "transform var(--dur-deliberate) var(--curve-standard)" : undefined }}
      >
        {size ? kept.map(({ id, screen, device: on, index }) => {
          // Its device is on; otherwise it is only being kept.
          const shown = copyOf.has(id);
          const spot = shown ? at(id) : { x: 0, y: 0 };
          return (
            <button
              key={id}
              type="button"
              onPointerDown={(event) => grab(event, id)}
              // The element a tap would select is outlined under the pointer; not while anything is pressed (a screen being moved, the canvas panned).
              onPointerMove={selecting && !placing ? (event) => point(event.buttons ? null : { x: event.clientX, y: event.clientY }, event.metaKey || event.ctrlKey) : undefined}
              onPointerLeave={selecting && !placing ? () => point(null) : undefined}
              onPointerUp={(event) => {
                if (drag.current?.moved) return;
                event.stopPropagation();
                // A tap is over: left recorded as a drag begun (this keeps the release from the canvas, which would clear it), the next movement over the canvas would carry the screen along.
                drag.current = null;
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
                // The selection outline stays two pixels wide however far in or out you are.
                outline: selected === id ? `${2 / view.scale}px solid var(--focus-ring)` : undefined,
                outlineOffset: 3 / view.scale,
                "--i": Math.min(index, 8),
                // Out of sight until the whole canvas arrives (a device switched on later shows its placeholder straight away); and while it is opened, since that is it.
                opacity: revealed ? undefined : 0,
                visibility: interact?.id === id && loadedId === screen.id ? "hidden" : undefined,
              } as React.CSSProperties}
              className={`absolute block overflow-hidden rounded-[calc(var(--r-device)*0.5)] bg-surface text-left ${opening.has(id) ? "stagger-in" : ""} ${arrived(id) ? "" : "pointer-events-none"}`}
            >
              <ScreenFrame
                onReady={() => {
                  setReadyIds((now) => (now.has(id) ? now : new Set(now).add(id)));
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
                src={`${withParams(base, screen.params)}${Object.keys(screen.params).length ? "&" : "?"}${PREVIEW_QUERY}`}
                device={on}
              />
              {fold && pageHeight(id) > on.height ? (
                <span aria-hidden style={{ top: on.height * SCREEN_SCALE }} className="pointer-events-none absolute inset-x-0 bottom-0 bg-surface opacity-50" />
              ) : null}
              {/* A layer of the canvas's own over the page, so a swipe lands on the canvas and never on something that scrolls inside the screen, whatever address the page is on. */}
              <span aria-hidden className="absolute inset-0 [will-change:transform]" />
            </button>
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

          {copies.map(({ id, screen, device: on }) => {
            // A placeholder has its name too.
            if (!revealed) return null;
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
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={() => openInteract(selected)}
              style={{ left: toScreen(at(selected).x, at(selected).y).x + (widthOf(selected) * view.scale) / 2, top: toScreen(at(selected).x, at(selected).y).y - 30 }}
              className="pointer-events-auto absolute -translate-x-1/2 flex -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] bg-accent py-1.5 pl-2.5 pr-3 text-xs font-medium text-accent-foreground shadow-floating hover:bg-accent-hover"
            >
              <PlayIcon className="size-3.5" />
              Interact
            </button>
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
          {picked ? outline("picked", picked.copyId, picked.part.box, !!picked.part.component) : null}
          {picked ? echoes.filter((item) => item.key === picked.part.selector && copyOf.has(item.copyId)).map((item) => outline(`echo-${item.copyId}`, item.copyId, item.box, !!picked.part.component)) : null}
          {target ? outline("target", target.copyId, target.box, target.box.component) : null}
          {typing
            ? (() => {
                // Where the words are now, if the part being typed over is the one selected, which is kept up to date.
                const { box } = picked && picked.part.selector === typing.part.selector && picked.copyId === typing.copyId ? picked.part : typing.part;
                const corner = onCanvas(typing.copyId, { x: box.left, y: box.top });
                const scale = SCREEN_SCALE * view.scale;
                return (
                  <TextInPlace
                    part={typing.part}
                    left={corner.x}
                    top={corner.y}
                    width={box.width * scale}
                    height={box.height * scale}
                    scale={scale}
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

      {/* At the foot of the canvas, which clips what hangs below it: their names show above them. */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <IconButton tooltipSide="above" label="Zoom out" onClick={() => size && zoomAt(size.width / 2, size.height / 2, 1 / 1.25, true)}>
          <span className="text-md leading-none">−</span>
        </IconButton>
        <span className="min-w-12 text-center text-ui font-medium text-foreground-muted">{Math.round(view.scale * 100)}%</span>
        <IconButton tooltipSide="above" label="Zoom in" onClick={() => size && zoomAt(size.width / 2, size.height / 2, 1.25, true)}>
          <span className="text-md leading-none">+</span>
        </IconButton>
        <IconButton
          tooltipSide="above"
          label="Fit to view"
          onClick={() => {
            if (!size) return;
            touch(false);
            setView(fitted(size));
          }}
        >
          <FitIcon className="size-[1.125rem]" />
        </IconButton>
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
                  <iframe
                    src={embedded(withParams(base, screen.params))}
                    title={screen.name}
                    onLoad={() => {
                      setLoadedId(screen.id);
                      picking?.onPage();
                    }}
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
                    className="absolute left-0 top-0 block border-0 bg-surface"
                    sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
                  />
                </div>
              </div>
            );
          })()
        : null}
    </div>
  );
}

/**
 * One screen, live, at the phone's own size and scaled down. The canvas
 * mounts it once its room has settled; it shows in the reveal after that.
 */
function ScreenFrame({
  src,
  device,
  pageHeight,
  onMeasured,
  onReady,
  register,
}: {
  src: string;
  device: Device;
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
    if (!loaded || !element || !doc) return undefined;
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
  }, [loaded]);

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
    const timer = window.setTimeout(onReady, loaded ? READY_AFTER_LOAD_MS : GIVE_UP_MS);
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
      inert={!across}
      onLoad={() => {
        setAcross(!frame.current?.contentDocument);
        setLoaded((count) => count + 1);
      }}
      style={{ width: device.width, height: pageHeight, transform: `scale(${SCREEN_SCALE})` }}
      className="pointer-events-none block origin-top-left border-0"
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
