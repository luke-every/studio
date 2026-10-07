"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { DevPanel } from "@/components/prototype/dev-panel";
import { EditBar } from "@/components/prototype/edit-bar";
import { EditPanel } from "@/components/prototype/edit-panel";
import { FlowCanvas } from "@/components/prototype/flow-canvas";
import { usePrototypeFlow } from "@/components/prototype/use-prototype-flow";
import { ViewMenu, type View } from "@/components/prototype/view-menu";
import { useEditSession } from "@/components/prototype/use-edit-session";

import { ExternalIcon, FlowIcon, SlidersIcon } from "@/components/shell/nav-icons";

import { Button, IconButton } from "./button";
import { withParams, type FlowScreen } from "@/lib/flow";
import type { Device } from "@/lib/phone";
import { useMediaQuery } from "@/lib/use-media-query";
import { editInPlace } from "@/lib/edit-dom";
import { inspectDocument, type MotionSeen, type Picked } from "@/lib/inspect";
import { applyWireframe, WIREFRAME_FRAME_FILTER } from "@/lib/wireframe";

/**
 * A prototype on a tile, the same grey tile the feed uses, 90% of the
 * window tall so all of it is in view. The prototype sits in the middle as
 * a phone, centered on the tile. Along the top: `leading` (the version) on
 * the left, `center` (which phone) in the middle, and the buttons on the right.
 *
 * The prototype is laid out at the phone's own size and then scaled to fit the
 * tile, so it looks the same on a laptop as on a big screen.
 *
 * The wireframe button shows the same prototype with its visual design
 * stripped back (see `@/lib/wireframe`); it lasts until the page is left.
 *
 * The prototype loads behind a skeleton, which comes back whenever the url
 * changes, so choosing another version reads as the thing refreshing.
 */
