"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { CommentsUi } from "@/components/prototype/comment-parts";
import { useCommentFocus } from "@/components/prototype/use-comment-focus";
import { CLAUDE_AUTHOR, reviewPrompt, setupOf, type Anchor, type Comment } from "@/lib/comments";
import { useStudio } from "@/lib/data/studio-store";
import { setPrototypeFrame } from "@/lib/prototype-frame-ref";
import { useEditSession } from "@/components/prototype/use-edit-session";
import type { CommentGroup } from "@/components/prototype/comments-panel";
import { useComments, useOtherComments, useShowComments } from "@/components/prototype/use-comments";
import { MotionSheet } from "@/components/motion";
import { ShareMenu } from "@/components/prototype/share-menu";
import { deviceIcons } from "@/components/prototype/view-menu";

import { CloseIcon, CodeIcon, NoteIcon, TerminalIcon, CommentIcon, ComponentIcon, LayersIcon, ExpandIcon, ExternalIcon, EyeIcon, EyeOffIcon, FlowIcon, FoldIcon, SidebarIcon, SlidersIcon } from "@/components/shell/nav-icons";
import { ComponentsPanel, SHOW_COMPONENTS } from "@/components/prototype/components-panel";

import { controlOn, IconButton } from "./button";
import { Dot, type Tone } from "./chip";
import { DialogForm } from "./dialog-form";
import { Toggle } from "./toggle";
import { withParams, type Flow, type FlowScreen } from "@/lib/flow";
import { InAppChrome } from "@/components/prototype/in-app-chrome";
import { DEFAULT_DEVICE, DEVICES, IN_APPS, barsOf, type Device, type InApp } from "@/lib/phone";
import { useFlag } from "@/lib/use-flag";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUser } from "@/lib/use-user";
import { editInPlace } from "@/lib/edit-dom";
import { describePart, partIn, type Part, type Tokens } from "@/lib/edit-part";
import { copyDocument } from "@/components/prototype/copy-page";
import { NotesPanel } from "@/components/prototype/notes-panel";
import { SelectLayer, type Selected } from "@/components/prototype/select-layer";
import { sendSelection, useTerminal } from "@/lib/terminal";
import { CanvasViewMenu } from "@/components/prototype/canvas-view-menu";
import { CanvasPlayButton, CanvasZoomMenu } from "@/components/prototype/canvas-zoom-menu";
import { ALWAYS_ON_SHARE_LINKS, CanvasIntro } from "@/components/prototype/canvas-intro";
import { EditLayer } from "@/components/prototype/edit-layer";
import type { SourceEl } from "@/lib/handoff-clip";
import type { Selection } from "@/lib/handoff-selection";
import { followPart, setDesignSystem, watchScrolled } from "@/components/prototype/frame-page";
import { refreshCopies } from "@/lib/screen-copies";
import { designSystemOf } from "@/lib/registry/actions";
import { inspectDocument, type MotionSeen, type Picked } from "@/lib/inspect";
import { watchTaps } from "@/lib/anchor";
import { applyEmbed } from "@/lib/embed";

// Loaded when their mode is opened, not with the page. Until then (or while the chunk arrives) they render nothing.
const DevPanel = dynamic(() => import("@/components/prototype/dev-panel").then((m) => m.DevPanel), { ssr: false });
const EditBar = dynamic(() => import("@/components/prototype/edit-bar").then((m) => m.EditBar), { ssr: false });
const EditHistory = dynamic(() => import("@/components/prototype/edit-bar").then((m) => m.EditHistory), { ssr: false });
const EditPanel = dynamic(() => import("@/components/prototype/edit-panel").then((m) => m.EditPanel), { ssr: false });
const FlowCanvas = dynamic(() => import("@/components/prototype/flow-canvas").then((m) => m.FlowCanvas), { ssr: false });
// The comments code is fetched once the page has painted, so it is ready without being asked for and never holds the prototype up.
const TerminalDock = dynamic(() => import("@/components/prototype/terminal-dock").then((m) => m.TerminalDock), { ssr: false });
const CommentsPanel = dynamic(() => import("@/components/prototype/comments-panel").then((m) => m.CommentsPanel), { ssr: false });
const CommentLayer = dynamic(() => import("@/components/prototype/comment-layer").then((m) => m.CommentLayer), { ssr: false });
const preloadComments = () => {
  void import("@/components/prototype/comment-layer");
  void import("@/components/prototype/comments-panel");
};

/** How long a closed canvas stays loaded in case it is opened again. */
const CANVAS_WARM_MS = 2 * 60 * 1000;

/** How long a change of device takes to play, matching `--dur-standard`; and the transition that plays it. */
const SIZING_MS = 280;
/** The stage's left padding in px: the usual `px-8`, and with the options panel open (2rem in, 15rem wide, 1rem clear) 18rem. Keep in step with the classes on the stage. */
const STAGE_PAD = 32;
const STAGE_PAD_SIDE = 288;
const SIZING = "transition-[width,height,transform] duration-[var(--dur-standard)] ease-[var(--curve-spatial)]";
// Into and out of full screen the frame is sized as a share of the stage, which is itself growing or shrinking: the
// same duration and curve as the page's own, so the two move as one and arrive together.
const FILLING = "transition-[width,height,transform] duration-[var(--dur-standard)] ease-[var(--curve-standard)]";
type Sizing = false | "device" | "fill";
const sizingClass = (sizing: Sizing) => (sizing === "fill" ? FILLING : sizing ? SIZING : "");

/**
 * A prototype on a tile, the same grey tile the feed uses, 90% of the
 * window tall so all of it is in view. The prototype sits in the middle as
 * a phone, centered on the tile. The tile is a set height, so a phone drawn bigger than it scrolls inside. Along the top: on the left the version and the flow; in the middle `center` (which phone, how big); on the
 * right dev mode and open in a new window.
 *
 * The prototype is laid out at the phone's own size and then scaled to fit the
 * tile, so it looks the same on a laptop as on a big screen.
 *
 * The prototype loads behind a skeleton, which comes back whenever the url
 * changes, so choosing another version reads as the thing refreshing.
 */
