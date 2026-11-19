"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useStudio } from "@/lib/data/studio-store";
import { LivePreview } from "@/components/home/live-preview";
import { PlusIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { Stamp } from "@/components/ui/stamp";
import { archiveQaItem, discardQaItem, listQaBranches, listQaItems, newQaItem, openQaInITerm, revealQaFolder, startQaItem, stopQaItem } from "@/lib/registry/actions";
import type { QaItem } from "@/lib/registry/design-qa";

const tile = "relative flex items-center justify-center rounded-[var(--r-tile)] md:h-[var(--tile-height)]";
const STATE_LABEL: Record<QaItem["state"], string> = { preparing: "Preparing", running: "Running", stopped: "Stopped", failed: "Failed" };

/** Every design QA on this machine, and a tile to pull another branch in. */
export function DesignQa() {
  const [items, setItems] = useState<QaItem[] | null>(null);
  // What went wrong reading the list, and what went wrong with the last thing done: the second stays up until something else is done.
  const [listError, setListError] = useState<string | null>(null);
  const [doneError, setDoneError] = useState<string | null>(null);
  const error = doneError ?? listError;
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { prototypes } = useStudio();
  // Into the studio's own view of it. Within the studio when the studio already knows it, with nothing to load again; one pulled since the page was opened takes a whole load, so it is read.
  const open = (item: QaItem) => (prototypes.some((one) => one.slug === item.slug) ? router.push(`/prototypes/${item.slug}`) : window.location.assign(`/prototypes/${item.slug}`));
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const result = await listQaItems();
    if (result.ok) {
      setItems(result.value);
      setListError(null);
    } else setListError(result.error);
  }, []);

  // Setup takes a while: while any is being set up the list is read often, otherwise now and then.
  const preparing = !!items?.some((item) => item.state === "preparing");
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), preparing ? 2000 : 8000);
    window.addEventListener("focus", load);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load, preparing]);

  const act = async (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setDoneError(null);
    const result = await work();
    if (!result.ok) setDoneError(result.error);
    void load();
    return result.ok;
  };

  const live = (items ?? []).filter((item) => !item.archived);
  const archived = (items ?? []).filter((item) => item.archived);

  return (
    <div className="w-full px-5 pb-8 pt-2 sm:px-8 sm:pb-10">
      {error ? (
        <p role="alert" className="pb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-y-8 sm:grid-cols-2 sm:gap-x-4 md:grid-cols-3 md:gap-x-6 md:gap-y-10">
        <article className="flex min-w-0 flex-col gap-4">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`${tile} group py-14 text-foreground-subtle transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:text-foreground-muted`}
          >
            {/* The outline is drawn, not a border: a border's dashes can't be set, and these are 8 long with 8 between. */}
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
              <rect
                x="0.5"
                y="0.5"
                fill="none"
                strokeWidth="1"
                strokeDasharray="8 8"
                style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)", rx: "var(--r-tile)" }}
                className="stroke-border-strong transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] group-hover:stroke-foreground-muted"
              />
            </svg>
            <span className="flex flex-col items-center gap-2 text-sm font-medium">
              <PlusIcon className="size-5" />
              New design QA
            </span>
          </button>
        </article>
        {live.map((item) => (
          <Tile key={item.id} item={item} act={act} open={open} />
        ))}
      </div>

      {archived.length ? (
        <div className="pt-10">
          <IconButton onClick={() => setShowArchived((now) => !now)} aria-expanded={showArchived}>
            Archived ({archived.length})
          </IconButton>
          {showArchived ? (
            <div className="grid grid-cols-1 gap-y-8 pt-6 sm:grid-cols-2 sm:gap-x-4 md:grid-cols-3 md:gap-x-6 md:gap-y-10">
              {archived.map((item) => (
                <Tile key={item.id} item={item} act={act} open={open} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {adding ? <NewDialog onClose={() => setAdding(false)} onCreated={() => void load()} /> : null}
    </div>
  );
}

type Act = (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => Promise<boolean>;
/** How long a server is waited for after Start or Stop before the button stops saying so. */
const WAIT_MS = 90_000;

function Tile({ item, act, open }: { item: QaItem; act: Act; open: (item: QaItem) => void }) {
  // What is being done: a quick thing is busy until it has been done; Start and Stop until the server has come up or gone.
  const [pending, setPending] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<"start" | "stop" | null>(null);
  const go = async (name: string, work: Parameters<Act>[0]) => {
    setPending(name);
    await act(work);
    setPending(null);
  };
  const wait = async (kind: "start" | "stop", work: Parameters<Act>[0]) => {
    setWaiting(kind);
    window.setTimeout(() => setWaiting((now) => (now === kind ? null : now)), WAIT_MS);
    if (!(await act(work))) setWaiting(null);
  };
  const starting = waiting === "start" && item.state === "stopped";
  const stopping = waiting === "stop" && item.state === "running";
  return (
    <article className={`flex min-w-0 flex-col gap-4 ${item.archived ? "opacity-60" : ""}`}>
      <div className={`${tile} bg-tile ${item.state === "running" ? "px-[25%]" : "px-[12%]"} py-14 md:py-0`}>
        <span className="absolute left-3 top-3 rounded-[var(--r-tag)] bg-surface px-2.5 py-1 text-xs font-medium text-foreground md:left-4 md:top-4">
          {item.archived ? "Archived" : STATE_LABEL[item.state]}
        </span>
        {item.state === "running" ? (
          // The app itself, running, in a phone's place: a branch brings no picture of its own.
          <button type="button" aria-label={`Open ${item.branch}`} onClick={() => open(item)} className="relative aspect-[9/19.5] w-[min(100%,var(--tile-device-width))] cursor-pointer overflow-hidden rounded-[var(--r-device)]">
            <LivePreview src={`http://localhost:${item.framePort}/`} title={item.branch} />
          </button>
        ) : null}
        <div className="flex max-w-full flex-col items-center gap-2 text-center">
          {item.state === "preparing" ? <span className="pulse-soft text-sm text-foreground-muted">{item.step || "Preparing"}…</span> : null}
          {item.state === "failed" ? <pre className="max-h-48 max-w-full overflow-auto whitespace-pre-wrap break-words text-left text-xs text-foreground-muted [scrollbar-width:thin]">{item.problem || "Setup didn't finish."}</pre> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 px-1">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">{item.branch}</p>
          <p className="truncate text-sm text-foreground-muted">
            {item.state === "running" ? `localhost:${item.port} · ` : ""}Pulled <Stamp iso={item.createdAt} relative />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.state === "running" ? <IconButton onClick={() => open(item)}>Open</IconButton> : null}
          {item.state === "stopped" ? (
            <IconButton loading={starting} disabled={starting} onClick={() => void wait("start", () => startQaItem(item.id))}>
              Start
            </IconButton>
          ) : null}
          {item.state === "running" ? (
            <IconButton loading={stopping} disabled={stopping} onClick={() => void wait("stop", () => stopQaItem(item.id))}>
              Stop
            </IconButton>
          ) : null}
          {item.state !== "preparing" && item.state !== "failed" ? (
            <IconButton loading={pending === "iterm"} disabled={pending === "iterm"} onClick={() => void go("iterm", () => openQaInITerm(item.id))}>
              Open in iTerm
            </IconButton>
          ) : null}
          {item.state !== "preparing" ? (
            <IconButton loading={pending === "folder"} disabled={pending === "folder"} onClick={() => void go("folder", () => revealQaFolder(item.id))}>
              Folder
            </IconButton>
          ) : null}
          {item.state === "failed" ? (
            <IconButton loading={pending === "discard"} disabled={pending === "discard"} onClick={() => void go("discard", () => discardQaItem(item.id))}>
              Discard
            </IconButton>
          ) : null}
          {item.state !== "preparing" && item.state !== "failed" ? (
            <IconButton variant="ghost" loading={pending === "archive"} disabled={pending === "archive"} onClick={() => void go("archive", () => archiveQaItem(item.id, !item.archived))}>
              {item.archived ? "Restore" : "Archive"}
            </IconButton>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type Branch = { name: string; at: string; author: string };

/** Which branch to pull in: the website's, the most recently touched first, narrowed by what is typed. */
function NewDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    void listQaBranches().then((result) => {
      if (stale) return;
      if (result.ok) setBranches(result.value);
      else setProblem(result.error);
    });
    return () => {
      stale = true;
    };
  }, []);

  const shown = (branches ?? []).filter((branch) => branch.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <DialogForm
      title="New design QA"
      submitLabel="Pull branch"
      busyLabel="Pulling…"
      disabled={!picked}
      onClose={onClose}
      onSubmit={async () => {
        const result = await newQaItem(picked!);
        if (!result.ok) return result.error;
        onCreated();
      }}
    >
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches" aria-label="Search branches" autoFocus className={fieldClass} />
      <div role="listbox" aria-label="Branches" className="-mx-1 flex max-h-72 flex-col overflow-y-auto [scrollbar-width:thin]">
        {branches === null && !problem ? <p className="pulse-soft px-2 py-3 text-sm text-foreground-muted">Asking GitHub…</p> : null}
        {problem ? <p className="px-2 py-3 text-sm text-destructive">{problem}</p> : null}
        {branches && !shown.length ? <p className="px-2 py-3 text-sm text-foreground-muted">No branch matches.</p> : null}
        {shown.map((branch) => (
          <button
            key={branch.name}
            type="button"
            role="option"
            aria-selected={picked === branch.name}
            onClick={() => setPicked(branch.name)}
            className={`flex items-center justify-between gap-3 rounded-[var(--r-control)] px-2 py-1.5 text-left text-sm transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover ${picked === branch.name ? "bg-surface-hover text-foreground" : "text-foreground-muted"}`}
          >
            <span className="truncate">{branch.name}</span>
            <span className="shrink-0 text-xs text-foreground-subtle">
              {branch.author} · <Stamp iso={branch.at} relative />
            </span>
          </button>
        ))}
      </div>
    </DialogForm>
  );
}
