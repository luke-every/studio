"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { CommentsUi } from "@/components/prototype/comment-parts";
import { locateScreen } from "@/components/prototype/locate-screen";
import { reviewPrompt, type Anchor, type Comment } from "@/lib/comments";
import { useStudio } from "@/lib/data/studio-store";
import { useEditSession } from "@/components/prototype/use-edit-session";
import { useComments, useShowComments } from "@/components/prototype/use-comments";
import { MotionSheet } from "@/components/motion";
import { ShareMenu } from "@/components/prototype/share-menu";

import { CommentIcon, ExpandIcon, ExternalIcon, EyeIcon, EyeOffIcon, FlowIcon, GithubIcon, SparkleIcon, WireframeIcon } from "@/components/shell/nav-icons";

import { controlOn, IconButton } from "./button";
import { DialogForm } from "./dialog-form";
import { Toggle } from "./toggle";
import { withParams, type Flow, type FlowScreen } from "@/lib/flow";
import { DEFAULT_DEVICE, DEVICES, type Device } from "@/lib/phone";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUser } from "@/lib/use-user";
import { editInPlace } from "@/lib/edit-dom";
import { inspectDocument, type MotionSeen, type Picked } from "@/lib/inspect";
import { applyEmbed } from "@/lib/embed";
import { applyWireframe, WIREFRAME_FRAME_FILTER } from "@/lib/wireframe";

// Loaded when their mode is opened, not with the page. Until then (or while the chunk arrives) they render nothing.
const DevPanel = dynamic(() => import("@/components/prototype/dev-panel").then((m) => m.DevPanel), { ssr: false });
const EditBar = dynamic(() => import("@/components/prototype/edit-bar").then((m) => m.EditBar), { ssr: false });
const EditPanel = dynamic(() => import("@/components/prototype/edit-panel").then((m) => m.EditPanel), { ssr: false });
const FlowCanvas = dynamic(() => import("@/components/prototype/flow-canvas").then((m) => m.FlowCanvas), { ssr: false });
// The comments code is fetched once the page has painted, so it is ready without being asked for and never holds the prototype up.
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
const SIZING = "transition-[width,height,transform] duration-[var(--dur-standard)] ease-[var(--curve-spatial)]";

