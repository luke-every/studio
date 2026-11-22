"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { canHover, MotionPopover } from "@/components/motion";
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DocumentIcon,
  ExternalIcon,
  FigmaIcon,
  ImageIcon,
  ImportIcon,
  LinkIcon,
  PlusIcon,
  UploadIcon,
} from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { ConfirmPopover } from "@/components/ui/confirm-popover";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { menuItem } from "@/components/ui/menu-item";
import { useStudio } from "@/lib/data/studio-store";
import { linkProblem } from "@/lib/links";
import { CopyDocDialog } from "./copy-doc-dialog";
import { CopyUpdateDialog } from "./copy-update-dialog";
import { CopyImportDialog } from "./copy-import-dialog";
import {
  clearCopyDocsTask,
  deleteCopyDoc,
  dismissCopyDocDelete,
  forgetCopyDoc,
  linkCopyDoc,
  retryCopyDocDelete,
  previewClaudeUpdate,
  readCopyDocs,
} from "@/lib/registry/actions";
import type { CopyDocs, CopyKind, DocChange } from "@/lib/registry/copy-docs";

const row = `${menuItem} text-foreground`;
const note = "px-2.5 py-1.5 text-nav";
const NAMES: Record<CopyKind, string> = {
  claude: "Claude copy doc",
  notion: "Notion copy doc",
};
/** What a document is called in its row: the row says what it is, and the dialogs what is being done to it. */
const SHORT: Record<CopyKind, string> = {
  claude: "Claude doc",
  notion: "Notion page",
};

type Props = {
  slug: string;
  name: string;
  figmaUrl?: string;
  githubUrl?: string;
  notionUrl?: string;
  /** On the canvas it is drawn as the buttons beside it are: ghost, with its label below. */
  variant?: "ghost";
  /** Opens the export of the prototype's images, a row at the foot of the menu. */
  onExport?: () => void;
};

/** Only where documents can be made (on this machine, in development): there it is always in the bar, from the first paint; elsewhere it isn't built in. */
export function CopyDocsMenu(props: Props) {
  if (process.env.NODE_ENV !== "development") return null;
  return <Menu {...props} />;
}

/**
 * The prototype's copy documents, beside the canvas button: a Claude doc and a Notion copy, each made, linked (one made already, somewhere),
 * opened and taken away on its own, and the links the prototype has (its design, its source, its write-up).
 */
