"use client";

import { useState } from "react";

import type { EditSession } from "@/components/prototype/use-edit-session";
import { RedoIcon, UndoIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { saveEdits } from "@/lib/registry/actions";
import { useUser } from "@/lib/use-user";

const NAME_KEY = "studio.name";
const rememberedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

/**
 * What edit mode keeps in the top bar: undo, redo, and one Save. Saving makes
 * a new version; nothing is written to the one being looked at. The first
 * time, a guest is asked whose edits these are, and it remembers.
 */
export function EditBar({ session, slug, baseVersionId }: { session: EditSession; slug: string; baseVersionId: string }) {
  const { notify } = useStudio();
  const user = useUser();
  const [typed, setTyped] = useState(rememberedName);
  // Who you chose at the door is who the edits are credited to; a guest says their name once.
  const name = user.name || typed;
  const setName = setTyped;
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const count = session.edits.length;

  const save = async (by: string) => {
    if (!by.trim()) {
      setAsking(true);
      return;
    }
    setSaving(true);
    setAsking(false);
    const form = new FormData();
    form.set("slug", slug);
    form.set("baseVersionId", baseVersionId);
    form.set("by", by.trim());
    form.set("edits", JSON.stringify(session.edits));
    for (const [path, file] of session.imagesInUse()) form.set(path, file);
    const result = await saveEdits(form);
    if (!result.ok) {
      setSaving(false);
      notify(result.error);
      return;
    }
    try {
      localStorage.setItem(NAME_KEY, by.trim());
    } catch {
      // Not remembering the name is fine.
    }
    // A full load, not a client navigation: the version is read from the address bar, and the new one only exists once the pages regenerate.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/prototypes/${slug}?v=${result.value.version}`);
  };

  return (
    <div className="relative flex items-center gap-2">
      <IconButton label="Undo (⌘Z)" onClick={session.undo} disabled={!session.canUndo || saving}>
        <UndoIcon />
      </IconButton>
      <IconButton label="Redo (⌘⇧Z)" onClick={session.redo} disabled={!session.canRedo || saving}>
        <RedoIcon />
      </IconButton>
      <IconButton variant="primary" onClick={() => save(name)} disabled={!count || saving} loading={saving}>
        Save
      </IconButton>

      {asking ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(name);
          }}
          className="absolute right-0 top-full mt-2 flex w-64 flex-col gap-2 rounded-[var(--r-xl)] bg-surface p-3"
          style={{ zIndex: "var(--z-popover)" }}
        >
          <label className="text-sm text-foreground-muted" htmlFor="edit-by">
            Your name, so the studio knows who made this version
          </label>
          <input
            id="edit-by"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8 rounded-[var(--r-md)] bg-surface-inset px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
          />
          <IconButton variant="primary" type="submit" disabled={!name.trim()}>
            Save version
          </IconButton>
        </form>
      ) : null}
    </div>
  );
}
