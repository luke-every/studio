"use client";

import { useState } from "react";

import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import { linkProblem, type LinkKind } from "@/lib/links";
import type { Prototype } from "@/lib/registry/types";

const KINDS: Record<LinkKind, { name: string; placeholder: string }> = {
  figma: { name: "Figma", placeholder: "https://www.figma.com/design/…" },
  notion: { name: "Notion", placeholder: "https://www.notion.so/…" },
};

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
      onClose={onClose}
      onSubmit={() => {
        for (const kind of kinds) {
          const problem = linkProblem(kind, values[kind]);
          if (problem) return problem;
        }
        updatePrototype(
          {
            slug: prototype.slug,
            ...(kinds.includes("figma") ? { figmaUrl: values.figma } : {}),
            ...(kinds.includes("notion") ? { notionUrl: values.notion } : {}),
          },
          kinds.map((kind) => `link:${kind}`),
          "Saved",
        );
      }}
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