export function PrototypeFrame({
  url: addressed,
  openUrl,
  title,
  leading,
  share,
  corner,
  bottom,
  handoff,
  side,
  center,
  device,
  onDevice,
  zoom = 1,
  fit = false,
  inApp = IN_APPS[0],
  poster,
  edit,
  comments: givenComments,
  flow,
  variants,
  readyForDev,
  handoffInspect,
  handoffSheet,
  inspectPanel,
  inspectInPanel = false,
  inspecting = false,
  flowOpen,
  onFlowOpen,
  focusFind,
  mode,
  onMode,
  listing,
  onListing: setListing,
  fullscreen,
  onFullscreen,
  bare = false,
  onBare,
  onOpenPrototype,
  docs,
  minimal = false,
  onPlace,
}: {
  url?: string;
  /** The address to open the prototype at on its own (new tab, QR), when the frame's own differs: it carries the studio's flag and, with live controls, stops changing. */
  openUrl?: string;
  title: string;
  /** The version control, at the start of the bar. */
  leading: ReactNode;
  /** Something small in the bottom right corner of the prototype's tile (a share page's QR code). */
  corner?: ReactNode;
  /** Which version the Share menu in the corner links to. */
  share?: { slug: string };
  /** Beside the canvas button: a handoff has been scanned for this version. The dot says how far it has got. */
  handoff?: { label: string; tone: Tone; hollow?: boolean; onOpen: () => void };
  /** On a phone only: a control in the middle of the first row of the bar. */
  bottom?: ReactNode;
  /** Down the tile's left edge on a wide screen: what belongs to the prototype but not to its frame (a handoff, its variants). */
  side?: ReactNode;
  /** The phone picker and sizing, in the middle of the bar. Told the scale the preview is drawn at, and above a screen opened on the canvas the device that copy of it is on. */
  center?: (info: { scale: number | null; device?: Device }) => ReactNode;
  /** The phone it is laid out for. */
  device: Device;
  /** Dragging an edge of the frame snaps between devices; this is told which. */
  onDevice?: (device: Device) => void;
  /** How big to draw it, as a multiple of the phone's real size; 1 is its exact size. */
  zoom?: number;
  /** Scale it to the room there is instead; `zoom` is ignored while this is on. */
  fit?: boolean;
  /** The app a phone is previewed inside: its bars take height from the page. Only a phone, and not on the canvas or in full screen. */
  inApp?: InApp;
  /** A picture of the prototype, shown while the real one loads. */
  poster?: string;
  /** Which version edits are made on. Without it there is no Edit mode. */
  edit?: { slug: string; versionId: string; variantId?: string; /** A live version: there is no version to save, its edits are a preview on the running page. */ live?: boolean };
  /** Which version comments are left on. Without it there are no comments. */
  comments?: {
    slug: string;
    version: string;
    /** Every version of the prototype, newest first, so the list can show the comments left on the others. */
    versions?: { key: string; version: string }[];
    /** Opens another version, by its key. */
    onVersion?: (key: string) => void;
    /** The setup on screen (see `Comment`); pins show only the comments left on it. */
    variant?: string;
    /** Puts the prototype in the setup a comment was left on. An empty one is the version as it is. */
    onSetup?: (setup: string) => void;
    /** Whether the setup a comment was left on can be shown yet: the options it names load after the page. */
    canShow?: (setup?: string) => boolean;
    /** A setup in words, for the list, or null when a prototype has only the one. */
    setupLabel?: (setup?: string) => string | null;
  };
  /** The flow of this version, if it has one, and whether it is being looked at instead of the prototype. Kept by the page, which steps its side column aside for it. */
  flow: Flow | null;
  /** The prototype's variants as a canvas of their own, with the setup each one shows. It shares the flow's place: looked at instead of the prototype. */
  variants?: { flow: Flow; setups: Record<string, string> } | null;
  /** The handoff has been signed off for these designs (a design is a variant's id): the canvas marks their screens Ready for dev. Null when it hasn't. */
  readyForDev?: string[] | null;
  /** Engineers looking at a handed-off version: a tap on a canvas screen selects the part of the handoff under it; `inspectPanel` says what it is. */
  handoffInspect?: { elements: SourceEl[]; onSelect: (selection: Selection | null) => void; selection: Selection | null };
  /** The handed-off version's new and extended components, drawn in a frame after the canvas's last screen. */
  handoffSheet?: React.ComponentProps<typeof FlowCanvas>["sheet"];
  inspectPanel?: ReactNode;
  /** The card for what is selected goes at the top of the side panel (the studio's own canvas) rather than floating on its own (a share page); `inspecting` is whether something is selected. */
  inspectInPanel?: boolean;
  inspecting?: boolean;
  flowOpen: boolean;
  onFlowOpen: (open: boolean) => void;
  /** Lines of one section of the copy: the canvas opens zoomed to where they are (a link from a copy doc). */
  focusFind?: string[];
  /** Looking, editing or in dev mode. The last two replace the bar and bring a panel of their own. */
  mode: "view" | "dev" | "edit" | "comment";
  onMode: (mode: "view" | "dev" | "edit" | "comment") => void;
  /** Commenting with the list of comments beside the prototype, which the page makes room for. The comment button and C both ask for it. */
  listing: boolean;
  onListing: (listing: boolean) => void;
  /** Full screen: the studio steps back so the prototype can fill the window. */
  fullscreen: boolean;
  onFullscreen: (on: boolean) => void;
  /** Only the prototype is on screen: no toolbar, panels, pins or handles. Command-period turns it on and off. */
  bare?: boolean;
  onBare?: (on: boolean) => void;
  /** A share page's button for the prototype itself: it loads in this tab, as it would opened on its own. */
  onOpenPrototype?: () => void;
  /** A share page's link to the version's files on GitHub, for engineers. */
  /** Beside the canvas button: the prototype's documents and links (a menu of its own). */
  docs?: ReactNode;
  /** A share page: the version, the viewport, the comment buttons and full screen on the bar, and no look toggle, canvas, restart or share. */
  minimal?: boolean;
  /** The prototype has put somewhere else in its own address (its query, as `?a=1`): where it is now, for the page to follow. */
  onPlace?: (search: string) => void;
}) {
  // The flow: the screens of the prototype and how they connect, drawn as a canvas.
  // Opening a screen from it shows the prototype on that screen; both belong to one address.
  const [opened, setOpened] = useState<{ address?: string; screen: FlowScreen | null }>({ screen: null });
  const screen = opened.address === addressed ? opened.screen : null;
  const url = addressed && screen ? withParams(addressed, screen.params) : addressed;
  // The canvas: the flow if there is one, the variants if there are, and a switch between them when there are both.
  // The options beside the prototype: open to start with, folded away to a button when they are in the way.
  const [sideOpen, setSideOpen] = useState(true);
  // The website's components, to pick from, on the canvas only (the options panel is for the prototype's own view, so the two never
  // share the left). It is mounted the first time it is opened, which is when its list is asked for, and kept after, so closing
  // and reopening is instant.
  // The layers panel, on the left of the canvas; the components panel stands to the right of it when both are open.
  const [layersOpen, setLayersOpen] = useState(false);
  // ⌘. puts every control away, to look at the canvas alone, and brings them back.
  const [uiHidden, setUiHidden] = useState(false);
  const [componentsOpen, setComponentsOpen] = useState(false);
  const [componentsSeen, setComponentsSeen] = useState(false);
  const toggleComponents = () => {
    setComponentsOpen(!componentsOpen);
    setComponentsSeen(true);
  };
  const [canvasKind, setCanvasKind] = useState<"flow" | "variants">("flow");
  // Where each device's own height ends, drawn across its screens on the canvas.
  const [fold, setFold] = useState(false);
  // With neither, the prototype is a canvas of one screen, so the whole page can still be looked at there.
  const single = useMemo<Flow>(() => ({ screens: [{ id: "page", name: title, params: {} }], edges: [] }), [title]);
  const flowCanvas = flow || !variants ? { flow: flow ?? single, setups: undefined } : null;
  const canvas = (canvasKind === "variants" ? variants : flowCanvas) ?? flowCanvas ?? variants ?? null;
  const showingFlow = flowOpen && !!canvas && !!addressed;
  useEffect(() => {
    if (!showingFlow) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== "Period" || !(event.metaKey || event.ctrlKey) || event.altKey || event.repeat || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      event.preventDefault();
      setUiHidden((now) => !now);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showingFlow]);
  const showingVariants = showingFlow && !!canvas?.setups;
  // The devices on the canvas: every screen is shown on each, side by side. It opens with the main view's alone, and
  // they are switched on and off from the bar; closed, it goes back to that one. When the main view's device is changed
  // while it is open (the menu above an opened screen), that device takes the place of the one it was, and the others stay.
  const [canvasOn, setCanvasOn] = useState({ open: showingFlow, main: device.id, ids: [device.id] });
  // The devices somebody chose, kept with the canvas (here and in the cloud): the canvas opens on them.
  const [chosenDevices, setChosenDevices] = useState<string[] | undefined>();
  const toggleDevice = (id: string) => {
    const on = canvasOn.ids.includes(id);
    if (on && canvasOn.ids.length === 1) return;
    const ids = on ? canvasOn.ids.filter((one) => one !== id) : [...canvasOn.ids, id];
    setCanvasOn({ ...canvasOn, ids });
    setChosenDevices(ids);
  };
  const keepDevices = (ids: string[]) => {
    const known = ids.filter((id) => DEVICES.some((candidate) => candidate.id === id));
    if (!known.length) return;
    setChosenDevices(known);
    setCanvasOn((now) => ({ ...now, ids: known }));
  };
  if (canvasOn.open !== showingFlow || canvasOn.main !== device.id) {
    const swapped = canvasOn.ids.includes(canvasOn.main) ? canvasOn.ids.map((id) => (id === canvasOn.main ? device.id : id)) : [...canvasOn.ids, device.id];
    setCanvasOn({ open: showingFlow, main: device.id, ids: showingFlow && canvasOn.open ? [...new Set(swapped)] : showingFlow && chosenDevices ? chosenDevices : [device.id] });
  }
  const canvasDevices = DEVICES.filter((candidate) => canvasOn.ids.includes(candidate.id));
  // A canvas that was just closed stays loaded (out of sight, and not looking at anything) for a couple of minutes, so
  // going back to it is instant rather than a dozen pages loading again. Only the one that was opened, and only for the
  // version it was opened on.
  const canvasKey = addressed && canvas ? `${addressed.split("?")[0]}|${canvas.setups ? "variants" : "flow"}` : null;
  const [warmKey, setWarmKey] = useState<string | null>(null);
  if (showingFlow && canvasKey && warmKey !== canvasKey) setWarmKey(canvasKey);
  useEffect(() => {
    if (showingFlow || !warmKey) return undefined;
    const timer = window.setTimeout(() => setWarmKey(null), CANVAS_WARM_MS);
    return () => window.clearTimeout(timer);
  }, [showingFlow, warmKey]);
  // Dev mode: the same preview, with its code beside it. What was picked and
  // what moved belong to the document on screen, so a new url starts them over.
  const editing = mode === "edit" && !!edit;
  const dev = mode === "dev" || editing;
  // Comment mode, like editing, takes the page over: the next click on the prototype leaves a comment there, and the panel lists them all.
  // On a phone the list is a sheet instead, opened from the bar.
  const user = useUser();
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(preloadComments, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(preloadComments, 1000);
    return () => window.clearTimeout(id);
  }, []);
  const [, markCanvasHintSeen] = useFlag("proto.canvas-hint");
  const [pinsChosen, setShowPins] = useShowComments();
  // A share page shows comments only while commenting, so the show and hide switch is not offered there.
  const showPins = pinsChosen && !minimal;
  // The setup on screen: the page's, and a flow screen's own parameters on top while one is open, so a comment left there goes back there.
  // A design QA has no comments: not the buttons, the list, the keys, nor notes.
  const commentsOf = givenComments?.slug.startsWith("qa-") ? undefined : givenComments;
  const setupOnScreen = setupOf(withParams(`?${commentsOf?.variant ?? ""}`, screen?.params ?? {}).split("?")[1]);
  const { comments: allComments, everything: allEverything, replies, error: commentsError, add: postComment, reply: replyToComment, resolve: resolveComment, like: likeComment, remove: deleteComment, edit: editNote, undo: undoChange, changed, refresh: refreshComments } = useComments(commentsOf?.slug, commentsOf?.version, user.name, setupOnScreen, showPins || mode === "comment");
  // Notes for the developers are kept with the comments, but are not among them: no count, no list, no pins.
  const comments = allComments.filter((item) => !item.note);
  const everything = allEverything.filter((item) => !item.note);
  const notes = allComments.filter((item) => item.note);
  const [noting, setNoting] = useState(false);
  // A note was tapped with nothing being placed: its panel is open, and a click on the canvas goes back to where it was.
  const [peeking, setPeeking] = useState(false);
  // On the canvas the comments and the notes can each be put away (shift C, shift D); while leaving one, both are in view.
  const [commentsShown, setCommentsShown] = useState(true);
  const [notesShown, setNotesShown] = useState(true);
  const others = useOtherComments(commentsOf?.slug, (commentsOf?.versions ?? []).map((item) => item.key).filter((key) => key !== commentsOf?.version), !dev && (showPins || mode === "comment"));
  const groups: CommentGroup[] = (commentsOf?.versions ?? []).map((item) => ({
    key: item.key,
    version: item.version,
    comments: (item.key === commentsOf?.version ? everything : others[item.key]?.filter((comment) => !comment.parentId)) ?? [],
  }));
  const allReplies = { ...replies };
  for (const list of Object.values(others)) for (const item of list) if (item.parentId) (allReplies[item.parentId] ??= []).push(item);
  const { notify } = useStudio();
  // Claude's change put back by the studio itself, or made again; said in a toast, as is why when it couldn't be.
  const undoClaude = async (reply: Comment, redo = false) => {
    const stopped = await undoChange(reply, redo);
    notify(stopped ?? (redo ? "Redone" : "Undone"), !!stopped);
  };
  // A change of Claude's that arrived while this page watched it work is said once, with the way to undo it.
  // Once per change, whatever else is drawn again meanwhile: what says it is read as it is at that moment.
  const saying = useRef({ notify, undoClaude });
  useEffect(() => {
    saying.current = { notify, undoClaude };
  });
  useEffect(() => {
    if (changed) saying.current.notify("Claude made the change.", false, { label: "Undo", onPress: () => void saying.current.undoClaude(changed) });
  }, [changed]);
  // Asked before leaving edit mode with changes that would be lost.
  const [leaving, setLeaving] = useState(false);
  const copyForClaude = async (list: Comment[]) => {
    try {
      await navigator.clipboard.writeText(reviewPrompt(title, list, replies, commentsOf?.setupLabel));
      notify("Copied. Paste it into Claude Code");
    } catch {
      // Clipboard blocked: say nothing rather than claim a copy that didn't happen.
    }
  };
  const commenting = mode === "comment" && !!commentsOf;
  const [listOpen, setListOpen] = useState(false);
  const openCount = everything.filter((comment) => !comment.resolvedAt).length;
  // The panel keeps showing what it held while it closes.
  // The part picked: the element itself on a page the studio can read, or on one it can't (a live version, on another
  // address) the frame it is in and that page's own description of it, kept up to date by the page. Either way the
  // panel is given a description.
  const [target, setTarget] = useState<Element | null>(null);
  const [remote, setRemote] = useState<{ frame: HTMLIFrameElement; part: Part } | null>(null);
  // A part picked on a static copy (the canvas) is read with the tokens the copy was made with: it has no stylesheets of its own.
  const [copyTokens, setCopyTokens] = useState<Tokens | undefined>();
  const part = editing && target?.isConnected ? describePart(target, undefined, target.getRootNode() instanceof ShadowRoot ? copyTokens : undefined) : editing ? (remote?.part ?? null) : null;
  const remoteFrame = remote?.frame;
  const remoteSelector = remote?.part.selector;
  useEffect(() => {
    if (!remoteFrame || !remoteSelector) return undefined;
    const still = (now: { frame: HTMLIFrameElement; part: Part } | null) => now?.frame === remoteFrame && now.part.selector === remoteSelector;
    return followPart(remoteFrame, remoteSelector, (heard) => setRemote((now) => (still(now) ? (heard ? { frame: remoteFrame, part: heard } : null) : now)));
  }, [remoteFrame, remoteSelector]);
  // On the canvas it opens for an element selected there, and closes when that is let go of.
  // What an engineer picked (a design, or a section of its code) gets the side panel on the canvas, with or without an element to edit.
  const inspectShown = inspectInPanel && inspecting && showingFlow && !!inspectPanel;
  // Claude Code in the prototype's folder (see `scripts/terminal-server.mjs`). While it is open it has the panel to itself.
  const terminalSlug = givenComments?.slug ?? edit?.slug ?? null;
  const terminal = useTerminal(terminalSlug);
  // The terminal is beside the prototype or canvas, not only on the phone-sized windows it is never drawn on.
  const terminalShown = terminal.open && !bare;
  // Choosing an element in the prototype to tell Claude about (see `SelectLayer`): picking is the switch in the terminal's bar, the choice is
  // told to the helper, and `claudeWorking` is whether Claude is answering, which the choice's outline breathes to. All of it ends when the
  // terminal is closed, or when anything but looking at the prototype begins; it isn't offered on the canvas.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [claudeWorking, setClaudeWorking] = useState(false);
  const canSelect = terminalShown && mode === "view" && !showingFlow && !minimal;
  if (!canSelect && (selecting || selected || claudeWorking)) {
    setSelecting(false);
    setSelected(null);
    setClaudeWorking(false);
  }
  const told = useRef(false);
  useEffect(() => {
    if (!terminalSlug) return;
    if (selected) {
      sendSelection(terminalSlug, selected.line);
      told.current = true;
    } else if (told.current) {
      sendSelection(terminalSlug, null);
      told.current = false;
    }
  }, [terminalSlug, selected]);
  const panelOpen = (dev && !showingFlow) || (editing && showingFlow && !!part) || (commenting && (listing || showingFlow)) || inspectShown;
  const [panelKind, setPanelKind] = useState<"dev" | "edit" | "comments">("dev");
  const wantedKind = editing ? "edit" : dev ? "dev" : "comments";
  if (panelOpen && panelKind !== wantedKind) setPanelKind(wantedKind);
  // The comments are wider than the panels for editing and for dev mode.
  const panelWidth = panelKind === "comments" ? "w-[var(--comments-panel-width)]" : "w-[var(--dev-panel-width)]";
  // The frames the version is on screen in: the prototype's own, or on the canvas one a screen, and an edit is drawn in all of them (see `useEditSession`).
  const canvasBox = useRef<HTMLDivElement>(null);
  const editFrames = () => [...((showingFlow ? canvasBox.current : stage.current)?.querySelectorAll("iframe") ?? [])];
  // The screens drawn as copies are painted too, each through its own scoped document (see `copyDocument`).
  const editCopies = () => [...((showingFlow ? canvasBox.current : null)?.querySelectorAll<HTMLElement>("[data-copy]") ?? [])].flatMap((host) => (host.shadowRoot ? [copyDocument(host.shadowRoot)] : []));
  const session = useEditSession(url, editFrames, editCopies);
  // The bar of Cancel, undo, redo and Save is for a mode being worked in. On the canvas, picking an element is only looking at it: the bar comes once a change is made.
  const modeBar = commenting || (dev && !(editing && showingFlow && !session.edits.length));
  // A live version can always be edited: what is picked inside one of its design system's components is that component (see `setDesignSystem`). The names are there before the first pick, not after it.
  const liveSlug = edit?.live ? edit.slug : null;
  useEffect(() => {
    if (!liveSlug) return undefined;
    let stale = false;
    void designSystemOf(liveSlug).then((result) => {
      if (stale || !result.ok) return;
      setDesignSystem(result.value.names);
      // Screens copied before the names arrived have no components in them: they are read again.
      refreshCopies();
    });
    return () => {
      stale = true;
      setDesignSystem(null);
    };
  }, [liveSlug]);
  // While Selecting, clicks pick a part; while Interacting they go to the prototype, to move between screens.
  const [interacting, setInteracting] = useState(false);
  const show = (screen: FlowScreen) => {
    setOpened({ address: addressed, screen });
    // Starts it over even if that screen is already the one open, since the prototype may have moved on from it.
    setRestarts((count) => count + 1);
  };
  const { focus, ask, goTo } = useCommentFocus({
    flow,
    screen,
    show,
    setup: { variant: setupOnScreen, onSetup: showingVariants ? undefined : commentsOf?.onSetup, canShow: commentsOf?.canShow },
    everything,
    ready: !!url,
    onLinked: () => {
      changeMode("comment");
      setListing(!narrow);
    },
  });
  // Choosing a comment on another version opens that version, where it is then asked for like any other.
  const choose = (comment: Comment, key: string) => {
    if (key === commentsOf?.version) goTo(comment);
    else {
      commentsOf?.onVersion?.(key);
      ask(comment.id);
    }
  };
  // A note tapped on the canvas: the notes panel opens, with it selected.
  const openNote = (note: Comment) => {
    const wasPlacing = commenting && !peeking;
    changeMode("comment");
    setListing(false);
    setNoting(true);
    setPeeking(!wasPlacing);
    ask(note.id);
  };
  const addComment = async (text: string, anchor: Anchor, setup?: string, onDevice?: string, note?: boolean) => !!(await postComment(text, anchor, setup, onDevice ?? device.id, note));
  // The comment asked for is shown wherever it was left: its own setup may say less than the place it puts back.
  const asked = focus && !comments.some((item) => item.id === focus.id) ? everything.find((item) => item.id === focus.id) : undefined;
  const withAsked = asked ? [...comments, asked] : comments;
  // The prototype's own pins are the ones left on this device; the canvas tells its copies apart itself.
  const pinned = withAsked.filter((item) => !item.device || item.device === device.id);
  const commentsUi: CommentsUi | null =
    commentsOf && !dev
      ? { list: pinned, notes: notes.filter((item) => !item.device || item.device === device.id), noting, visible: !bare && (showPins || commenting), placing: commenting && !interacting && !peeking, peeking, onLeave: () => changeMode("view"), focus, onFocus: ask, replies, onAdd: addComment, onReply: replyToComment, onResolve: resolveComment, onLike: likeComment, onDelete: deleteComment, onEditNote: editNote, onOpenNote: openNote, onCopy: (comment) => void copyForClaude([comment]), onUndo: (reply, redo) => void undoClaude(reply, redo) }
      : null;
  const [seen, setSeen] = useState<{ url?: string; picked: Picked | null; motion: MotionSeen[] }>({ picked: null, motion: [] });
  const here = seen.url === url ? seen : { url, picked: null, motion: [] as MotionSeen[] };
  // ⌘Z undoes, ⇧⌘Z and ⌘Y redo, whether the focus is in the studio or in the prototype.
  const deselect = () => {
    setTarget(null);
    setRemote(null);
    setSeen((now) => ({ ...now, picked: null }));
  };
  // Counts restarts: a new key remounts the frame, which loads the same address afresh.
  const [restarts, setRestarts] = useState(0);
  const changeMode = (next: "view" | "dev" | "edit" | "comment") => {
    setListOpen(false);
    if (next !== "comment") {
      setListing(false);
      setNoting(false);
    }
    setPeeking(false);
    onMode(next);
  };

  const leaveMode = () => {
    deselect();
    session.discard();
    setInteracting(false);
    changeMode("view");
  };
  // Closing the canvas ends the editing that was going on in it: the page behind it is the prototype, not an edit mode left switched on. With changes that
  // aren't saved, it is asked first, and the canvas closes once they are let go of.
  const closingCanvas = useRef(false);
  // A live version has nothing to lose by leaving: each edit was written into its code as it was made, and what couldn't be written was said so then.
  const unsaved = !edit?.live && session.edits.length > 0;
  const closeCanvas = () => {
    if (editing && unsaved) {
      closingCanvas.current = true;
      setLeaving(true);
      return;
    }
    if (editing) leaveMode();
    onFlowOpen(false);
  };
  const exitMode = () => {
    // Edits not saved are asked about whichever mode is being left.
    if (unsaved) setLeaving(true);
    else leaveMode();
  };

  // On the canvas nobody chooses to edit: selecting an element there is what starts it, and letting go of it with
  // nothing changed is what ends it. With edits made, the mode stays until they are saved or cancelled.
  const letGo = () => {
    if (showingFlow && editing && !session.edits.length) leaveMode();
    else deselect();
  };
  // A part picked through a frame's page (the canvas; a live version): held as the element where the page can be read.
  // On a static copy there is no frame: `scope` is the copy, looked up the same way.
  const pickPart = (frame: HTMLIFrameElement | null, found: Part | null, scope?: Document | null) => {
    const doc = frame?.contentDocument ?? scope ?? null;
    const element = found && doc ? partIn(doc, found.selector) : null;
    if (!found || (!frame && !scope) || (doc && !element)) return letGo();
    setTarget(element);
    setCopyTokens(frame ? undefined : found.tokens);
    setRemote(element || !frame ? null : { frame, part: found });
    if (!editing) changeMode("edit");
  };

  const hotkey = (event: KeyboardEvent) => {
    // A dialog is asking something: its keys are its own.
    if (leaving) return;
    if (onBare && url && mode === "view") {
      if (event.key === "." && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        onBare(!bare);
        return;
      }
      if (event.key === "Escape" && bare) {
        onBare(false);
        return;
      }
    }
    if (commentsOf && url && !dev) {
      // Shift C and shift D hide and show the comments, and the notes for the developers, on the canvas.
      if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && showingFlow && ["c", "d"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === "c") setCommentsShown((now) => !now);
        else setNotesShown((now) => !now);
        return;
      }
      if (event.key.toLowerCase() === "c" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (commenting && !noting) changeMode("view");
        // Commenting only: the list beside the prototype is opened from the comment button, not from the key.
        else {
          changeMode("comment");
          setNoting(false);
        }
        return;
      }
      // D is a note for the developers, on the canvas: the same, with what is placed a note.
      if (event.key.toLowerCase() === "d" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && showingFlow && !minimal) {
        event.preventDefault();
        if (commenting && noting) changeMode("view");
        else {
          changeMode("comment");
          setListing(false);
          setNoting(true);
        }
        return;
      }
      if (event.key === "Escape" && commenting) {
        exitMode();
        return;
      }
    }
    // Escape never closes the canvas. What is selected on it lets go first (which is the canvas's own), then a part picked to edit, then
    // edit mode itself; comment mode is left above.
    if (event.key === "Escape" && showingFlow && editing) {
      event.preventDefault();
      event.stopPropagation();
      if (part) letGo();
      else exitMode();
      return;
    }
    if (mode === "view" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // On the canvas F is the frame tool, not full screen.
      if (event.key.toLowerCase() === "f" && url && !showingFlow) {
        event.preventDefault();
        onFullscreen(!fullscreen);
        return;
      }
      if (event.key.toLowerCase() === "r" && url && !showingFlow && !minimal) {
        // Starts the prototype over at the address on screen, so the version, variant and settings stay as they are.
        event.preventDefault();
        setRestarts((count) => count + 1);
        return;
      }
      if (event.key === "Escape" && fullscreen) {
        onFullscreen(false);
        return;
      }
    }
    if (event.key === "Escape" && dev) {
      // With a part picked, Escape only lets go of it; the prototype never sees the key.
      if (part || here.picked) {
        event.preventDefault();
        event.stopPropagation();
        letGo();
      } else {
        // Nothing picked: Escape leaves the mode, asking first if there are edits that would be lost.
        exitMode();
      }
      return;
    }
    if (!editing || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    if (key === "y" || event.shiftKey) session.redo();
    else session.undo();
  };
  const hotkeyRef = useRef(hotkey);
  useEffect(() => {
    hotkeyRef.current = hotkey;
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      // Typing a paragraph keeps the browser's own undo. Every other control in the panel (a number, a colour, a
      // dropdown, a tick) holds one value that is committed as it changes, so ⌘Z there undoes the edit it made.
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === "TEXTAREA")) return;
      // Escape in a text or number field of a panel: the field is let go of and the key goes on, so one press closes the panel as it does anywhere else.
      if (event.key === "Escape" && target?.tagName === "INPUT" && !target.closest("[data-native-undo]")) target.blur();
      else if (target && ["INPUT", "SELECT"].includes(target.tagName)) {
        // Only ⌘Z and ⌘Y are ours, and not in a field where a name is being typed.
        const undoKey = (event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase());
        if (!undoKey || target.closest("[data-native-undo]")) return;
        target.blur();
      }
      hotkeyRef.current(event);
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);

  const inspect = {
    onKey: hotkey,
    onEdit: (element: Element) => {
      if (editing) editInPlace(element as HTMLElement, (text) => session.setText(describePart(element), text));
    },
    onPick: (picked: Picked, element: Element) => {
      setSeen({ ...here, url, picked });
      setTarget(element);
    },
    onMotion: (entry: MotionSeen) => setSeen((now) => ({ ...(now.url === url ? now : { url, picked: null, motion: [] }), url, motion: [...(now.url === url ? now.motion : []), entry].slice(-30) })),
  };

  const newTab = openUrl && screen ? withParams(openUrl, screen.params) : (openUrl ?? url);

  const stage = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<{ width: number; height: number; left: number } | null>(null);
  // The stage with its padding: the window's size in full screen, which doesn't change when the padding does.
  const [whole, setWhole] = useState<{ width: number; height: number } | null>(null);
  // On a phone it is a preview, not a place to work: always scaled to fit the
  // screen, with no picking a size. It is sized once, when it loads, and left:
  // Safari resizes the window as the address bar slides away while scrolling,
  // and redrawing the prototype for every step of that is slow.
  const narrow = useMediaQuery("(max-width: 639px)");
  // A desktop is wide enough to run under the options panel (2rem in, 15rem wide, 1rem clear: 18rem), so while it is open the stage keeps that much to its left, and the frame is fitted to what is left of it. A phone or tablet is narrow enough to stay clear, and stays centred.
  const clearOfSide = !!side && sideOpen && !showingFlow && !bare && device.kind === "desktop" && !narrow;
  // How the stage's width will be once its padding has moved: the frame is fitted to that straight away, so while the padding glides the frame glides with it instead of chasing a width that changes every frame.
  const fitWidth = (width: number, left: number) => (narrow ? width : width + left - (clearOfSide ? STAGE_PAD_SIDE : STAGE_PAD));
  const [sideFor, setSideFor] = useState(clearOfSide);
  const [sideMoving, setSideMoving] = useState(false);
  if (sideFor !== clearOfSide) {
    setSideFor(clearOfSide);
    setSideMoving(true);
  }
  useEffect(() => {
    if (!sideMoving) return undefined;
    const timer = window.setTimeout(() => setSideMoving(false), SIZING_MS);
    return () => window.clearTimeout(timer);
  }, [sideMoving, sideFor]);
  // On a phone or tablet the new window gets the long-press comment script; on a desktop it is the plain prototype.
  const touch = useMediaQuery("(pointer: coarse)");
  const openWithComments = (href: string) => {
    // Opened now, while the tap still counts as a gesture, and pointed at the address once its token has arrived.
    const opened = window.open("", "_blank");
    const address = new URL(href, window.location.href).href;
    void import("@/components/prototype/phone-qr").then(({ withToken }) => withToken(address, new Map())).then(
      (tokened) => (opened ? (opened.location.href = tokened) : window.open(tokened, "_blank")),
      () => (opened ? (opened.location.href = address) : undefined),
    );
  };
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const left = parseFloat(getComputedStyle(element).paddingLeft) || 0;
      setSpace((now) => (narrow && now ? now : { width, height, left }));
      const box = entry.borderBoxSize?.[0];
      setWhole({ width: box?.inlineSize ?? element.offsetWidth, height: box?.blockSize ?? element.offsetHeight });
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [narrow]);
  // Measured on the client only, so no frame is drawn on the server.
  // Full screen is the whole window, whichever device was being looked at: the page laid out at the window's own size,
  // filling the stage. A phone or tablet frame grows into it and shrinks back on the way out (see `sizing`).
  const fill = bare && !showingFlow && !!whole;
  const shown = fill ? { ...device, width: whole.width, height: whole.height } : device;
  // An app's bars, in the device's own pixels: only a phone is opened in one, and full screen is the window itself.
  const barsK = device.width / inApp.width;
  // Safari's bar shrinks while the page is scrolled down; a page the studio can't read never says, so it stays full.
  const [scrolledDown, setScrolledDown] = useState(false);
  const drawn = barsOf(inApp, device, scrolledDown);
  const bars = device.kind === "phone" && inApp.id !== "none" && !fill ? { top: drawn.top * barsK, bottom: drawn.bottom * barsK } : null;
  const live = fill
    ? 1
    : space
    ? fit || narrow
      ? Math.min(fitWidth(space.width, space.left) / device.width, space.height / device.height)
      : zoom
    : null;

  // Dragging an edge of the frame picks the device whose frame is nearest the width the pointer has reached, so the
  // size jumps between mobile, tablet and desktop rather than following the pointer anywhere. It is drawn as it would be.
  // A change of device, or into or out of full screen, is animated: the frame's box and the prototype in it change size
  // together, so it is seen being resized. Only then; the window being resized, or a zoom step, follows at once.
  const sized = `${device.id}:${fill}`;
  const [sizedFor, setSizedFor] = useState(sized);
  const [sizing, setSizing] = useState<Sizing>(false);
  const changing = sizedFor !== sized;
  if (changing) {
    setSizedFor(sized);
    setSizing(sizedFor.startsWith(`${device.id}:`) ? "fill" : "device");
  }
  // Leaving full screen, the stage shrinks back over the same moment, and a scale fitted to it would be a different
  // number every frame: the frame would chase it and arrive late, off to one side of its box. So it heads straight for
  // the scale it had before, which is where the stage is going, and follows the stage again once it has landed.
  const [rest, setRest] = useState<number | null>(null);
  if (!fill && !sizing && !changing && live && rest !== live) setRest(live);
  const scale = !fill && sizing === "fill" && rest ? rest : live;
  useEffect(() => {
    if (!sizing) return undefined;
    const timer = window.setTimeout(() => setSizing(false), SIZING_MS);
    return () => window.clearTimeout(timer);
  }, [sizing, sizedFor]);
  const scaleOf = (candidate: Device) => (space ? (fit || narrow ? Math.min(fitWidth(space.width, space.left) / candidate.width, space.height / candidate.height) : zoom) : null);
  const anchors = [device.kind === "phone" ? device : DEFAULT_DEVICE, ...DEVICES.filter((candidate) => candidate.kind !== "phone")];
  const widthOf = (candidate: Device) => candidate.width * (scaleOf(candidate) ?? 1);
  // Dragging an edge picks the device whose frame is nearest the width the pointer has reached, as it goes: the size jumps
  // between mobile, tablet and desktop rather than following the pointer anywhere, and each jump is played.
  const pickWidth = (wanted: number) => {
    const nearest = anchors.reduce((best, candidate) => (Math.abs(widthOf(candidate) - wanted) < Math.abs(widthOf(best) - wanted) ? candidate : best));
    if (nearest.id !== device.id) onDevice?.(nearest);
  };
  const stepDevice = (direction: 1 | -1) => {
    const here = anchors.findIndex((candidate) => candidate.kind === device.kind);
    const next = anchors[here + direction];
    if (next) onDevice?.(next);
  };

  // The comment buttons: in the bar on a wider screen, under the prototype on a phone, and on the canvas in its own bar at the foot (`inBar`).
  const commentButtons = (inBar: boolean) =>
    commentsOf ? (
      <>
        {comments.length && !minimal ? (
          <IconButton label={showPins ? "Hide comments" : "Show comments"} variant={inBar ? "ghost" : undefined} tooltipSide={inBar ? "above" : undefined} onClick={() => setShowPins(!showPins)}>
            {showPins ? <EyeIcon /> : <EyeOffIcon />}
          </IconButton>
        ) : null}
        {inBar && !minimal ? (
          <IconButton label="Note for developers (D)" variant="ghost" tooltipSide="above" onClick={() => { changeMode("comment"); setListing(false); setNoting(true); }}>
            <NoteIcon />
          </IconButton>
        ) : null}
        <IconButton label="Comment (C)" variant={inBar ? "ghost" : undefined} tooltipSide={inBar ? "above" : undefined} onClick={() => { changeMode("comment"); setListing(true); setNoting(false); }}>
          <CommentIcon />
          {openCount ? openCount : null}
        </IconButton>
      </>
    ) : null;
  const pinButtons = commentButtons(false);

  // Claude Code in the prototype's folder (see `scripts/terminal-server.mjs`), as a column on the right. Only where it can start, and not on a phone or a share page.
  const terminalToggle = (variant?: "ghost") =>
    terminal.available && !minimal ? (
      <span className="max-sm:hidden">
        <IconButton variant={variant} label={terminal.open ? "Close Claude" : "Open Claude"} tooltipSide="below" tooltipAlign="end" aria-pressed={terminal.open} className={terminal.open ? controlOn : undefined} onClick={terminal.toggle}>
          <TerminalIcon />
        </IconButton>
      </span>
    ) : null;
  // A design QA is never shared: its place in the bar is a way to open it in a browser tab at once.
  const shareControl = share ? (
    share.slug.startsWith("qa-") && newTab ? (
      <IconButton href={newTab} external label="Open in browser" tooltipAlign="end">
        <ExternalIcon />
      </IconButton>
    ) : (
      <ShareMenu {...share} stage={stage} newTab={newTab} onOpenNew={touch && newTab ? () => openWithComments(newTab) : undefined} />
    )
  ) : null;

  /** What the side panel holds: what an engineer picked, the edit panel, the comments, or dev mode's. On the canvas it is in the card with the zoom and share. */
  const panelBody = (
    <>
      {inspectShown ? inspectPanel : null}
          {inspectShown && !(editing && part) ? null : panelKind === "edit" && edit ? (
            <EditPanel part={part} session={session} slug={edit.slug} />
          ) : panelKind === "comments" && noting ? (
            <NotesPanel notes={notes} selectedId={focus?.id ?? null} onSelect={ask} onDelete={deleteComment} />
          ) : panelKind === "comments" ? (
            <CommentsPanel groups={groups} currentKey={commentsOf?.version ?? ""} setupLabel={commentsOf?.setupLabel} replies={allReplies} selectedId={focus?.id ?? null} error={commentsError} onSelect={choose} onResolve={resolveComment} onDelete={deleteComment} onCopy={copyForClaude} />
          ) : (
            <div className="p-4">
              <DevPanel picked={here.picked} motion={here.motion} />
            </div>
          )}
    </>
  );

  // A set height, the window's on a wide screen: a bigger phone scrolls inside the tile instead of stretching the page.
  return (
    <div className={`relative flex w-full gap-4 lg:h-full ${bare ? "h-dvh" : "h-[var(--frame-height)]"}`}>
    <div
      // Clicking the tile around the phone lets go of what was picked, unless it was a button that was pressed. A click inside the prototype never reaches here.
      // On the canvas that is the canvas's own to decide: a click there may be the picking itself.
      onClick={(event) => dev && !showingFlow && !(event.target as Element).closest("button, a") && deselect()}
      className={`relative flex min-w-0 flex-1 flex-col rounded-[var(--r-tile)] bg-tile transition-[border-radius] duration-[var(--dur-standard)] ease-[var(--curve-standard)] max-sm:rounded-none ${bare || showingFlow ? "" : "max-sm:px-6 max-sm:pb-14 max-sm:pt-8"} ${fullscreen || (minimal && showingFlow) ? (terminalShown ? "lg:rounded-l-none" : "lg:rounded-none") : ""}`}
    >
      {/* Before the bar, at the same level, so the bar's menus (version, share) open over it. */}
      {SHOW_COMPONENTS && showingFlow && !minimal && componentsSeen && !dev && !commenting && !bare ? (
        // Floats over the canvas and takes a press only on the panel itself.
        <div inert={uiHidden} className={`pointer-events-none absolute bottom-8 top-24 z-[var(--z-raised)] flex w-72 flex-col transition-[left,opacity] duration-[var(--dur-standard)] ease-[var(--curve-standard)] max-sm:hidden ${layersOpen ? "left-[17rem]" : "left-8"} ${uiHidden ? "opacity-0" : ""}`}>
          <div
            inert={!componentsOpen}
            className={`min-h-0 w-full flex-1 origin-top-left transition-[opacity,scale] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${
              componentsOpen ? "pointer-events-auto" : "pointer-events-none scale-95 opacity-0"
            }`}
          >
            <ComponentsPanel open={componentsOpen} />
          </div>
        </div>
      ) : null}
      {side && !showingFlow ? (
        // Only the panel takes a press: the column around it is the prototype's. Its button is in the bar.
        <div className="pointer-events-none absolute bottom-8 left-8 top-24 z-[var(--z-raised)] flex w-60 flex-col max-sm:hidden">
          <div
            inert={!sideOpen}
            className={`min-h-0 w-full origin-top-left overflow-y-auto transition-[opacity,scale] duration-[var(--dur-standard)] ease-[var(--curve-standard)] [scrollbar-width:thin] ${
              sideOpen ? "pointer-events-auto" : "pointer-events-none scale-95 opacity-0"
            }`}
          >
            {side}
          </div>
        </div>
      ) : null}
      {/* Once per person: the canvas is new, and a card from the corner says so. */}
      {url && addressed && !bare ? <CanvasIntro quiet={showingFlow} always={minimal && ALWAYS_ON_SHARE_LINKS} onOpen={() => { if (!(minimal && ALWAYS_ON_SHARE_LINKS)) markCanvasHintSeen(); onFlowOpen(true); }} /> : null}
      {/* The bar lies over the top of the canvas: only its controls take a press, so a screen or button under the gaps between them can still be used. */}
      <div key={modeBar ? "mode" : "view"} inert={uiHidden && showingFlow} style={bare ? { display: "none" } : undefined} className={`${uiHidden && showingFlow ? "!opacity-0 " : ""}transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] bar-in pointer-events-none relative z-[var(--z-raised)] grid *:pointer-events-auto min-h-16 items-center gap-3 max-sm:mb-2 max-sm:grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] sm:px-8 sm:py-8`}>
        {modeBar ? (
          // Editing, dev or comment mode is the only thing going on: a way out, how clicks behave, and (editing) undo, redo and Save.
          <>
            <IconButton onClick={exitMode} className={`justify-self-start ${(commenting || editing) && showingFlow ? "sm:hidden" : ""}`}>
              {editing || commenting ? "Cancel" : "Exit"}
            </IconButton>
            {/* Not while editing on the canvas: a screen there is selected in, never used. */}
            <div className={`justify-self-center ${commenting ? (showingFlow ? "sm:hidden" : "") : dev && showingFlow ? "hidden" : "hidden sm:block"}`}>
              <Toggle
                label="Clicking"
                value={interacting ? "interact" : "select"}
                onChange={(next) => setInteracting(next === "interact")}
                options={[
                  { id: "select", label: commenting ? "Comment" : "Select", showLabel: true },
                  { id: "interact", label: "Interact", showLabel: true },
                ]}
              />
            </div>
            <div className="[grid-column:3] justify-self-end">
              {editing && edit && !showingFlow ? <EditBar
                  session={session}
                  slug={edit.slug}
                  baseVersionId={edit.versionId}
                  variantId={edit.variantId}
                  versionOnly={showingFlow}
                  live={edit.live}
                /> : null}
              {commenting ? (
                <>
                  <span className="sm:hidden">
                    <IconButton label="Comments" onClick={() => setListOpen(true)}>
                      <CommentIcon />
                      {openCount ? openCount : null}
                    </IconButton>
                  </span>
                  <span className={`hidden ${showingFlow ? "" : "sm:block"}`}>
                    <IconButton label={listing ? "Hide the list" : "Show the list"} aria-pressed={listing} onClick={() => setListing(!listing)} className={listing ? controlOn : ""}>
                      <CommentIcon />
                      {openCount ? openCount : null}
                    </IconButton>
                  </span>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {/* On the left, the version and how it is looked at; in the middle, the phone it is shown on; on the right, what to do with it. */}
            <div className={`flex min-w-0 items-center gap-2 justify-self-start max-sm:contents ${showingFlow ? "sm:hidden" : ""}`}>
              <div className="max-sm:[grid-area:1/1]">{leading}</div>
              {side && !showingFlow ? (
                <span className="max-sm:hidden">
                  <IconButton label={sideOpen ? "Hide options" : "Show options"} aria-expanded={sideOpen} tooltipAlign="start" onClick={() => setSideOpen((now) => !now)} className={sideOpen ? controlOn : ""}>
                    <SlidersIcon />
                  </IconButton>
                </span>
              ) : null}
              {url && addressed ? (
                showingFlow ? (
                  <IconButton onClick={closeCanvas}>Close canvas</IconButton>
                ) : (
                  <div className="relative max-sm:hidden">
                    <IconButton
                      label="Canvas"
                      onClick={() => {
                        markCanvasHintSeen();
                        onFlowOpen(true);
                      }}
                    >
                      <FlowIcon />
                    </IconButton>
                  </div>
                )
              ) : null}
              {docs && url && addressed && !showingFlow ? <span className="max-sm:hidden">{docs}</span> : null}
              {handoff && url && !showingFlow ? (
                <div className="relative max-sm:hidden">
                  <IconButton label={handoff.label} aria-haspopup="dialog" onClick={handoff.onOpen}>
                    <CodeIcon />
                  </IconButton>
                  <Dot tone={handoff.tone} hollow={handoff.hollow} className="pointer-events-none absolute right-1.5 top-1.5" />
                </div>
              ) : null}
            </div>
            {/* Picking a phone makes no sense on a phone. */}
            <div className={`hidden justify-self-center ${showingFlow ? "" : "sm:block"}`}>
              {showingFlow ? (
                <div className="flex items-center gap-6">
                  {flow && variants ? (
                    <div className="flex items-center gap-2" role="group" aria-label="Canvas">
                      {(["flow", "variants"] as const).map((kind) => (
                        <IconButton key={kind} aria-pressed={(showingVariants ? "variants" : "flow") === kind} onClick={() => setCanvasKind(kind)} className={(showingVariants ? "variants" : "flow") === kind ? controlOn : ""}>
                          {kind === "flow" ? "Flow" : "Variants"}
                        </IconButton>
                      ))}
                    </div>
                  ) : null}
                  {/* The devices the screens are shown on, each switched on or off on its own: one always stays on. */}
                  <div className="flex items-center gap-2" role="group" aria-label="Devices">
                    {DEVICES.map((option) => {
                      const on = canvasOn.ids.includes(option.id);
                      const Icon = deviceIcons[option.id];
                      return (
                        <IconButton
                          key={option.id}
                          label={option.name}
                          aria-pressed={on}
                          // The last one on stays on.
                          aria-disabled={on && canvasOn.ids.length === 1}
                          onClick={() => toggleDevice(option.id)}
                          className={on ? controlOn : ""}
                        >
                          <Icon />
                        </IconButton>
                      );
                    })}
                  </div>
                  <IconButton label="Show the fold" aria-pressed={fold} onClick={() => setFold((now) => !now)} className={fold ? controlOn : ""}>
                    <FoldIcon />
                  </IconButton>
                </div>
              ) : (
                center?.({ scale })
              )}
            </div>
            {/* On a phone, the variants sit in the middle of the first row, where a wider screen has the phone picker. */}
            {bottom ? <div className="justify-self-center sm:hidden max-sm:[grid-area:1/2]">{bottom}</div> : null}
            {url ? (
              <div className={`flex items-center gap-2 [grid-column:3] justify-self-end max-sm:contents ${showingFlow ? "sm:hidden" : ""}`}>
                {pinButtons && !showingFlow ? <div className="flex items-center gap-2 max-sm:hidden">{pinButtons}</div> : null}
                {minimal && onOpenPrototype && !fullscreen ? (
                  <span className="hidden lg:block">
                    <IconButton label="Open the prototype" tooltipAlign="end" onClick={onOpenPrototype}>
                      <ExternalIcon />
                    </IconButton>
                  </span>
                ) : null}
                {showingFlow ? (
                  <span className="max-sm:hidden">
                    <CanvasZoomMenu />
                  </span>
                ) : null}
                {showingFlow ? (
                  <span className="max-sm:hidden">
                    <CanvasPlayButton />
                  </span>
                ) : null}
                {shareControl ? <div className="max-sm:justify-self-end max-sm:[grid-area:1/3]">{shareControl}</div> : null}
                <span className={`hidden ${showingFlow ? "" : "lg:block"}`}>
                  <IconButton
                    label={fullscreen ? "Exit full screen (F)" : "Full screen (F)"}
                    tooltipAlign="end"
                    aria-pressed={fullscreen}
                    className={fullscreen ? controlOn : undefined}
                    onClick={() => onFullscreen(!fullscreen)}
                  >
                    <ExpandIcon />
                  </IconButton>
                </span>
                {showingFlow ? null : terminalToggle()}
              </div>
            ) : null}
          </>
        )}
      </div>


      <div
        ref={stage}
        className={`flex min-h-0 flex-1 overflow-auto px-0 [scrollbar-width:thin] sm:px-8 sm:pb-10 ${fill ? "!p-0" : bare ? "pt-10" : ""} ${clearOfSide ? "sm:!pl-[288px]" : ""} ${sideMoving ? "transition-[padding] duration-[var(--dur-standard)] ease-[var(--curve-spatial)]" : ""} pb-0 ${showingFlow ? "invisible" : ""}`}>
        {/* Clipped, not hidden: below 100% the frame's full-size layout box sticks out of this one, and a hidden box can still be scrolled by the prototype (a modal taking focus), which slid the whole phone sideways in Safari. A clipped box can't be scrolled at all. */}
        <div
          style={fill ? { width: "100%", height: "100%" } : scale ? { width: device.width * scale, height: device.height * scale } : { aspectRatio: `${device.width} / ${device.height}` }}
          className={`relative m-auto shrink-0 ${scale ? "" : "h-full"} ${sizingClass(sizing || (sideMoving ? "device" : false))}`}
        >
        {onDevice && !narrow && !showingFlow && !bare ? (
          <>
            <ResizeHandle side="left" onWidth={pickWidth} onStep={stepDevice} />
            <ResizeHandle side="right" onWidth={pickWidth} onStep={stepDevice} />
          </>
        ) : null}
        <div
          className={`relative isolate size-full overflow-clip bg-surface [transform:translateZ(0)] ${
            fill ? "" : device.kind === "phone" ? "rounded-[var(--r-device)]" : "rounded-[var(--r-lg)]"
          }`}
        >
          {url ? (
            <FrameBody
              // Keyed by path, not query: a changed setup reloads the frame in place under the picture already there, rather than starting over at the skeleton.
              key={`${url.split("?")[0]}#${restarts}`}
              url={url}
              title={title}
              poster={screen || bars ? undefined : poster}
              scale={scale}
              device={shown}
              inset={bars}
              onScrolled={setScrolledDown}
              fill={fill}
              sizing={sizing || (sideMoving ? "device" : false)}
              // Behind the canvas nothing is picked in it: the canvas does its own picking.
              inspect={dev && !showingFlow ? { ...inspect, picking: !interacting } : null}
              // A page on another address (a live version) can't be picked from inside: it is asked, through the studio's own layer over it.
              across={editing && !interacting && !showingFlow ? { part, onPick: pickPart, onText: session.setText } : null}
              select={canSelect ? { picking: selecting, selected, pulse: claudeWorking, onSelect: setSelected, onExit: () => setSelecting(false) } : null}
              onKey={(event) => hotkeyRef.current(event)}
              comments={showingFlow ? null : commentsUi}
              onPlace={onPlace}
            />
          ) : (
            <div className="grid size-full place-items-center">
              <p className="max-w-[30ch] px-6 text-center text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
                No files for this version. Push one from Claude Code with{" "}
                <span className="text-foreground-muted">/push</span>.
              </p>
            </div>
          )}
          {scale && bars ? (
            <>
              <InAppChrome app={inApp} minimized={scrolledDown} compact={!!device.homeButton} height={drawn.top} k={(device.width * scale) / inApp.width} edge="top" />
              <InAppChrome app={inApp} minimized={scrolledDown} compact={!!device.homeButton} height={drawn.bottom} k={(device.width * scale) / inApp.width} edge="bottom" />
            </>
          ) : null}
        </div>
        </div>
      </div>


      {corner && mode === "view" && !showingFlow && !bare ? (
        // Only for a phone: it slides slightly right and fades as the frame becomes a tablet or desktop, and back again, as part of the same change.
        <div
          inert={device.kind !== "phone"}
          className={`absolute bottom-10 right-10 z-[var(--z-raised)] hidden transition-[translate,opacity] duration-[var(--dur-standard)] ease-[var(--curve-spatial)] sm:block ${
            device.kind === "phone" ? "" : "translate-x-3 opacity-0"
          }`}
        >
          {corner}
        </div>
      ) : null}

      {/* On a phone, how it is looked at and the comments sit under the prototype, centred. */}
      {mode === "view" && url && !showingFlow && !bare ? (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 sm:hidden">
          {pinButtons}
        </div>
      ) : null}

      {(showingFlow || (canvasKey && warmKey === canvasKey)) && canvas && addressed ? (
        <div ref={canvasBox} inert={!showingFlow} className={`absolute inset-0 transition-[border-radius] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${showingFlow ? "" : "pointer-events-none invisible"} ${terminalShown ? "overflow-hidden rounded-r-[var(--r-tile)]" : ""}`}>
          <FlowCanvas
            viewOnly={minimal}
            // The website's components, with the text and image tools at the foot.
            layersOpen={layersOpen}
            onLayersOpen={setLayersOpen}
            topLeft={
              <>
                {commenting ? <IconButton variant="ghost" onClick={exitMode}>Done</IconButton> : null}
                <IconButton variant="ghost" label="Close canvas" tooltipSide="below" tooltipAlign="start" onClick={closeCanvas}>
                  <CloseIcon />
                </IconButton>
                {leading}
                {!minimal ? (
                  <IconButton variant="ghost" label={layersOpen ? "Hide layers" : "Show layers"} tooltipSide="below" aria-expanded={layersOpen} onClick={() => setLayersOpen((now) => !now)} className={layersOpen ? controlOn : ""}>
                    <SidebarIcon />
                  </IconButton>
                ) : null}
              </>
            }
            // Whatever the side panel holds (the edit panel, the comments, what an engineer picked): in the same card as the zoom and share.
            deviceChoice={chosenDevices}
            onDeviceChoice={keepDevices}
            sideFull={commenting}
            sidePanel={panelOpen ? <div className={panelWidth}>{panelBody}</div> : undefined}
            focusFind={focusFind}
            editHistory={editing && edit ? <EditHistory session={session} /> : undefined}
            topRight={
              <>
                {/* Editing on the canvas: undo and redo, and saving a version when there is one to save, sit with the zoom. */}
                {editing && edit ? <EditBar session={session} slug={edit.slug} baseVersionId={edit.versionId} variantId={edit.variantId} versionOnly live={edit.live} history={false} /> : null}
                {minimal && onOpenPrototype && !fullscreen ? (
                  <IconButton variant="ghost" label="Open the prototype" tooltipSide="below" tooltipAlign="end" onClick={onOpenPrototype}>
                    <ExternalIcon />
                  </IconButton>
                ) : null}
                <CanvasViewMenu
                  devices={DEVICES}
                  on={canvasOn.ids}
                  onDevice={toggleDevice}
                  kind={flow && variants ? (showingVariants ? "variants" : "flow") : undefined}
                  onKind={setCanvasKind}
                  fold={fold}
                  onFold={() => setFold((now) => !now)}
                />
                <CanvasZoomMenu ghost />
                <CanvasPlayButton />
                {shareControl}
                {terminalToggle("ghost")}
              </>
            }
            uiHidden={uiHidden && showingFlow}
            tools={!minimal ? (
              <>
                {SHOW_COMPONENTS ? (
                  <IconButton label={componentsOpen ? "Hide components" : "Show components"} variant="ghost" tooltipSide="above" aria-expanded={componentsOpen} onClick={toggleComponents} className={componentsOpen ? controlOn : ""}>
                    <ComponentIcon />
                  </IconButton>
                ) : null}
              </>
            ) : undefined}
            // The comment buttons sit in the canvas's own bar at the foot.
            bar={commentsOf ? commentButtons(true) : undefined}
            fold={fold}
            inspect={handoffInspect}
            sheet={handoffSheet}
            // The variants canvas marks the designs that were handed off; a flow of steps is one design, so every step.
            ready={readyForDev ? (canvas.setups ? (id: string) => readyForDev.includes(id) : () => true) : undefined}
            // The two canvases are different layouts of different screens, so each starts afresh.
            key={canvas.setups ? "variants" : "flow"}
            flow={canvas.flow}
            setups={canvas.setups}
            base={addressed.split("?")[0]}
            cloud={commentsOf ? { slug: commentsOf.slug, version: commentsOf.version } : undefined}
            device={device}
            devices={canvasDevices}
            controls={center}
            zoom={zoom}
            fit={fit}
            inApp={inApp}
            // Closed, it isn't looking for pins.
            // The pins are on the canvas whenever it is open, not only while commenting: the eye switch is for the prototype itself.
            comments={showingFlow && commentsUi ? { ...commentsUi, visible: true, list: commentsShown || commenting ? (canvas.setups ? everything : withAsked) : [], notes: notesShown || commenting ? commentsUi.notes : [] } : undefined}
            // Wherever the version can be edited, and nothing else is going on: not on a share page or a phone, nor on a live version (no `edit`).
            picking={showingFlow && edit && !minimal && !narrow && !bare && (mode === "view" || editing) ? { target: part, onPick: pickPart, onText: session.setText, busy: editing && (session.edits.length > 0 || session.canUndo || session.canRedo), onPage: session.redraw } : undefined}
          />
        </div>
      ) : null}
      {showingFlow && inspectPanel && !inspectInPanel ? <div className="absolute bottom-4 right-4 top-26 z-[var(--z-raised)] hidden w-[var(--dev-panel-width)] sm:block">{inspectPanel}</div> : null}
    </div>

    {/* Its own panel beside the prototype, as tall as it without making it taller; over the canvas, which it never narrows, and starting below the bar so its buttons stay clear. It stays mounted so it can open and close. */}
    <div
      inert={!panelOpen}
      className={`hidden transition-[width,margin,visibility] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${showingFlow ? "" : "sm:block"} ${
        showingFlow ? `absolute bottom-4 right-4 top-26 z-[var(--z-raised)] ${panelWidth}` : "relative shrink-0"
      } ${
        // Hidden outright once it has gone, not only moved out of sight.
        panelOpen ? (showingFlow ? "" : panelWidth) : showingFlow ? "invisible" : "invisible -ml-4 w-0"
      }`}
    >
      {/* It slides in a short way (24px) from the right and fades in as the space opens for it, at the same pace as the left column goes. */}
      <div
        className={`absolute inset-y-0 right-0 ${panelWidth} overflow-y-auto rounded-[var(--r-tile)] ${showingFlow ? "border border-border bg-surface-elevated shadow-floating" : `bg-tile ${fullscreen ? "lg:rounded-none" : ""}`} transition-[translate,opacity] duration-[var(--dur-standard)] ease-[var(--curve-standard)] [scrollbar-width:thin] ${
          // With reduced motion it only fades: the travel is left out.
          panelOpen ? "" : "translate-x-6 opacity-0 motion-reduce:translate-x-0"
        }`}
      >
        {panelBody}
      </div>
    </div>


    {/* Claude Code in the prototype's folder: a column of its own on the right, for the canvas and the prototype alike, with a grip to resize it. Not when only the prototype is on screen. */}
    {terminalSlug && terminal.available ? <TerminalDock slug={terminalSlug} open={terminalShown} onStop={terminal.stop} square={fullscreen} select={canSelect ? { picking: selecting, onPicking: setSelecting, chip: selected?.chip ?? null, onClear: () => setSelected(null), onWorking: setClaudeWorking } : null} /> : null}

    {/* On a phone the list is a sheet over the prototype. */}
    <MotionSheet open={narrow && listOpen} onClose={() => setListOpen(false)} label="Comments">
      <div className="flex flex-col gap-2 pb-4">
        <CommentsPanel
          groups={groups}
          currentKey={commentsOf?.version ?? ""}
          setupLabel={commentsOf?.setupLabel}
          replies={allReplies}
          selectedId={focus?.id ?? null}
          error={commentsError}
          onSelect={(comment, key) => {
            choose(comment, key);
            setListOpen(false);
          }}
          onResolve={resolveComment}
         
          onDelete={deleteComment}
          onCopy={copyForClaude}
        />
      </div>
    </MotionSheet>

    {leaving ? (
      <DialogForm
        title="Leave without saving?"
        description="Your changes will be discarded."
        submitLabel="Leave"
        destructive
        onClose={() => {
          closingCanvas.current = false;
          setLeaving(false);
        }}
        onSubmit={() => {
          leaveMode();
          if (closingCanvas.current) onFlowOpen(false);
          closingCanvas.current = false;
        }}
      />
    ) : null}
    </div>
  );
}

/** Tells `told` each time a document's query changes without it loading again: its own history, written or gone back through. */
function watchPlace(win: Window, told: (search: string) => void) {
  const { history } = win;
  const { pushState, replaceState } = history;
  let last = win.location.search;
  const check = () => {
    if (win.location.search === last) return;
    last = win.location.search;
    told(last);
  };
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    pushState.apply(history, args);
    check();
  };
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    replaceState.apply(history, args);
    check();
  };
  win.addEventListener("popstate", check);
  return () => {
    try {
      history.pushState = pushState;
      history.replaceState = replaceState;
      win.removeEventListener("popstate", check);
    } catch {
      // The frame has since gone to another origin (Safari, a dev server); there is nothing left to undo.
    }
  };
}