function Menu({ slug, name, figmaUrl, githubUrl, notionUrl, variant, onExport }: Props) {
  const [docs, setDocs] = useState<CopyDocs | null>(null);
  const [here, setHere] = useState(true);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<{
    kind: CopyKind;
    mode: "create" | "link";
  } | null>(null);
  const [address, setAddress] = useState("");
  const [asking, setAsking] = useState<CopyKind | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Which address was just copied: its icon says so for a moment.
  const [copied, setCopied] = useState<
    CopyKind | "figma" | "notion-link" | null
  >(null);
  const { updatePrototype } = useStudio();
  // The project's own links (its design, its write-up): the one being linked, and the one being asked about taking off.
  const [linkingProject, setLinkingProject] = useState<
    "figma" | "notion" | null
  >(null);
  const [askingProject, setAskingProject] = useState<"figma" | "notion" | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  // The Claude doc's lines that no longer say what the prototype says, read each time the menu is opened; and the dialog that brings them up to date.
  const [outdated, setOutdated] = useState<{
    changed: DocChange[];
    removed: { key: string; was: string }[];
  }>({ changed: [], removed: [] });
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    const result = await readCopyDocs(slug);
    if (result.ok) setDocs(result.value);
    else setHere(false);
  }, [slug]);

  // Read when it is shown, and often while something is being made or deleted.
  const busy = Object.values(docs?.tasks ?? {}).some(
    (task) => task?.state === "running",
  );
  // A delete in the background has nothing to show while it goes, but is watched for failing.
  const deleting = Object.values(docs?.pendingDeletes ?? {}).some(
    (pending) => pending && !pending.error,
  );
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer =
      busy || deleting
        ? window.setInterval(() => void load(), 2000)
        : undefined;
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load, busy, deleting]);

  const snapshotted = docs?.claude?.snapshot;
  const madeHere = !!docs?.claude && !docs.claude.linked;
  useEffect(() => {
    if (!open || !madeHere) return;
    let stale = false;
    void previewClaudeUpdate(slug).then((result) => {
      if (!stale && result.ok)
        setOutdated({
          changed: result.value.changed,
          removed: result.value.removed,
        });
    });
    return () => {
      stale = true;
    };
  }, [open, slug, snapshotted, madeHere]);

  // A read that fails (not on this machine) takes it away; until the first read is back it is there, saying so.
  if (!here) return null;

  const act = async (
    work: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) => {
    setProblem(null);
    const result = await work();
    if (!result.ok) setProblem(result.error);
    void load();
  };
  const ask = (kind: CopyKind, mode: "create" | "link") => {
    setAddress(kind === "notion" && mode === "create" ? (notionUrl ?? "") : "");
    setOpen(false);
    setDialog({ kind, mode });
  };

  /**
   * One of the two documents, as one row that is whichever of these it is: empty (its two ways to get one, make it or link one made already),
   * being made or deleted, or there (open it, or take it away); with what went wrong, if something did, under it.
   */
  const section = (kind: CopyKind): ReactNode => {
    const task = docs?.tasks?.[kind];
    const doc = docs?.[kind];
    const working = task?.state === "running";
    const label = SHORT[kind];
    return (
      <div className="flex flex-col">
        {working ? (
          <p
            role="status"
            className={`pulse-soft flex items-center gap-2.5 ${note} text-foreground-muted`}
          >
            <DocumentIcon />
            {task.step}…
          </p>
        ) : doc ? (
          <div className="flex items-center gap-1">
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              className={`${row} flex-1`}
            >
              <DocumentIcon />
              <span className="truncate">{label}</span>
            </a>
            {kind === "claude" && !doc.linked ? (
              <IconButton
                variant="ghost"
                size="sm"
                label={
                  outdated.changed.length
                    ? `Push ${outdated.changed.length} changed ${outdated.changed.length === 1 ? "line" : "lines"} to the doc`
                    : "Push changed copy to the doc"
                }
                onClick={() => {
                  setOpen(false);
                  setUpdating(true);
                }}
              >
                <UploadIcon className="size-3.5" />
                {outdated.changed.length ? (
                  <span className="text-xs tabular-nums">
                    {outdated.changed.length}
                  </span>
                ) : null}
              </IconButton>
            ) : null}
            <IconButton
              variant="ghost"
              size="sm"
              label={copied === kind ? "Copied" : `Copy ${label} link`}
              onClick={() => {
                void navigator.clipboard.writeText(doc.url).then(() => {
                  setCopied(kind);
                  window.setTimeout(
                    () => setCopied((now) => (now === kind ? null : now)),
                    1500,
                  );
                });
              }}
            >
              {copied === kind ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </IconButton>
            <ConfirmPopover
              open={asking === kind}
              onClose={() => setAsking(null)}
              message={
                doc.linked
                  ? "Are you sure you want to take this off the list? The document itself isn't touched."
                  : kind === "claude"
                    ? "Are you sure you want to delete this Claude doc? It is deleted there too."
                    : "Are you sure you want to remove the copy from the Notion page? The rest of the page stays."
              }
              confirmLabel={
                doc.linked || kind === "notion" ? "Remove" : "Delete"
              }
              tone="destructive"
              onConfirm={() => {
                // Gone from the list at once: it is deleted behind the scenes, and offered back only if that fails.
                setDocs((now) => {
                  if (!now) return now;
                  const next = { ...now };
                  delete next[kind];
                  return next;
                });
                void act(() => deleteCopyDoc(slug, kind));
              }}
              trigger={
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={doc.linked ? `Unlink ${label}` : `Remove ${label}`}
                  onClick={() =>
                    setAsking((now) => (now === kind ? null : kind))
                  }
                >
                  <CloseIcon className="size-3.5" />
                </IconButton>
              }
            />
          </div>
        ) : docs ? (
          <div className="flex items-center gap-1">
            <p
              className={`flex min-w-0 flex-1 items-center gap-2.5 ${note} text-foreground-muted`}
            >
              <DocumentIcon />
              <span className="truncate">{label}</span>
            </p>
            <IconButton
              variant="ghost"
              size="sm"
              label={`Create ${label}`}
              onClick={() => ask(kind, "create")}
            >
              <PlusIcon className="size-3.5" />
            </IconButton>
            <IconButton
              variant="ghost"
              size="sm"
              label={`Link a ${label}`}
              onClick={() => ask(kind, "link")}
            >
              <LinkIcon className="size-3.5" />
            </IconButton>
          </div>
        ) : null}

        {docs?.pendingDeletes?.[kind]?.error ? (
          <div className="flex flex-col gap-2 px-2.5 py-1.5">
            <p role="alert" className="text-nav text-destructive">
              The {label} couldn&rsquo;t be deleted, so it is still there.
            </p>
            <div className="flex flex-wrap gap-2">
              <IconButton
                size="sm"
                href={docs.pendingDeletes[kind]!.doc.url}
                external
              >
                Open it
              </IconButton>
              <IconButton
                size="sm"
                onClick={() => void act(() => retryCopyDocDelete(slug, kind))}
              >
                Try again
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                onClick={() => void act(() => dismissCopyDocDelete(slug, kind))}
              >
                Dismiss
              </IconButton>
            </div>
          </div>
        ) : null}

        {task?.state === "failed" ? (
          <div className="flex flex-col gap-2 px-2.5 py-1.5">
            <p role="alert" className="text-nav text-destructive">
              {task.error ?? "It didn't finish."}
            </p>
            <div className="flex gap-2">
              <IconButton
                size="sm"
                onClick={() => void act(() => clearCopyDocsTask(slug, kind))}
              >
                Dismiss
              </IconButton>
              {task.kind === "delete" ? (
                <IconButton
                  size="sm"
                  onClick={() => void act(() => forgetCopyDoc(slug, kind))}
                >
                  Take off the list
                </IconButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  /**
   * One of the project's own links, its Notion docs or its design: only ever linked, never made here. The same row as the documents' in each of its
   * states: empty (a link icon), or there (tap it to open; copy its address, or take it off the list).
   */
  const projectRow = (kind: "figma" | "notion"): ReactNode => {
    const url = kind === "figma" ? figmaUrl : notionUrl;
    const label = kind === "figma" ? "Figma" : "Notion";
    const Icon = kind === "figma" ? FigmaIcon : DocumentIcon;
    const copiedKey = kind === "figma" ? "figma" : "notion-link";
    return (
      <div className="flex items-center gap-1">
        {url ? (
          <>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              className={`${row} flex-1`}
            >
              <Icon />
              <span className="truncate">{label}</span>
            </a>
            <IconButton
              variant="ghost"
              size="sm"
              label={copied === copiedKey ? "Copied" : `Copy ${label} link`}
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(copiedKey);
                  window.setTimeout(
                    () => setCopied((now) => (now === copiedKey ? null : now)),
                    1500,
                  );
                });
              }}
            >
              {copied === copiedKey ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </IconButton>
            <ConfirmPopover
              open={askingProject === kind}
              onClose={() => setAskingProject(null)}
              message={`Are you sure you want to take this off the list? The ${label} page itself isn't touched.`}
              confirmLabel="Remove"
              tone="destructive"
              onConfirm={() =>
                updatePrototype(
                  kind === "figma"
                    ? { slug, figmaUrl: "" }
                    : { slug, notionUrl: "" },
                  [`link:${kind}`],
                  "Removed",
                )
              }
              trigger={
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={`Unlink ${label}`}
                  onClick={() =>
                    setAskingProject((now) => (now === kind ? null : kind))
                  }
                >
                  <CloseIcon className="size-3.5" />
                </IconButton>
              }
            />
          </>
        ) : (
          <>
            <p
              className={`flex min-w-0 flex-1 items-center gap-2.5 ${note} text-foreground-muted`}
            >
              <Icon />
              <span className="truncate">{label}</span>
            </p>
            <IconButton
              variant="ghost"
              size="sm"
              label={`Link ${kind === "figma" ? "a Figma file" : "the project's Notion page"}`}
              onClick={() => {
                setAddress("");
                setOpen(false);
                setLinkingProject(kind);
              }}
            >
              <LinkIcon className="size-3.5" />
            </IconButton>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <MotionPopover
        open={open}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        align="start"
        // Not clipped to the menu: an icon's label (what it does, on hover) hangs below and beside it, past the menu's edge.
        className="w-64 !overflow-visible"
        trigger={
          <IconButton
            label="Docs"
            variant={variant}
            tooltip={false}
            loading={busy}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((now) => canHover() || !now)}
          >
            <DocumentIcon />
          </IconButton>
        }
      >
        <div role="menu" aria-label="Docs" className="flex flex-col">
          {docs === null ? (
            <p
              role="status"
              className={`pulse-soft ${note} text-foreground-muted`}
            >
              Looking…
            </p>
          ) : null}
          {problem ? (
            <p role="alert" className={`${note} text-destructive`}>
              {problem}
            </p>
          ) : null}
          {projectRow("notion")}
          {projectRow("figma")}
          <div className="mt-1 flex flex-col border-t border-divider pt-1">
            <p className={`${note} text-eyebrow`}>Copy</p>
            {section("claude")}
            {section("notion")}
            <button
              type="button"
              role="menuitem"
              className={row}
              onClick={() => {
                setOpen(false);
                setImporting(true);
              }}
            >
              <ImportIcon />
              Update copy
            </button>
          </div>
          {githubUrl || onExport ? (
            <div className="mt-1 flex flex-col border-t border-divider pt-1">
              {githubUrl ? (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  role="menuitem"
                  className={row}
                >
                  GitHub source
                  <ExternalIcon className="ml-auto text-foreground-subtle" />
                </a>
              ) : null}
              {onExport ? (
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="dialog"
                  className={row}
                  onClick={() => {
                    setOpen(false);
                    onExport();
                  }}
                >
                  <ImageIcon />
                  Export images
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </MotionPopover>

      {/* On the page itself, not in the bar: a dialog is as large as the window, and the bar's own animation would hold it inside the bar. */}
      {/* On the page itself, not in the bar: a dialog is as large as the window, and the bar's own animation would hold it inside the bar. */}
      {dialog?.mode === "create"
        ? createPortal(
            <CopyDocDialog
              slug={slug}
              name={name}
              kind={dialog.kind}
              address={address}
              onClose={() => setDialog(null)}
              onDone={() => void load()}
            />,
            document.body,
          )
        : null}
      {dialog?.mode === "link"
        ? createPortal(
            <DialogForm
              title={`Link ${NAMES[dialog.kind]}`}
              submitLabel="Link"
              busyLabel="Linking…"
              onClose={() => setDialog(null)}
              onSubmit={async () => {
                const result = await linkCopyDoc(
                  slug,
                  name,
                  dialog.kind,
                  address,
                );
                if (!result.ok) return result.error;
                void load();
              }}
            >
              <input
                type="url"
                inputMode="url"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={
                  dialog.kind === "notion"
                    ? "Notion page address"
                    : "Claude doc address"
                }
                aria-label={
                  dialog.kind === "notion"
                    ? "Notion page address"
                    : "Claude doc address"
                }
                autoFocus
                className={fieldClass}
              />
            </DialogForm>,
            document.body,
          )
        : null}
      {linkingProject
        ? createPortal(
            <DialogForm
              title={
                linkingProject === "figma"
                  ? "Link Figma file"
                  : "Link Notion page"
              }
              submitLabel="Link"
              busyLabel="Linking…"
              onClose={() => setLinkingProject(null)}
              onSubmit={() => {
                const kind = linkingProject;
                if (!address.trim())
                  return kind === "figma"
                    ? "Paste the Figma address."
                    : "Paste the Notion address.";
                const problem = linkProblem(kind, address);
                if (problem) return problem;
                updatePrototype(
                  kind === "figma"
                    ? { slug, figmaUrl: address.trim() }
                    : { slug, notionUrl: address.trim() },
                  [`link:${kind}`],
                  "Saved",
                );
              }}
            >
              <input
                type="url"
                inputMode="url"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={
                  linkingProject === "figma"
                    ? "Figma file address"
                    : "Notion page address"
                }
                aria-label={
                  linkingProject === "figma"
                    ? "Figma file address"
                    : "Notion page address"
                }
                autoFocus
                className={fieldClass}
              />
            </DialogForm>,
            document.body,
          )
        : null}
      {importing ? (
        <CopyImportDialog slug={slug} canPull={!!docs?.claude} onClose={() => setImporting(false)} />
      ) : null}
      {updating
        ? createPortal(
            <CopyUpdateDialog
              slug={slug}
              onClose={() => setUpdating(false)}
              onDone={() => void load()}
            />,
            document.body,
          )
        : null}
    </>
  );
}
