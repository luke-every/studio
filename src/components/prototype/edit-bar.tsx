"use client";

import { useEffect, useRef, useState } from "react";

import type { EditSession } from "@/components/prototype/use-edit-session";
import { RedoIcon, UndoIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { saveEdits, saveLiveEdits } from "@/lib/registry/actions";

import { useUser } from "@/lib/use-user";

/** How long after an edit a live version saves by itself: none. Edits made while one is being written go in the next, as soon as it is done. */
const AUTO_SAVE_MS = 0;

const NAME_KEY = "studio.name";
const rememberedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

/**
 * What edit mode keeps in the top bar: undo, redo, Save and Save as variant.
 * Saving makes a new version; nothing is written to the one being looked at.
 * On the canvas it sits beside the zoom at the top right; its Save is there only while something has been changed.
 * A variant keeps the edits as a named option beside the version's others,
 * shown only when picked, so the version itself stays as it was. The first
 * time, a guest is asked whose edits these are, and it remembers.
 *
 * On a live version (`live`) there is no version to save: the copy is written
 * straight into the prototype's own code (see `live-edits.ts`), by itself a
 * moment after each edit, and what can't be written stays as a preview.
 */
/** Undo and redo, as a card of their own beside the canvas's controls. */
export function EditHistory({ session }: { session: EditSession }) {
  return (
    <>
      <IconButton variant="ghost" label="Undo (⌘Z)" tooltipSide="below" onClick={session.undo} disabled={!session.canUndo}>
        <UndoIcon />
      </IconButton>
      <IconButton variant="ghost" label="Redo (⌘⇧Z)" tooltipSide="below" onClick={session.redo} disabled={!session.canRedo}>
        <RedoIcon />
      </IconButton>
    </>
  );
}

export function EditBar({
  session,
  slug,
  baseVersionId,
  variantId,
  versionOnly = false,
  live,
  history = true,
}: {
  session: EditSession;
  slug: string;
  baseVersionId: string;
  /** The variant being looked at, which a new one is built on. */
  variantId?: string;
  /** No Save as variant: on the canvas an edit is drawn on every screen, which is what saving a version does and saving a variant would not. */
  versionOnly?: boolean;
  /** A live version: Save writes into its code. */
  live?: boolean;
  /** Undo and redo are in this bar. False where they are shown elsewhere (`EditHistory`). */
  history?: boolean;
}) {
  const { notify } = useStudio();
  const user = useUser();
  const [typed, setTyped] = useState(rememberedName);
  // Who you chose at the door is who the edits are credited to; a guest says their name once.
  const name = user.name || typed;
  const setName = setTyped;
  const [asking, setAsking] = useState<"save" | "variant" | null>(null);
  const [variantName, setVariantName] = useState("");
  const [saving, setSaving] = useState(false);
  const count = session.edits.length;

  // On a live version, Save writes the copy into the prototype's own code; what was written is let go of here, the rest stays.
  // `auto` is the save that happens by itself a moment after an edit: quiet unless something couldn't be written.
  const writtenAs = useRef(new Map<number, string>());
  const lineOf = useRef(new Map<string, number>());
  const latest = useRef(session);
  useEffect(() => {
    latest.current = session;
  });
  const saveToCode = async (auto = false) => {
    setSaving(true);
    const form = new FormData();
    form.set("slug", slug);
    // Once the page has drawn an edit, the words no longer carry the mark that says which line they are; so which line an element is stays as it was first seen.
    const sent = session.edits.map((edit) => {
      if (edit.kind !== "text") return edit;
      const key = `${edit.selector}:${edit.node ?? ""}`;
      if (edit.copy !== undefined) lineOf.current.set(key, edit.copy);
      const copy = edit.copy ?? lineOf.current.get(key);
      // A line already written by an earlier save is what the next edit of it starts from: typing on after the first letter was saved.
      return copy === undefined ? edit : { ...edit, copy, was: writtenAs.current.get(copy) ?? edit.was };
    });
    form.set("edits", JSON.stringify(sent));
    for (const [path, file] of session.imagesInUse()) form.set(path, file);
    const result = await saveLiveEdits(form);
    setSaving(false);
    if (!result.ok) return notify(result.error, true);
    const { saved, where, left } = result.value;
    // Only what was sent is let go of: letters typed while it was being written stay, and go in the next save.
    for (const edit of sent) {
      if (!saved.includes(edit.selector)) continue;
      if (edit.kind === "text" && edit.copy !== undefined) writtenAs.current.set(edit.copy, edit.text);
      const now = latest.current.edits.find((one) => one.selector === edit.selector && one.kind === edit.kind);
      if (!now || edit.kind !== "text" || (now.kind === "text" && now.text === edit.text)) session.reset(edit.selector);
    }
    const wrote = saved.length ? `Saved ${saved.length} ${saved.length === 1 ? "change" : "changes"} to copy.ts (${where.join(", ")}).` : "";
    if (auto && !left.length) return;
    notify([wrote, ...left.slice(0, 2).map((item) => item.why)].filter(Boolean).join(" "), !saved.length);
  };

  // On a live version nobody presses Save: a moment after the last edit it is written into the code. Edits that can't be written stay as a preview, and
  // aren't tried again until something changes (or the whole would be tried over and over).
  const tried = useRef("");
  useEffect(() => {
    if (!live || !count || saving) return;
    const now = JSON.stringify(session.edits);
    if (now === tried.current) return;
    const timer = window.setTimeout(() => {
      tried.current = now;
      void saveToCode(true);
    }, AUTO_SAVE_MS);
    return () => window.clearTimeout(timer);
    // `saveToCode` reads the session as it is when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, session.edits, saving, count]);

  const save = async (by: string, variant?: { id: string; label: string }) => {
    if (!by.trim()) {
      setAsking(variant ? "variant" : "save");
      return;
    }
    setSaving(true);
    setAsking(null);
    const form = new FormData();
    form.set("slug", slug);
    form.set("baseVersionId", baseVersionId);
    form.set("by", by.trim());
    form.set("edits", JSON.stringify(session.edits));
    if (variant) {
      form.set("variantId", variant.id);
      form.set("variantLabel", variant.label);
      if (variantId) form.set("variantBasedOn", variantId);
    }
    for (const [path, file] of session.imagesInUse()) form.set(path, file);
    const result = await saveEdits(form);
    if (!result.ok) {
      setSaving(false);
      notify(result.error, true);
      return;
    }
    try {
      localStorage.setItem(NAME_KEY, by.trim());
    } catch {
      // Not remembering the name is fine.
    }
    // A full load, not a client navigation: the version is read from the address bar, and the new one only exists once the pages regenerate.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/prototypes/${slug}?v=${result.value.version}${variant ? `&variant=${variant.id}` : ""}`);
  };

  const saveVariant = () => {
    const label = variantName.trim();
    if (!label) return;
    const slugged = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "variant";
    save(name, { id: `${slugged}-${Math.random().toString(36).slice(2, 6)}`, label });
  };

  return (
    <div className="relative flex items-center gap-2">
      {history ? (
        <>
          <IconButton label="Undo (⌘Z)" onClick={session.undo} disabled={!session.canUndo || saving}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Redo (⌘⇧Z)" onClick={session.redo} disabled={!session.canRedo || saving}>
            <RedoIcon />
          </IconButton>
        </>
      ) : null}
      {versionOnly || live ? null : (
        <IconButton onClick={() => setAsking(asking === "variant" ? null : "variant")} disabled={!count || saving} aria-expanded={asking === "variant"}>
          Save as variant
        </IconButton>
      )}
      {live ? null : versionOnly && !count && !saving && !asking ? null : (
        <IconButton variant="primary" onClick={() => save(name)} disabled={!count || saving} loading={saving}>
          {versionOnly ? "Save as new version" : "Save"}
        </IconButton>
      )}

      {asking ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (asking === "variant") saveVariant();
            else save(name);
          }}
          data-native-undo
          className="absolute right-0 top-full mt-2 flex w-64 flex-col gap-2 rounded-[var(--r-xl)] bg-surface p-3"
          style={{ zIndex: "var(--z-popover)" }}
        >
          {asking === "variant" ? (
            <>
              <label className="text-sm text-foreground-muted" htmlFor="edit-variant">
                What should this variant be called?
              </label>
              <input
                id="edit-variant"
                autoFocus
                value={variantName}
                onChange={(event) => setVariantName(event.target.value)}
                placeholder="Shorter headline"
                className="h-8 rounded-[var(--r-md)] bg-surface-inset px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
              />
            </>
          ) : null}
          {!name.trim() ? (
            <>
              <label className="text-sm text-foreground-muted" htmlFor="edit-by">
                Your name, so the studio knows who made this version
              </label>
              <input
                id="edit-by"
                autoFocus={asking === "save"}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-8 rounded-[var(--r-md)] bg-surface-inset px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
              />
            </>
          ) : null}
          <IconButton variant="primary" type="submit" disabled={asking === "variant" ? !variantName.trim() || !name.trim() : !name.trim()}>
            {asking === "variant" ? "Save variant" : "Save version"}
          </IconButton>
        </form>
      ) : null}
    </div>
  );
}