/** Remounted per url, so every version starts from the skeleton. */
function FrameBody({
  url,
  title,
  poster,
  scale,
  device,
  inset,
  onScrolled,
  fill,
  sizing,
  inspect,
  across,
  select,
  onKey,
  comments,
  onPlace,
}: {
  url: string;
  title: string;
  poster?: string;
  scale: number | null;
  device: Device;
  /** Page height an app's bars take at the top and bottom, in the device's own pixels; the prototype is laid out in what is left. */
  inset: { top: number; bottom: number } | null;
  /** Told whether the page has been scrolled down (and not back up since), for an app bar that shrinks. */
  onScrolled: (down: boolean) => void;
  /** Full screen: the prototype is the size of its frame, whatever that is at the moment, rather than a measured one. */
  fill: boolean;
  /** The device has just changed, or full screen has: the prototype is resized with its frame rather than at once. */
  sizing: Sizing;
  inspect: { picking: boolean; onPick: (picked: Picked, element: Element) => void; onMotion: (seen: MotionSeen) => void; onEdit: (element: Element) => void; onKey: (event: KeyboardEvent) => void } | null;
  /** Edit mode on a page on another address (a live version), which `inspect` can't reach into: the part picked, and what to tell (see `EditLayer`). */
  across: { part: Part | null; onPick: (frame: HTMLIFrameElement, part: Part | null) => void; onText: (part: Part, text: string) => void } | null;
  /** Choosing an element for Claude (see `SelectLayer`). */
  select: { picking: boolean; selected: Selected | null; pulse: boolean; onSelect: (selected: Selected) => void; onExit: () => void } | null;
  /** Keys pressed inside the prototype, for the studio's own shortcuts. Dev mode takes them through `inspect` instead. */
  onKey: (event: KeyboardEvent) => void;
  comments: CommentsUi | null;
  onPlace?: (search: string) => void;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Counts every document the frame has loaded, so a link inside the
  // prototype to another page is styled too.
  const [documents, setDocuments] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  // Whether the page that loaded is on another address (a live version's dev server), which can't be read from here.
  const [elsewhere, setElsewhere] = useState(false);
  // The copy document asks this frame which lines of the copy file the page shows.
  useEffect(() => {
    setPrototypeFrame(frame.current);
    return () => setPrototypeFrame(null);
  }, [loaded]);
  const arrived = () => {
    setLoaded(true);
    setElsewhere(!frame.current?.contentDocument);
    setDocuments((count) => count + 1);
  };

  // The server-rendered iframe can finish loading before React is listening.
  useEffect(() => {
    if (frame.current?.contentDocument?.readyState === "complete") arrived();
  }, []);

  // Before the page is painted, so it never shows a scrollbar that then goes.
  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument;
    return doc ? applyEmbed(doc) : undefined;
  }, [documents]);

  // A prototype keeps its place in its own address (docs/controls.md): each time it writes another one there, or the
  // person goes back, the page is told, so the studio's controls, links and comments follow what is on screen.
  const placed = useRef(onPlace);
  useEffect(() => {
    placed.current = onPlace;
  });
  useEffect(() => {
    const win = frame.current?.contentWindow;
    try {
      return win ? watchPlace(win, (search) => placed.current?.(search)) : undefined;
    } catch {
      // A prototype on another address (a dev server) can't be watched from here.
      return undefined;
    }
  }, [documents]);
  // And what the person taps that the address doesn't remember, for a comment left on a sheet or a menu it opened.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    return doc ? watchTaps(doc) : undefined;
  }, [documents]);

  // Scrolling down shrinks an app's bar and scrolling up (or back to the top) brings it back. A page on another address can't be listened to.
  const told = useRef(onScrolled);
  useEffect(() => {
    told.current = onScrolled;
  });
  useEffect(() => {
    told.current(false);
    return frame.current ? watchScrolled(frame.current, (down) => told.current(down)) : undefined;
  }, [documents]);

  // Handlers live in a ref so a new pick doesn't tear the listeners down.
  const handlers = useRef(inspect);
  useEffect(() => {
    handlers.current = inspect;
  });
  const keys = useRef(onKey);
  useEffect(() => {
    keys.current = onKey;
  });
  const inspecting = inspect !== null;
  // A key pressed while the prototype has focus is the studio's too, unless somebody is typing into it.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || inspecting) return undefined;
    const forward = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      keys.current(event);
    };
    doc.addEventListener("keydown", forward);
    return () => doc.removeEventListener("keydown", forward);
  }, [inspecting, documents]);
  // The same, from a page the studio can't read (a dev server on its own address): it passes its keys up as messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type !== "studio:key" || typeof data.key !== "string" || event.source !== frame.current?.contentWindow) return;
      // A page the studio can read already has its keys listened to directly: taking them twice would undo each press.
      if (frame.current?.contentDocument) return;
      keys.current(new KeyboardEvent("keydown", { key: data.key, metaKey: !!data.metaKey, ctrlKey: !!data.ctrlKey, altKey: !!data.altKey, shiftKey: !!data.shiftKey }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const picking = inspect?.picking ?? false;
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !inspecting) return undefined;
    return inspectDocument(doc, picking, {
      onPick: (picked, element) => handlers.current?.onPick(picked, element),
      onMotion: (entry) => handlers.current?.onMotion(entry),
      onEdit: (element) => handlers.current?.onEdit(element),
      onKey: (event) => handlers.current?.onKey(event),
    });
  }, [inspecting, picking, documents]);

  const top = inset ? inset.top * (scale ?? 1) : 0;
  const bottom = inset ? inset.bottom * (scale ?? 1) : 0;
  return (
    // The page's own box: the bars sit above and below it, and pins and the poster are measured from it.
    <div className="absolute inset-x-0 transition-[top,bottom] duration-[var(--dur-standard)] ease-[var(--curve-standard)] motion-reduce:transition-none" style={{ top, bottom }}>
      {scale ? (
      <iframe
        ref={frame}
        src={url}
        title={title}
        onLoad={arrived}
        style={{
          width: fill ? "100%" : device.width,
          height: fill ? "100%" : device.height - (inset ? inset.top + inset.bottom : 0),
          transform: `scale(${scale})`,
        }}
        // The page's height follows an app bar that grows and shrinks, in step with it.
        className={`origin-top-left border-0 ${sizing ? sizingClass(sizing) : "transition-[height] duration-[var(--dur-standard)] ease-[var(--curve-standard)] motion-reduce:transition-none"}`}
        // Same-origin now that the studio serves these, so the frame is
        // sandboxed: a prototype can do everything it needs and cannot reach
        // out into the page around it.
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
      />
      ) : null}
      {scale && select ? <SelectLayer frame={frame} scale={scale} {...select} /> : null}
      {scale && across && elsewhere ? <EditLayer frame={frame} scale={scale} part={across.part} onPick={across.onPick} onText={across.onText} /> : null}
      {scale && comments ? <CommentLayer key={comments.placing ? "placing" : "looking"} frame={frame} scale={scale} comments={comments} /> : null}
      {loaded ? null : poster && !posterFailed ? (
        // The same picture the tile shows, so the page looks right at once and
        // the real prototype replaces it without a flash. It breathes while
        // the prototype loads, so it doesn't look frozen.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          draggable={false}
          onError={() => setPosterFailed(true)}
          className="pulse-soft absolute inset-0 size-full bg-surface object-cover object-top"
        />
      ) : (
        <div aria-hidden className="pulse-soft absolute inset-0 bg-surface" />
      )}
    </div>
  );
}