export function PrototypeFrame({
  url: addressed,
  title,
  name,
  leading,
  center,
  device,
  zoom = 1,
  fit = false,
  controls,
  actions,
  poster,
  edit,
}: {
  url?: string;
  title: string;
  /** The prototype's name, shown in the bar while the flow is open. */
  name: string;
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
  /** What the prototype lets you adjust. Without it there is no button. */
  controls?: ReactNode;
  /** Buttons for the prototype as a whole, at the end of the bar. */
  actions?: ReactNode;
  /** A picture of the prototype, shown while the real one loads. */
  poster?: string;
  /** Which version edits are made on. Without it there is no Edit mode. */
  edit?: { slug: string; versionId: string };
}) {
  const [controlsOpen, setControlsOpen] = useState(false);
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
  const [view, setView] = useState<View>("design");
  // Editing is its own state, on top of how it is viewed: a design or a wireframe can be edited, dev mode can't.
  const [editingNow, setEditingNow] = useState(false);
  const editing = editingNow && view !== "dev";
  const wireframe = view === "wireframe";
  const dev = view === "dev" || editing;
  const session = useEditSession(url);
  const [target, setTarget] = useState<Element | null>(null);
  // In Edit, clicks pick a part to change; in Interact they go to the prototype, to move between screens.
  const [interacting, setInteracting] = useState(false);
  const [picking, setPicking] = useState(true);
  const [seen, setSeen] = useState<{ url?: string; picked: Picked | null; motion: MotionSeen[] }>({ picked: null, motion: [] });
  const here = seen.url === url ? seen : { url, picked: null, motion: [] as MotionSeen[] };
  // ⌘Z undoes, ⇧⌘Z and ⌘Y redo, whether the focus is in the studio or in the prototype.
  const deselect = () => {
    setTarget(null);
    setSeen((now) => ({ ...now, picked: null }));
  };
  const hotkey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && dev) {
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
      // Typing in a field keeps the browser's own undo.
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      hotkeyRef.current(event);
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);

  const exitEditing = () => {
    if (session.edits.length && !window.confirm("Leave without saving? Your changes will be discarded.")) return;
    session.discard();
    setInteracting(false);
    setEditingNow(false);
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
  // screen, with no picking a size.
  const narrow = useMediaQuery("(max-width: 639px)");
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSpace({ width, height });
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);
  // Measured on the client only, so no frame is drawn on the server.
  const scale = space
    ? fit || narrow
      ? Math.min(space.width / device.width, space.height / device.height)
      : zoom
    : null;

  return (
    <div
      className={`relative mx-auto flex min-h-[var(--frame-height)] w-full flex-col rounded-[var(--r-tile)] bg-tile max-sm:h-[var(--frame-height)] max-sm:rounded-none ${
        // Scaled to fit, the tile is a set height and the phone is made to fit
        // it. Otherwise the tile is at least that tall and grows to hold a
        // phone that is taller. On a phone it is always the set height.
        fit || showingFlow ? "sm:h-[var(--frame-height)]" : ""
      }`}
    >
      <div className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:relative sm:z-[var(--z-raised)] sm:px-8 sm:py-8">
        {editing && edit ? (
          // Editing is the only thing going on: just a way out, undo and redo, and Save.
          <>
            <button
              type="button"
              onClick={exitEditing}
              className="h-10 justify-self-start rounded-[var(--r-full)] bg-surface px-4 text-ui font-medium text-foreground-muted hover:text-foreground"
            >
              Exit editing
            </button>
            <div role="group" aria-label="Clicking" className="hidden items-center justify-self-center rounded-[var(--r-full)] bg-surface p-0.5 sm:flex">
              {([false, true] as const).map((use) => (
                <button
                  key={String(use)}
                  type="button"
                  aria-pressed={interacting === use}
                  onClick={() => setInteracting(use)}
                  className={`h-9 rounded-[var(--r-full)] px-3.5 text-ui font-medium ${
                    interacting === use ? "bg-accent text-accent-foreground" : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {use ? "Interact" : "Select"}
                </button>
              ))}
            </div>
            <div className="[grid-column:3] justify-self-end">
              <EditBar session={session} slug={edit.slug} baseVersionId={edit.versionId} />
            </div>
          </>
        ) : (
          <>
            {/* On the left, the version and what is about the prototype; in the middle, the phone it is shown on; on the right, what to do with it. */}
            <div className="flex min-w-0 items-center gap-2 justify-self-start">
              {leading}
              {url && !showingFlow ? actions : null}
              {url && controls && !showingFlow ? (
                <IconButton
                  label="Controls"
                  onClick={() => setControlsOpen((open) => !open)}
                  aria-expanded={controlsOpen}
                  className={controlsOpen ? "!border-transparent !bg-accent !text-accent-foreground" : ""}
                >
                  <SlidersIcon className="size-[1.125rem]" />
                </IconButton>
              ) : null}
            </div>
            {/* Picking a phone makes no sense on a phone. */}
            <div className="hidden justify-self-center sm:block">{showingFlow ? <span className="block max-w-[28rem] truncate text-ui font-medium text-foreground">{name}</span> : center?.({ scale })}</div>
            {url ? (
              <div className="flex items-center gap-2 [grid-column:3] justify-self-end">
                {flow && addressed ? (
                  showingFlow ? (
                    <Button onClick={() => setFlowOpen(false)}>Back to prototype</Button>
                  ) : (
                    <IconButton label="Flow" onClick={() => setFlowOpen(true)}>
                      <FlowIcon className="size-[1.125rem]" />
                    </IconButton>
                  )
                ) : null}
                {edit && view !== "dev" && !showingFlow ? (
                  <span className="hidden sm:block">
                    <Button onClick={() => setEditingNow(true)}>Edit</Button>
                  </span>
                ) : null}
                {showingFlow ? null : <ViewMenu view={view} onChange={setView} canDev={!narrow} />}
                {showingFlow ? null : (
                  <IconButton label="Open in a new tab" href={newTab} external tooltipAlign="end">
                    <ExternalIcon className="size-[1.125rem]" />
                  </IconButton>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div
        ref={stage}
        // Clicking the tile around the phone lets go of what was picked. A click inside the prototype never reaches here.
        onClick={() => dev && deselect()}
        className={`flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 [scrollbar-width:thin] sm:pb-16 ${showingFlow ? "invisible" : ""} ${dev ? "sm:pr-[calc(var(--dev-panel-width)+2rem)]" : ""}`}>
        <div
          style={scale ? { width: device.width * scale, height: device.height * scale } : { aspectRatio: `${device.width} / ${device.height}` }}
          className={`relative isolate m-auto shrink-0 overflow-hidden rounded-[var(--r-device)] bg-surface [transform:translateZ(0)] ${
            scale ? "" : "h-full"
          }`}
        >
          {url ? (
            <FrameBody key={url} url={url} title={title} poster={screen ? undefined : poster} scale={scale} device={device} wireframe={wireframe} inspect={dev ? { ...inspect, picking: editing ? !interacting : picking } : null} />
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

      {dev && !showingFlow ? (
        <div
          className="absolute right-4 top-[5.5rem] hidden max-h-[calc(100vh-12rem)] w-[var(--dev-panel-width)] overflow-y-auto rounded-[var(--r-xl)] bg-surface p-4 [scrollbar-width:thin] sm:block"
          style={{ zIndex: "var(--z-base)" }}
        >
          {editing && edit ? (
            <EditPanel element={target?.isConnected ? target : null} session={session} />
          ) : (
            <DevPanel picked={here.picked} motion={here.motion} picking={picking} onPicking={setPicking} />
          )}
        </div>
      ) : null}

      {controls && controlsOpen ? (
        <div
          className="absolute left-4 top-[5.5rem] max-h-[calc(100%-7rem)] w-72 overflow-y-auto rounded-[var(--r-xl)] bg-surface p-4"
          style={{ zIndex: "var(--z-base)" }}
        >
          {controls}
        </div>
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
