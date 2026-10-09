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
 * What edit mode keeps in the top bar: undo, redo, Save and Save as variant.
 * Saving makes a new version; nothing is written to the one being looked at.
 * A variant keeps the edits as a named option beside the version's others,
 * shown only when picked, so the version itself stays as it was. The first
 * time, a guest is asked whose edits these are, and it remembers.
 */
export function EditBar({
  session,
  slug,
  baseVersionId,
  variantId,
}: {
  session: EditSession;
  slug: string;
  baseVersionId: string;
  /** The variant being looked at, which a new one is built on. */
  variantId?: string;
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
      <IconButton label="Undo (⌘Z)" onClick={session.undo} disabled={!session.canUndo || saving}>
        <UndoIcon />
      </IconButton>
      <IconButton label="Redo (⌘⇧Z)" onClick={session.redo} disabled={!session.canRedo || saving}>
        <RedoIcon />
      </IconButton>
      <IconButton onClick={() => setAsking(asking === "variant" ? null : "variant")} disabled={!count || saving} aria-expanded={asking === "variant"}>
        Save as variant
      </IconButton>
      <IconButton variant="primary" onClick={() => save(name)} disabled={!count || saving} loading={saving}>
        Save
      </IconButton>

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
