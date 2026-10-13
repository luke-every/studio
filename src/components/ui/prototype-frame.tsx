"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { DevPanel } from "@/components/prototype/dev-panel";
import { EditBar } from "@/components/prototype/edit-bar";
import { CommentLayer } from "@/components/prototype/comment-layer";
import type { CommentsUi } from "@/components/prototype/comment-parts";
import { locateScreen } from "@/components/prototype/locate-screen";
import { reviewPrompt, type Anchor, type Comment } from "@/lib/comments";
import { useStudio } from "@/lib/data/studio-store";
import { CommentsPanel } from "@/components/prototype/comments-panel";
import { PhoneQr, withToken } from "@/components/prototype/phone-qr";
import { EditPanel } from "@/components/prototype/edit-panel";
import { FlowCanvas } from "@/components/prototype/flow-canvas";
import { useEditSession } from "@/components/prototype/use-edit-session";
import { useComments, useShowComments } from "@/components/prototype/use-comments";
import { MotionSheet } from "@/components/motion";

import { CodeIcon, CommentIcon, ExpandIcon, ExternalIcon, EyeIcon, EyeOffIcon, FlowIcon, SparkleIcon, WireframeIcon } from "@/components/shell/nav-icons";

import { controlOn, IconButton } from "./button";
import { DialogForm } from "./dialog-form";
import { Toggle } from "./toggle";
import { withParams, type Flow, type FlowScreen } from "@/lib/flow";
import type { Device } from "@/lib/phone";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUser } from "@/lib/use-user";
import { editInPlace } from "@/lib/edit-dom";
import { inspectDocument, type MotionSeen, type Picked } from "@/lib/inspect";
import { applyEmbed } from "@/lib/embed";
import { applyWireframe, WIREFRAME_FRAME_FILTER } from "@/lib/wireframe";