/**
 * A prototype on a tile, the same grey tile the feed uses, 90% of the
 * window tall so all of it is in view. The prototype sits in the middle as
 * a phone, centered on the tile. The tile is a set height, so a phone drawn bigger than it scrolls inside. Along the top: on the left the version, design or
 * wireframe, and the flow; in the middle `center` (which phone, how big); on the
 * right dev mode and open in a new window.
 *
 * The prototype is laid out at the phone's own size and then scaled to fit the
 * tile, so it looks the same on a laptop as on a big screen.
 *
 * The wireframe toggle shows the same prototype with its visual design
 * stripped back (see `@/lib/wireframe`); it lasts until the page is left.
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
  center,
  device,
  onDevice,
  zoom = 1,
  fit = false,
  poster,
  edit,
  comments: commentsOf,
  flow,
  variants,
  flowOpen,
  onFlowOpen,
  mode,
  onMode,
  listing,
  onListing: setListing,
  fullscreen,
  onFullscreen,
  bare = false,
  onBare,
  onOpenPrototype,
  githubUrl,
  minimal = false,
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
  share?: { slug: string; versionKey: string; version: string };
  /** On a phone only: a control in the middle of the first row of the bar. */
  bottom?: ReactNode;
  /** The phone picker and sizing, in the middle of the bar. Told the scale the preview is drawn at. */
  center?: (info: { scale: number | null }) => ReactNode;
  /** The phone it is laid out for. */
  device: Device;
  /** Dragging an edge of the frame snaps between devices; this is told which. */
  onDevice?: (device: Device) => void;
  /** How big to draw it, as a multiple of the phone's real size; 1 is its exact size. */
  zoom?: number;
  /** Scale it to the room there is instead; `zoom` is ignored while this is on. */
  fit?: boolean;
  /** A picture of the prototype, shown while the real one loads. */
  poster?: string;
  /** Which version edits are made on. Without it there is no Edit mode. */
  edit?: { slug: string; versionId: string; variantId?: string };
  /** Which version comments are left on. Without it there are no comments. */
  comments?: {
    slug: string;
    version: string;
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
  flowOpen: boolean;
  onFlowOpen: (open: boolean) => void;
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
  githubUrl?: string;
  /** A share page: the version, the viewport, the comment buttons and full screen on the bar, and no look toggle, canvas, restart or share. */
  minimal?: boolean;
}) {
  // The flow: the screens of the prototype and how they connect, drawn as a canvas.
  // Opening a screen from it shows the prototype on that screen; both belong to one address.
  const [opened, setOpened] = useState<{ address?: string; screen: FlowScreen | null }>({ screen: null });
  const screen = opened.address === addressed ? opened.screen : null;
  const url = addressed && screen ? withParams(addressed, screen.params) : addressed;
  // The canvas: the flow if there is one, the variants if there are, and a switch between them when there are both.
  const [canvasKind, setCanvasKind] = useState<"flow" | "variants">("flow");
  // With neither, the prototype is a canvas of one screen, so the whole page can still be looked at there.
  const single = useMemo<Flow>(() => ({ screens: [{ id: "page", name: title, params: {} }], edges: [] }), [title]);
  const flowCanvas = flow || !variants ? { flow: flow ?? single, setups: undefined } : null;
  const canvas = (canvasKind === "variants" ? variants : flowCanvas) ?? flowCanvas ?? variants ?? null;
  const showingFlow = flowOpen && !!canvas && !!addressed;
  const showingVariants = showingFlow && !!canvas?.setups;
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
  const [look, setLook] = useState<"design" | "wireframe">("design");
  // Editing and dev mode both look at the design or the wireframe, so the look is kept while either is on.
  const editing = mode === "edit" && !!edit;
  const wireframe = look === "wireframe";
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
  const [pinsChosen, setShowPins] = useShowComments();
  // A share page shows comments only while commenting, so the show and hide switch is not offered there.
  const showPins = pinsChosen && !minimal;
  const { comments, everything, replies, error: commentsError, add: postComment, place: placeComment, reply: replyToComment, resolve: resolveComment, like: likeComment, remove: deleteComment } = useComments(commentsOf?.slug, commentsOf?.version, user.name, commentsOf?.variant, showPins || mode === "comment");
  const { notify } = useStudio();
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
  const [focus, setFocus] = useState<{ id: string; at: number } | null>(null);
  const askFor = (id: string | null) => setFocus((now) => (id ? { id, at: (now?.at ?? 0) + 1 } : null));
  // A link from a notification names a comment: open the list and go to it, once the comments have loaded.
  const [asked, setAsked] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("comment")));
  const openCount = everything.filter((comment) => !comment.resolvedAt).length;
  // The panel keeps showing what it held while it closes.
  const panelOpen = (dev && !showingFlow) || (commenting && listing);
  const [panelKind, setPanelKind] = useState<"dev" | "edit" | "comments">("dev");
  const wantedKind = editing ? "edit" : dev ? "dev" : "comments";
  if (panelOpen && panelKind !== wantedKind) setPanelKind(wantedKind);
  const session = useEditSession(url);
  const [target, setTarget] = useState<Element | null>(null);
  // While Selecting, clicks pick a part; while Interacting they go to the prototype, to move between screens.
  const [interacting, setInteracting] = useState(false);
  // A comment asked for that isn't on the screen showing is on another step of the flow. Most know which (it is noted when
  // they are left) and that screen is shown at once; one that doesn't is looked for, once per ask, and noted for next time.
  const [located, setLocated] = useState(0);
  const show = (screen: FlowScreen) => {
    setOpened({ address: addressed, screen });
    // Starts it over even if that screen is already the one open, since the prototype may have moved on from it.
    setRestarts((count) => count + 1);
  };
  const locate = (comment: Comment) => {
    if (!flow || !addressed || !focus || located === focus.at) return;
    setLocated(focus.at);
    const known = flow.screens.find((screen) => screen.id === comment.anchor.flowScreen);
    if (known) {
      show(known);
      return;
    }
    void locateScreen(addressed, flow, device, comment.anchor).then((found) => {
      if (!found) return;
      show(found);
      void placeComment(comment, found.id);
    });
  };
  // Choosing a comment from the list. One noted as on another flow screen than the one open goes there at once, without
  // first looking for it on this one (where a step drawn over another can make it seem to be).
  const goTo = (comment: Comment) => {
    const next = (focus?.at ?? 0) + 1;
    setFocus({ id: comment.id, at: next });
    // Left on another setup: show that one, and it is opened there once the prototype has reloaded.
    if (!showingVariants && commentsOf?.onSetup && comment.variant !== commentsOf.variant) {
      commentsOf.onSetup(comment.variant ?? "");
      return;
    }
    const known = flow?.screens.find((item) => item.id === comment.anchor.flowScreen);
    if (known && addressed && known.id !== (screen ?? flow?.screens[0])?.id) {
      setLocated(next);
      show(known);
    }
  };
  // Leaving a comment: which flow screen it is on is found straight after, out of sight, so going to it later is instant.
  const addComment = async (text: string, anchor: Anchor, setup?: string) => {
    const posted = await postComment(text, anchor, setup);
    if (posted && flow && addressed && !anchor.flowScreen && setup === undefined) {
      void locateScreen(addressed, flow, device, anchor).then((found) => found && placeComment(posted, found.id));
    }
    return !!posted;
  };
  const commentsUi: CommentsUi | null =
    commentsOf && !dev
      ? { list: comments, visible: !bare && (showPins || commenting), placing: commenting && !interacting, focus, onFocus: askFor, onLocate: locate, replies, onAdd: addComment, onReply: replyToComment, onResolve: resolveComment, onLike: likeComment, onDelete: deleteComment, onCopy: (comment) => void copyForClaude([comment]) }
      : null;
  const [seen, setSeen] = useState<{ url?: string; picked: Picked | null; motion: MotionSeen[] }>({ picked: null, motion: [] });
  const here = seen.url === url ? seen : { url, picked: null, motion: [] as MotionSeen[] };
  // ⌘Z undoes, ⇧⌘Z and ⌘Y redo, whether the focus is in the studio or in the prototype.
  const deselect = () => {
    setTarget(null);
    setSeen((now) => ({ ...now, picked: null }));
  };
  // Counts restarts: a new key remounts the frame, which loads the same address afresh.
  const [restarts, setRestarts] = useState(0);
  const changeMode = (next: "view" | "dev" | "edit" | "comment") => {
    setListOpen(false);
    if (next !== "comment") setListing(false);
    onMode(next);
  };

  const leaveMode = () => {
    session.discard();
    setInteracting(false);
    changeMode("view");
  };
  const exitMode = () => {
    if (editing && session.edits.length) setLeaving(true);
    else leaveMode();
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
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (commenting) changeMode("view");
        else {
          // The same as the comment button: commenting, with the list beside the prototype.
          changeMode("comment");
          setListing(true);
        }
        return;
      }
      if (event.key === "Escape" && commenting) {
        exitMode();
        return;
      }
    }
    // The canvas closes on Escape (a screen selected on it lets go first, which is the canvas's own). It is full screen
    // itself, so that is no reason to wait: full screen chosen before it opened is what is left next.
    if (event.key === "Escape" && showingFlow && !commenting && !dev) {
      onFlowOpen(false);
      return;
    }
    if (mode === "view" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key.toLowerCase() === "f" && url) {
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
      if (target || here.picked) {
        event.preventDefault();
        event.stopPropagation();
        deselect();
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
      if (target && ["INPUT", "SELECT"].includes(target.tagName)) {
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
      if (editing) editInPlace(element as HTMLElement, (text) => session.setText(element, text));
    },
    onPick: (picked: Picked, element: Element) => {
      setSeen({ ...here, url, picked });
      setTarget(element);
    },
    onMotion: (entry: MotionSeen) => setSeen((now) => ({ ...(now.url === url ? now : { url, picked: null, motion: [] }), url, motion: [...(now.url === url ? now.motion : []), entry].slice(-30) })),
  };

  // The wireframe view is the studio's own, so a new tab only keeps it by opening the prototype through the studio.
  const outside = openUrl && screen ? withParams(openUrl, screen.params) : (openUrl ?? url);
  const newTab = outside && wireframe ? `/view/${outside.replace(/^\/p\//, "")}${outside.includes("?") ? "&" : "?"}wireframe` : outside;

  const stage = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  // On a phone it is a preview, not a place to work: always scaled to fit the
  // screen, with no picking a size. It is sized once, when it loads, and left:
  // Safari resizes the window as the address bar slides away while scrolling,
  // and redrawing the prototype for every step of that is slow.
  const narrow = useMediaQuery("(max-width: 639px)");
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
  // A link from a notification names a comment. It is gone to once the comment has loaded and the setup it was left on can
  // be shown, which is after the page: the prototype's options and variants load on their own. The same as choosing it in the list.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!asked) return undefined;
    const timer = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(timer);
  }, [asked]);
  const askedComment = asked ? everything.find((item) => item.id === asked) : undefined;
  const askedReady = !!askedComment && !!url && (waited || (commentsOf?.canShow?.(askedComment.variant) ?? true));
  /* eslint-disable react-hooks/set-state-in-effect -- going to a comment is a reaction to it having arrived */
  useEffect(() => {
    if (!askedReady || !askedComment) return;
    setAsked(null);
    const address = new URL(window.location.href);
    address.searchParams.delete("comment");
    window.history.replaceState(null, "", address);
    changeMode("comment");
    setListing(!narrow);
    goTo(askedComment);
    // Once, when it becomes ready; the rest is read from the render that sees it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedReady]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSpace((now) => (narrow && now ? now : { width, height }));
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [narrow]);
  // Measured on the client only, so no frame is drawn on the server.
  const scale = space
    ? fit || narrow
      ? Math.min(space.width / device.width, space.height / device.height)
      : zoom
    : null;

  // Dragging an edge of the frame picks the device whose frame is nearest the width the pointer has reached, so the
  // size jumps between mobile, tablet and desktop rather than following the pointer anywhere. It is drawn as it would be.
  // A change of device is animated: the frame's box and the prototype in it change size together, so it is seen being
  // resized. Only then; the window being resized, or a zoom step, follows at once.
  const [sizedFor, setSizedFor] = useState(device.id);
  const [sizing, setSizing] = useState(false);
  if (sizedFor !== device.id) {
    setSizedFor(device.id);
    setSizing(true);
  }
  useEffect(() => {
    if (!sizing) return undefined;
    const timer = window.setTimeout(() => setSizing(false), SIZING_MS);
    return () => window.clearTimeout(timer);
  }, [sizing, sizedFor]);
  const scaleOf = (candidate: Device) => (space ? (fit || narrow ? Math.min(space.width / candidate.width, space.height / candidate.height) : zoom) : null);
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

  // The look toggle and the comment buttons: in the bar on a wider screen, under the prototype on a phone.
  const lookControl = url ? (
    <Toggle
      label="Look"
      value={look}
      onChange={setLook}
      options={[
        { id: "design", label: "Design", icon: <SparkleIcon /> },
        { id: "wireframe", label: "Wireframe", icon: <WireframeIcon /> },
      ]}
    />
  ) : null;
  const pinButtons = commentsOf ? (
    <>
      {comments.length && !minimal ? (
        <IconButton label={showPins ? "Hide comments" : "Show comments"} onClick={() => setShowPins(!showPins)}>
          {showPins ? <EyeIcon /> : <EyeOffIcon />}
        </IconButton>
      ) : null}
      <IconButton label="Comment (C)" onClick={() => { changeMode("comment"); setListing(true); }}>
        <CommentIcon />
        {openCount ? openCount : null}
      </IconButton>
    </>
  ) : null;

  // A set height, the window's on a wide screen: a bigger phone scrolls inside the tile instead of stretching the page.
  return (
    <div className="flex h-[var(--frame-height)] w-full gap-4 lg:h-full">
    <div
      // Clicking the tile around the phone lets go of what was picked, unless it was a button that was pressed. A click inside the prototype never reaches here.
      onClick={(event) => dev && !(event.target as Element).closest("button, a") && deselect()}
      className={`relative flex min-w-0 flex-1 flex-col rounded-[var(--r-tile)] bg-tile transition-[border-radius] duration-[var(--dur-standard)] ease-[var(--curve-standard)] max-sm:rounded-none max-sm:px-6 max-sm:pb-14 max-sm:pt-8 ${fullscreen ? "lg:rounded-none" : ""}`}
    >
      <div key={dev || commenting ? "mode" : "view"} style={bare ? { display: "none" } : undefined} className="bar-in relative z-[var(--z-raised)] grid min-h-16 items-center gap-3 max-sm:mb-2 max-sm:grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr] sm:px-8 sm:py-8">
        {dev || commenting ? (
          // Editing, dev or comment mode is the only thing going on: a way out, how clicks behave, and (editing) undo, redo and Save.
          <>
            <IconButton onClick={exitMode} className="justify-self-start">
              {editing || commenting ? "Cancel" : "Exit"}
            </IconButton>
            <div className={`justify-self-center ${commenting ? "" : "hidden sm:block"}`}>
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
              {editing && edit ? <EditBar session={session} slug={edit.slug} baseVersionId={edit.versionId} variantId={edit.variantId} /> : null}
              {commenting ? (
                <>
                  <span className="sm:hidden">
                    <IconButton label="Comments" onClick={() => setListOpen(true)}>
                      <CommentIcon />
                      {openCount ? openCount : null}
                    </IconButton>
                  </span>
                  <span className="hidden sm:block">
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
            <div className="flex min-w-0 items-center gap-2 justify-self-start max-sm:contents">
              <div className="max-sm:[grid-area:1/1]">{leading}</div>
              {lookControl && !minimal ? <div className="max-sm:hidden">{lookControl}</div> : null}
              {url && addressed && !minimal ? (
                showingFlow ? (
                  <IconButton onClick={() => onFlowOpen(false)}>Close canvas</IconButton>
                ) : (
                  <IconButton label="Canvas" onClick={() => onFlowOpen(true)} className="max-sm:hidden">
                    <FlowIcon />
                  </IconButton>
                )
              ) : null}
            </div>
            {/* Picking a phone makes no sense on a phone. */}
            <div className="hidden justify-self-center sm:block">
              {showingFlow ? (
                flow && variants ? (
                  <div className="flex items-center gap-2" role="group" aria-label="Canvas">
                    {(["flow", "variants"] as const).map((kind) => (
                      <IconButton key={kind} aria-pressed={(showingVariants ? "variants" : "flow") === kind} onClick={() => setCanvasKind(kind)} className={(showingVariants ? "variants" : "flow") === kind ? controlOn : ""}>
                        {kind === "flow" ? "Flow" : "Variants"}
                      </IconButton>
                    ))}
                  </div>
                ) : null
              ) : (
                center?.({ scale })
              )}
            </div>
            {/* On a phone, the variants sit in the middle of the first row, where a wider screen has the phone picker. */}
            {bottom ? <div className="justify-self-center sm:hidden max-sm:[grid-area:1/2]">{bottom}</div> : null}
            {url ? (
              <div className="flex items-center gap-2 [grid-column:3] justify-self-end max-sm:contents">
                {pinButtons ? <div className="flex items-center gap-2 max-sm:hidden">{pinButtons}</div> : null}
                {minimal && githubUrl ? (
                  <span className="hidden lg:block">
                    <IconButton label="Open in GitHub" tooltipAlign="end" href={githubUrl} external>
                      <GithubIcon />
                    </IconButton>
                  </span>
                ) : null}
                {minimal && onOpenPrototype && !fullscreen ? (
                  <span className="hidden lg:block">
                    <IconButton label="Open the prototype" tooltipAlign="end" onClick={onOpenPrototype}>
                      <ExternalIcon />
                    </IconButton>
                  </span>
                ) : null}
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
                {share ? (
                  <div className="max-sm:justify-self-end max-sm:[grid-area:1/3]">
                    <ShareMenu
                      {...share}
                      stage={stage}
                      newTab={newTab}
                      onOpenNew={touch && newTab ? () => openWithComments(newTab) : undefined}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div
        ref={stage}
        className={`flex min-h-0 flex-1 overflow-auto px-0 [scrollbar-width:thin] sm:px-4 sm:pb-10 ${bare ? "pt-10" : ""} pb-0 ${showingFlow ? "invisible" : ""}`}>
        {/* Clipped, not hidden: below 100% the frame's full-size layout box sticks out of this one, and a hidden box can still be scrolled by the prototype (a modal taking focus), which slid the whole phone sideways in Safari. A clipped box can't be scrolled at all. */}
        <div
          style={scale ? { width: device.width * scale, height: device.height * scale } : { aspectRatio: `${device.width} / ${device.height}` }}
          className={`relative m-auto shrink-0 ${scale ? "" : "h-full"} ${sizing ? SIZING : ""}`}
        >
        {onDevice && !narrow && !showingFlow && !bare ? (
          <>
            <ResizeHandle side="left" onWidth={pickWidth} onStep={stepDevice} />
            <ResizeHandle side="right" onWidth={pickWidth} onStep={stepDevice} />
          </>
        ) : null}
        <div
          className={`relative isolate size-full overflow-clip bg-surface [transform:translateZ(0)] ${
            device.kind === "phone" ? "rounded-[var(--r-device)]" : "rounded-[var(--r-lg)]"
          }`}
        >
          {url ? (
            <FrameBody
              key={`${url}#${restarts}`}
              url={url}
              title={title}
              poster={screen ? undefined : poster}
              scale={scale}
              device={device}
              sizing={sizing}
              wireframe={wireframe}
              inspect={dev ? { ...inspect, picking: !interacting } : null}
              onKey={(event) => hotkeyRef.current(event)}
              comments={showingFlow ? null : commentsUi}
            />
          ) : (
            <div className="grid size-full place-items-center">
              <p className="max-w-[30ch] px-6 text-center text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
                No files for this version. Push one from Claude Code with{" "}
                <span className="text-foreground-muted">/push</span>.
              </p>
            </div>
          )}
        </div>
        </div>
      </div>


      {corner && mode === "view" && !showingFlow && !bare ? (
        <div className="absolute bottom-10 right-10 z-[var(--z-raised)] hidden sm:block">{corner}</div>
      ) : null}

      {/* On a phone, how it is looked at and the comments sit under the prototype, centred. */}
      {mode === "view" && url && !showingFlow ? (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 sm:hidden">
          {lookControl}
          {pinButtons}
        </div>
      ) : null}

      {(showingFlow || (canvasKey && warmKey === canvasKey)) && canvas && addressed ? (
        <div inert={!showingFlow} className={`absolute inset-0 ${showingFlow ? "" : "pointer-events-none invisible"}`}>
          <FlowCanvas
            // The two canvases are different layouts of different screens, so each starts afresh.
            key={canvas.setups ? "variants" : "flow"}
            flow={canvas.flow}
            setups={canvas.setups}
            base={addressed.split("?")[0]}
            device={device}
            // Closed, it isn't looking for pins.
            comments={showingFlow && commentsUi ? (canvas.setups ? { ...commentsUi, list: everything } : commentsUi) : undefined}
            wireframe={wireframe}
            onOpen={(next) => {
              // A variant opens as the prototype put in that setup; a step of the flow, as the prototype on that screen.
              if (canvas.setups) commentsOf?.onSetup?.(canvas.setups[next.id]);
              else setOpened({ address: addressed, screen: next });
              onFlowOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>

    {/* Its own panel beside the canvas, as tall as the canvas without making it taller. It stays mounted so it can open and close. */}
    <div
      inert={!panelOpen}
      className={`relative hidden shrink-0 transition-[width,margin,visibility] duration-[var(--dur-standard)] ease-[var(--curve-standard)] sm:block ${
        // Hidden outright once it has gone, not only moved out of sight.
        panelOpen ? "w-[var(--dev-panel-width)]" : "invisible -ml-4 w-0"
      }`}
    >
      {/* It travels in from the right and fades in as the space opens for it, at the same pace as the left column goes. */}
      <div
        className={`absolute inset-y-0 right-0 w-[var(--dev-panel-width)] overflow-y-auto rounded-[var(--r-tile)] ${fullscreen ? "lg:rounded-none" : ""} bg-tile transition-[translate,opacity] duration-[var(--dur-standard)] ease-[var(--curve-standard)] [scrollbar-width:thin] ${
          panelOpen ? "" : "translate-x-full opacity-0"
        }`}
      >
        {panelKind === "edit" && edit ? (
          <EditPanel element={target?.isConnected ? target : null} session={session} />
        ) : panelKind === "comments" ? (
          <CommentsPanel comments={everything} setupLabel={commentsOf?.setupLabel} replies={replies} selectedId={focus?.id ?? null} error={commentsError} onSelect={goTo} onResolve={resolveComment} onDelete={deleteComment} onCopy={copyForClaude} />
        ) : (
          <div className="p-4">
            <DevPanel picked={here.picked} motion={here.motion} />
          </div>
        )}
      </div>
    </div>


    {/* On a phone the list is a sheet over the prototype. */}
    <MotionSheet open={narrow && listOpen} onClose={() => setListOpen(false)} label="Comments">
      <div className="flex flex-col gap-2 pb-4">
        <CommentsPanel
          comments={everything}
          setupLabel={commentsOf?.setupLabel}
          replies={replies}
          selectedId={focus?.id ?? null}
          error={commentsError}
          onSelect={(comment) => {
            goTo(comment);
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
        onClose={() => setLeaving(false)}
        onSubmit={leaveMode}
      />
    ) : null}
    </div>
  );
}

/** Remounted per url, so every version starts from the skeleton. */
function FrameBody({
  url,
  title,
  poster,
  scale,
  device,
  sizing,
  wireframe,
  inspect,
  onKey,
  comments,
}: {
  url: string;
  title: string;
  poster?: string;
  scale: number | null;
  device: Device;
  /** The device has just changed: the prototype is resized with its frame rather than at once. */
  sizing: boolean;
  wireframe: boolean;
  inspect: { picking: boolean; onPick: (picked: Picked, element: Element) => void; onMotion: (seen: MotionSeen) => void; onEdit: (element: Element) => void; onKey: (event: KeyboardEvent) => void } | null;
  /** Keys pressed inside the prototype, for the studio's own shortcuts. Dev mode takes them through `inspect` instead. */
  onKey: (event: KeyboardEvent) => void;
  comments: CommentsUi | null;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Counts every document the frame has loaded, so a link inside the
  // prototype to another page is styled too.
  const [documents, setDocuments] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  const arrived = () => {
    setLoaded(true);
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

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    return doc ? applyWireframe(doc, wireframe) : undefined;
  }, [wireframe, documents]);

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

  return (
    <>
      {scale ? (
      <iframe
        ref={frame}
        src={url}
        title={title}
        onLoad={arrived}
        style={{
          width: device.width,
          height: device.height,
          transform: `scale(${scale})`,
          filter: wireframe ? WIREFRAME_FRAME_FILTER : undefined,
        }}
        className={`origin-top-left border-0 ${sizing ? SIZING : ""}`}
        // Same-origin now that the studio serves these, so the frame is
        // sandboxed: a prototype can do everything it needs and cannot reach
        // out into the page around it.
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
      />
      ) : null}
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
    </>
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
