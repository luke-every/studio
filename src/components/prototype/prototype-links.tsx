"use client";

import { useState } from "react";

import { GithubIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import { linkProblem, type LinkKind } from "@/lib/links";
import type { Prototype } from "@/lib/registry/types";

const KINDS: Record<LinkKind, { name: string; icon: string; placeholder: string }> = {
  figma: { name: "Figma", icon: "/icons/figma.png", placeholder: "https://www.figma.com/design/…" },
  notion: { name: "Notion", icon: "/icons/notion.png", placeholder: "https://www.notion.so/…" },
};

/**
 * Where this version's files are, and the prototype's design and write-up. A link that's been given opens in a
 * new tab; one that hasn't says so, and tapping it asks for the address. It
 * is saved for everyone.
 */
export function PrototypeLinks({ prototype, githubUrl }: { prototype: Prototype; githubUrl?: string }) {
  const { isSaving } = useStudio();
  const [adding, setAdding] = useState<LinkKind | null>(null);
  const urls: Record<LinkKind, string | undefined> = {
    figma: prototype.figmaUrl,
    notion: prototype.notionUrl,
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {githubUrl ? (
          <IconButton label="Open in GitHub" href={githubUrl} external tooltipSide="above" tooltipAlign="start">
            <GithubIcon />
          </IconButton>
        ) : (
          <IconButton label="No files on GitHub for this version" disabled tooltipSide="above" tooltipAlign="start">
            <GithubIcon />
          </IconButton>
        )}
        {(Object.keys(KINDS) as LinkKind[]).map((kind) => {
          const { name, icon } = KINDS[kind];
          const image = (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" width={16} height={16} className="size-4 object-contain" />
          );

          return urls[kind] ? (
            <IconButton key={kind} label={`Open in ${name}`} href={urls[kind]} external tooltipSide="above" tooltipAlign="start" className={isSaving(`link:${kind}`) ? "pulse-soft" : ""}>
              {image}
            </IconButton>
          ) : (
            <IconButton key={kind} label={`Add ${name} link`} tooltipSide="above" tooltipAlign="start" loading={isSaving(`link:${kind}`)} onClick={() => setAdding(kind)}>
              {image}
            </IconButton>
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