/** How long a closed canvas stays loaded in case it is opened again. */
const CANVAS_WARM_MS = 2 * 60 * 1000;

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
  title,
  leading,
  center,
  device,
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
}: {
  url?: string;
  title: string;
  /** The version control, at the start of the bar. */
  leading: ReactNode;
  /** The phone picker and sizing, in the middle of the bar. Told the scale the preview is drawn at. */
  center?: (info: { scale: number | null }) => ReactNode;
  /** The phone it is laid out for. */
  device: Device;
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
  /** Commenting with the list of comments beside the prototype, which the page makes room for. The comment button asks for it; C starts commenting without it, to leave one quickly. */
  listing: boolean;
  onListing: (listing: boolean) => void;
  /** Full screen: the studio steps back so the prototype can fill the window. */
  fullscreen: boolean;
  onFullscreen: (on: boolean) => void;
}) {
  // The flow: the screens of the prototype and how they connect, drawn as a canvas.
  // Opening a screen from it shows the prototype on that screen; both belong to one address.
  const [opened, setOpened] = useState<{ address?: string; screen: FlowScreen | null }>({ screen: null });
  const screen = opened.address === addressed ? opened.screen : null;
  const url = addressed && screen ? withParams(addressed, screen.params) : addressed;
  // The canvas: the flow if there is one, the variants if there are, and a switch between them when there are both.
  const [canvasKind, setCanvasKind] = useState<"flow" | "variants">("flow");
  const flowCanvas = flow ? { flow, setups: undefined } : null;
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
  const { comments, everything, replies, error: commentsError, add: postComment, place: placeComment, reply: replyToComment, resolve: resolveComment, remove: deleteComment } = useComments(commentsOf?.slug, commentsOf?.version, user.name, commentsOf?.variant);
  const [showPins, setShowPins] = useShowComments();
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
      ? { list: comments, visible: showPins || commenting, placing: commenting && !interacting, focus, onFocus: askFor, onLocate: locate, replies, onAdd: addComment, onReply: replyToComment, onResolve: resolveComment, onDelete: deleteComment, onCopy: (comment) => void copyForClaude([comment]) }
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
    if (commentsOf && url && !dev) {
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        changeMode(commenting ? "view" : "comment");
        return;
      }
      if (event.key === "Escape" && commenting) {
        exitMode();
        return;
      }
    }
    // The canvas closes on Escape (a screen selected on it lets go first, which is the canvas's own; full screen is left first).
    if (event.key === "Escape" && showingFlow && !commenting && !dev && !fullscreen) {
      onFlowOpen(false);
      return;
    }
    if (mode === "view" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key.toLowerCase() === "f" && url) {
        event.preventDefault();
        onFullscreen(!fullscreen);
        return;
      }
      if (event.key.toLowerCase() === "r" && url && !showingFlow) {
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
  const newTab = url && wireframe ? `/view/${url.replace(/^\/p\//, "")}${url.includes("?") ? "&" : "?"}wireframe` : url;

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
    void withToken(address, new Map()).then(
      (tokened) => (opened ? (opened.location.href = tokened) : window.open(tokened, "_blank")),
      () => (opened ? (opened.location.href = address) : undefined),
    );
  };
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

  // A set height, the window's on a wide screen: a bigger phone scrolls inside the tile instead of stretching the page.
  return (
    <div className="flex h-[var(--frame-height)] w-full gap-4 lg:h-full">
    <div
      // Clicking the tile around the phone lets go of what was picked, unless it was a button that was pressed. A click inside the prototype never reaches here.
      onClick={(event) => dev && !(event.target as Element).closest("button, a") && deselect()}
      className="relative flex min-w-0 flex-1 flex-col rounded-[var(--r-tile)] bg-tile max-sm:rounded-none"
    >
      <div key={dev || commenting ? "mode" : "view"} className="bar-in grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:relative sm:z-[var(--z-raised)] sm:px-8 sm:py-8">
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
            <div className="flex min-w-0 items-center gap-2 justify-self-start">
              {leading}
              {url ? (
                <Toggle
                  label="Look"
                  value={look}
                  onChange={setLook}
                  options={[
                    { id: "design", label: "Design", icon: <SparkleIcon /> },
                    { id: "wireframe", label: "Wireframe", icon: <WireframeIcon /> },
                  ]}
                />
              ) : null}
              {url && !showingFlow && !narrow ? (
                <IconButton label="Dev mode" onClick={() => changeMode("dev")}>
                  <CodeIcon />
                </IconButton>
              ) : null}
              {url && (flow || variants) && addressed && !showingFlow ? (
                <IconButton label="Canvas" onClick={() => onFlowOpen(true)}>
                  <FlowIcon />
                </IconButton>
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
            {url ? (
              <div className="flex items-center gap-2 [grid-column:3] justify-self-end">
                {showingFlow ? <IconButton onClick={() => onFlowOpen(false)}>Back to prototype</IconButton> : null}
                {commentsOf ? (
                  <>
                    {comments.length ? (
                      <IconButton label={showPins ? "Hide comments" : "Show comments"} onClick={() => setShowPins(!showPins)}>
                        {showPins ? <EyeIcon /> : <EyeOffIcon />}
                      </IconButton>
                    ) : null}
                    <IconButton label="Comment (C)" onClick={() => { changeMode("comment"); setListing(true); }}>
                      <CommentIcon />
                      {openCount ? openCount : null}
                    </IconButton>
                  </>
                ) : null}
                {edit && !showingFlow ? (
                  <span className="hidden sm:block">
                    <IconButton onClick={() => changeMode("edit")}>Edit</IconButton>
                  </span>
                ) : null}
                {showingFlow ? null : (
                  touch && newTab ? (
                    <IconButton label="Open in a new window" onClick={() => openWithComments(newTab)}>
                      <ExternalIcon />
                    </IconButton>
                  ) : (
                    <IconButton label="Open in a new window" href={newTab} external>
                      <ExternalIcon />
                    </IconButton>
                  )
                )}
                <span className="hidden lg:block">
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
              </div>
            ) : null}
          </>
        )}
      </div>

      <div
        ref={stage}
        className={`flex min-h-0 flex-1 overflow-auto px-4 pb-4 [scrollbar-width:thin] sm:pb-10 ${showingFlow ? "invisible" : ""}`}>
        {/* Clipped, not hidden: below 100% the frame's full-size layout box sticks out of this one, and a hidden box can still be scrolled by the prototype (a modal taking focus), which slid the whole phone sideways in Safari. A clipped box can't be scrolled at all. */}
        <div
          style={scale ? { width: device.width * scale, height: device.height * scale } : { aspectRatio: `${device.width} / ${device.height}` }}
          className={`relative isolate m-auto shrink-0 overflow-clip rounded-[var(--r-device)] bg-surface [transform:translateZ(0)] ${
            scale ? "" : "h-full"
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

      {mode === "view" && url && !showingFlow && !fullscreen ? <PhoneQr stage={stage} /> : null}

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
        className={`absolute inset-y-0 right-0 w-[var(--dev-panel-width)] overflow-y-auto rounded-[var(--r-tile)] bg-tile transition-[translate,opacity] duration-[var(--dur-standard)] ease-[var(--curve-standard)] [scrollbar-width:thin] ${
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
        className="origin-top-left border-0"
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