/**
 * A bar at one side of the frame, there to be dragged. It sits in the gap beside the frame, its middle 8px from the edge, so it never covers the prototype. It appears when the pointer comes to the edge (or has focus) and
 * stays while it is being dragged. The frame stays centred, so how far the pointer is from the middle is half the width
 * it is asking for. Arrow keys step between devices for anyone not dragging.
 */
function ResizeHandle({ side, onWidth, onStep }: { side: "left" | "right"; onWidth: (width: number) => void; onStep: (direction: 1 | -1) => void }) {
  const [dragging, setDragging] = useState(false);
  const centre = useRef(0);
  const wider = side === "right" ? 1 : -1;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize preview. Arrow keys change device."
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={(event) => {
        const box = event.currentTarget.parentElement!.getBoundingClientRect();
        centre.current = box.left + box.width / 2;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => dragging && onWidth(Math.abs(event.clientX - centre.current) * 2)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onStep(((event.key === "ArrowRight" ? 1 : -1) * wider) as 1 | -1);
        }
      }}
      className={`group/handle absolute inset-y-0 z-[var(--z-raised)] flex w-4 cursor-ew-resize touch-none items-center justify-center outline-none ${
        side === "left" ? "right-full" : "left-full"
      }`}
    >
      <span className="h-12 w-1 rounded-[var(--r-full)] bg-foreground-muted opacity-0 transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-data-[dragging]/handle:opacity-100" />
    </div>
  );
}
