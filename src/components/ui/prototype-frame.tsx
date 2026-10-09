"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { DevPanel } from "@/components/prototype/dev-panel";
import { EditBar } from "@/components/prototype/edit-bar";
import { EditPanel } from "@/components/prototype/edit-panel";
import { FlowCanvas } from "@/components/prototype/flow-canvas";
import { usePrototypeFlow } from "@/components/prototype/use-prototype-flow";
import { useEditSession } from "@/components/prototype/use-edit-session";

import { CodeIcon, ExternalIcon, FlowIcon, SparkleIcon, WireframeIcon } from "@/components/shell/nav-icons";

import { IconButton } from "./button";
import { Toggle } from "./toggle";
import { withParams, type FlowScreen } from "@/lib/flow";
import type { Device } from "@/lib/phone";
import { useMediaQuery } from "@/lib/use-media-query";
import { editInPlace } from "@/lib/edit-dom";
import { inspectDocument, type MotionSeen, type Picked } from "@/lib/inspect";
import { applyWireframe, WIREFRAME_FRAME_FILTER } from "@/lib/wireframe";

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
  mode,
  onMode,
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
  /** Looking, editing or in dev mode. The last two replace the bar and bring a panel of their own. */
  mode: "view" | "dev" | "edit";
  onMode: (mode: "view" | "dev" | "edit") => void;
}) {
  // The flow: the screens of the prototype and how they connect, drawn as a canvas.
  // Opening a screen from it shows the prototype on that screen; both belong to one address.
  const flow = usePrototypeFlow(addressed?.split("?")[0]);
  const [flowOpen, setFlowOpen] = useState(false);
  const [opened, setOpened] = useState<{ address?: string; screen: FlowScreen | null }>({ screen: null });
  const screen = opened.address === addressed ? opened.screen : null;
  const url = addressed && screen ? withParams(addressed, screen.params) : addressed;
  const showingFlow = flowOpen && !!flow && !!addressed;
  // Dev mode: the same preview, with its code beside it. What was picked and
  // what moved belong to the document on screen, so a new url starts them over.
  const [look, setLook] = useState<"design" | "wireframe">("design");
  // Editing and dev mode both look at the design or the wireframe, so the look is kept while either is on.
  const editing = mode === "edit" && !!edit;
  const wireframe = look === "wireframe";
  const dev = mode === "dev" || editing;
  // The panel keeps showing what it held while it closes.
  const panelOpen = dev && !showingFlow;
  const [panelKind, setPanelKind] = useState<"dev" | "edit">("dev");
  if (dev && panelKind !== (editing ? "edit" : "dev")) setPanelKind(editing ? "edit" : "dev");
  const session = useEditSession(url);
  const [target, setTarget] = useState<Element | null>(null);
  // While Selecting, clicks pick a part; while Interacting they go to the prototype, to move between screens.
  const [interacting, setInteracting] = useState(false);
  const [seen, setSeen] = useState<{ url?: string; picked: Picked | null; motion: MotionSeen[] }>({ picked: null, motion: [] });
  const here = seen.url === url ? seen : { url, picked: null, motion: [] as MotionSeen[] };
  // ⌘Z undoes, ⇧⌘Z and ⌘Y redo, whether the focus is in the studio or in the prototype.
  const deselect = () => {
    setTarget(null);
    setSeen((now) => ({ ...now, picked: null }));
  };
  const hotkey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && dev) {
      // With a part picked, Escape only lets go of it; the prototype never sees the key.
      if (target || here.picked) {
        event.preventDefault();
        event.stopPropagation();
      }
      deselect();
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

  const exitMode = () => {
    if (editing && session.edits.length && !window.confirm("Leave without saving? Your changes will be discarded.")) return;
    session.discard();
    setInteracting(false);
    onMode("view");
  };

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
      <div key={dev ? "mode" : "view"} className="bar-in grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:relative sm:z-[var(--z-raised)] sm:px-8 sm:py-8">
        {dev ? (
          // Editing or dev mode is the only thing going on: a way out, how clicks behave, and (editing) undo, redo and Save.
          <>
            <IconButton onClick={exitMode} className="justify-self-start">
              {editing ? "Cancel" : "Exit"}
            </IconButton>
            <div className="hidden justify-self-center sm:block">
              <Toggle
                label="Clicking"
                value={interacting ? "interact" : "select"}
                onChange={(next) => setInteracting(next === "interact")}
                options={[
                  { id: "select", label: "Select", showLabel: true },
                  { id: "interact", label: "Interact", showLabel: true },
                ]}
              />
            </div>
            <div className="[grid-column:3] justify-self-end">
              {editing && edit ? <EditBar session={session} slug={edit.slug} baseVersionId={edit.versionId} variantId={edit.variantId} /> : null}
            </div>
          </>
        ) : (
          <>
            {/* On the left, the version and how it is looked at; in the middle, the phone it is shown on; on the right, what to do with it. */}
            <div className="flex min-w-0 items-center gap-2 justify-self-start">
              {leading}
              {url && !showingFlow ? (
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
              {url && flow && addressed && !showingFlow ? (
                <IconButton label="Flow" onClick={() => setFlowOpen(true)}>
                  <FlowIcon />
                </IconButton>
              ) : null}
            </div>
            {/* Picking a phone makes no sense on a phone. */}
            <div className="hidden justify-self-center sm:block">{showingFlow ? null : center?.({ scale })}</div>
            {url ? (
              <div className="flex items-center gap-2 [grid-column:3] justify-self-end">
                {showingFlow ? <IconButton onClick={() => setFlowOpen(false)}>Back to prototype</IconButton> : null}
                {edit && !showingFlow ? (
                  <span className="hidden sm:block">
                    <IconButton onClick={() => onMode("edit")}>Edit</IconButton>
                  </span>
                ) : null}
                {showingFlow || narrow ? null : (
                  <IconButton label="Dev mode" onClick={() => onMode("dev")}>
                    <CodeIcon />
                  </IconButton>
                )}
                {showingFlow ? null : (
                  <IconButton label="Open in a new window" href={newTab} external tooltipAlign="end">
                    <ExternalIcon />
                  </IconButton>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div
        ref={stage}
        className={`flex min-h-0 flex-1 overflow-auto px-4 pb-4 [scrollbar-width:thin] sm:pb-16 ${showingFlow ? "invisible" : ""}`}>
        <div
          style={scale ? { width: device.width * scale, height: device.height * scale } : { aspectRatio: `${device.width} / ${device.height}` }}
          className={`relative isolate m-auto shrink-0 overflow-hidden rounded-[var(--r-device)] bg-surface [transform:translateZ(0)] ${
            scale ? "" : "h-full"
          }`}
        >
          {url ? (
            <FrameBody key={url} url={url} title={title} poster={screen ? undefined : poster} scale={scale} device={device} wireframe={wireframe} inspect={dev ? { ...inspect, picking: !interacting } : null} />
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

      {showingFlow && flow && addressed ? (
        <FlowCanvas
          flow={flow}
          base={addressed.split("?")[0]}
          device={device}
          onOpen={(next) => {
            setOpened({ address: addressed, screen: next });
            setFlowOpen(false);
          }}
        />
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
        ) : (
          <div className="p-4">
            <DevPanel picked={here.picked} motion={here.motion} />
          </div>
        )}
      </div>
    </div>
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
}: {
  url: string;
  title: string;
  poster?: string;
  scale: number | null;
  device: Device;
  wireframe: boolean;
  inspect: { picking: boolean; onPick: (picked: Picked, element: Element) => void; onMotion: (seen: MotionSeen) => void; onEdit: (element: Element) => void; onKey: (event: KeyboardEvent) => void } | null;
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

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    return doc ? applyWireframe(doc, wireframe) : undefined;
  }, [wireframe, documents]);

  // Handlers live in a ref so a new pick doesn't tear the listeners down.
  const handlers = useRef(inspect);
  useEffect(() => {
    handlers.current = inspect;
  });
  const inspecting = inspect !== null;
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
