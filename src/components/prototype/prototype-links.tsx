"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import type { Prototype } from "@/lib/registry/types";

export type LinkKind = "figma" | "notion";

const KINDS: Record<LinkKind, { name: string; icon: string; placeholder: string }> = {
  figma: { name: "Figma", icon: "/icons/figma.png", placeholder: "https://www.figma.com/design/…" },
  notion: { name: "Notion", icon: "/icons/notion.png", placeholder: "https://www.notion.so/…" },
};

/**
 * The prototype's design and write-up. A link that's been given opens in a
 * new tab; one that hasn't says so, and tapping it asks for the address. It
 * is saved for everyone.
 */
export function PrototypeLinks({ prototype }: { prototype: Prototype }) {
  const [adding, setAdding] = useState<LinkKind | null>(null);
  const urls: Record<LinkKind, string | undefined> = {
    figma: prototype.figmaUrl,
    notion: prototype.notionUrl,
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KINDS) as LinkKind[]).map((kind) => {
          const { name, icon } = KINDS[kind];
          const image = (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" width={20} height={20} className="size-5 object-contain" />
          );

          return urls[kind] ? (
            <Button key={kind} href={urls[kind]} external icon={image}>
              Open in {name}
            </Button>
          ) : (
            <Button key={kind} icon={image} onClick={() => setAdding(kind)}>
              Add {name} link
            </Button>
          );
        })}
      </div>

      {adding ? <LinksDialog prototype={prototype} kinds={[adding]} onClose={() => setAdding(null)} /> : null}
    </>
  );
}

/** Paste, change or clear the link for each of `kinds`. Empty removes it. */
export function LinksDialog({
  prototype,
  kinds,
  onClose,
}: {
  prototype: Prototype;
  kinds: LinkKind[];
  onClose: () => void;
}) {
  const { updatePrototype } = useStudio();
  const [values, setValues] = useState<Record<LinkKind, string>>({
    figma: prototype.figmaUrl ?? "",
    notion: prototype.notionUrl ?? "",
  });

  const single = kinds.length === 1 ? KINDS[kinds[0]].name : null;

  return (
    <DialogForm
      title={single ? `${single} link` : "Links"}
      description={
        single
          ? `Paste the ${single} address for this prototype. Everyone will see it.`
          : "Where the design and the write-up live. Leave one empty to remove it."
      }
      submitLabel="Save"
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={() =>
        updatePrototype({
          slug: prototype.slug,
          ...(kinds.includes("figma") ? { figmaUrl: values.figma } : {}),
          ...(kinds.includes("notion") ? { notionUrl: values.notion } : {}),
        })
      }
    >
      {kinds.map((kind, index) => (
        <label key={kind} className="flex flex-col gap-1.5">
          {single ? null : <span className="text-eyebrow">{KINDS[kind].name}</span>}
          <input
            type="url"
            inputMode="url"
            value={values[kind]}
            onChange={(event) => setValues((current) => ({ ...current, [kind]: event.target.value }))}
            placeholder={KINDS[kind].placeholder}
            aria-label={`${KINDS[kind].name} link`}
            autoFocus={index === 0}
            className={fieldClass}
          />
        </label>
      ))}
    </DialogForm>
  );
}
