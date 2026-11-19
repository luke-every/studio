"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { readSeenLines } from "@/lib/prototype-frame-ref";
import { createCopyDoc, readCopySections } from "@/lib/registry/actions";
import type { CopyKind } from "@/lib/registry/copy-docs";

type Sections = {
  name: string;
  blurb: string;
  entries: { key: string; what: string; value: string; index: number }[];
}[];

const box = "size-4 shrink-0 accent-[var(--selection)]";

/** A checkbox that can be half ticked: some of a section's lines are chosen. */
function Tick({
  checked,
  some,
  onChange,
  label,
}: {
  checked: boolean;
  some: boolean;
  onChange: () => void;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = some && !checked;
  }, [some, checked]);
  return (
    <input
      ref={input}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className={box}
    />
  );
}

/**
 * Making a copy document: which lines go in it, and (for Notion) the page they go on. A copy file holds the words of every variation of a
 * prototype, and a document is usually about one, so the lines are chosen here, by section or one at a time; what was chosen last time is
 * ticked, and the first time everything is.
 */
export function CopyDocDialog({
  slug,
  name,
  kind,
  address: first,
  onClose,
  onDone,
}: {
  slug: string;
  name: string;
  kind: CopyKind;
  address: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [sections, setSections] = useState<Sections | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [address, setAddress] = useState(first);
  const [problem, setProblem] = useState<string | null>(null);
  // The numbers of the lines the page shows now: null where the page can't say (no dev server running for it, or one that is older than this question).
  const [seen, setSeen] = useState<ReadonlySet<number> | null>(null);

  useEffect(() => {
    let stale = false;
    void Promise.all([readCopySections(slug), readSeenLines()]).then(
      ([result, lines]) => {
        if (stale) return;
        if (!result.ok) return setProblem(result.error);
        setSections(result.value.groups);
        setSeen(lines ? new Set(lines) : null);
        const entries = result.value.groups.flatMap((group) => group.entries);
        const saved = result.value.saved?.filter((key) =>
          entries.some((entry) => entry.key === key),
        );
        // What was chosen last time; the first time, what the page shows when it can say (a line it never puts out isn't copy anyone sees), else everything.
        const onPage = lines
          ? entries
              .filter((entry) => lines.includes(entry.index))
              .map((entry) => entry.key)
          : [];
        setChosen(
          new Set(
            saved?.length
              ? saved
              : onPage.length
                ? onPage
                : entries.map((entry) => entry.key),
          ),
        );
      },
    );
    return () => {
      stale = true;
    };
  }, [slug]);

  const total =
    sections?.reduce((sum, group) => sum + group.entries.length, 0) ?? 0;
  const everyEntry = sections?.flatMap((group) => group.entries) ?? [];
  const onPageKeys = seen
    ? everyEntry
        .filter((entry) => seen.has(entry.index))
        .map((entry) => entry.key)
    : [];
  const flip = (keys: string[], on: boolean) =>
    setChosen((now) => {
      const next = new Set(now);
      for (const key of keys) on ? next.add(key) : next.delete(key);
      return next;
    });

  // A prototype with more than one variant (a product page and a landing page) keeps each as a top-level group; its sections are shown under it.
  const variants = (() => {
    const found = new Map<
      string,
      { id: string; label: string; groups: Sections }
    >();
    for (const group of sections ?? []) {
      const id = group.entries[0]?.key.split(".")[0] ?? "";
      const label = id
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase());
      (
        found.get(id) ?? found.set(id, { id, label, groups: [] }).get(id)!
      ).groups.push(group);
    }
    return [...found.values()];
  })();

  const renderGroup = (group: Sections[number], shownName: string) => {
    const keys = group.entries.map((entry) => entry.key);
    const count = keys.filter((key) => chosen.has(key)).length;
    const expanded = open.has(group.name);
    return (
      <div key={group.name} className="border-b border-divider last:border-b-0">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Tick
            checked={count === keys.length}
            some={count > 0}
            onChange={() => flip(keys, count !== keys.length)}
            label={`Include ${group.name}`}
          />
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() =>
              setOpen((now) =>
                now.has(group.name)
                  ? new Set([...now].filter((one) => one !== group.name))
                  : new Set(now).add(group.name),
              )
            }
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-nav text-foreground"
          >
            <span
              className={`truncate ${seen && !group.entries.some((entry) => seen.has(entry.index)) ? "text-foreground-muted" : ""}`}
            >
              {shownName}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-foreground-subtle">
              {count} of {keys.length}
              <ChevronDownIcon
                className={`size-3.5 transition-transform duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${expanded ? "rotate-180" : ""}`}
              />
            </span>
          </button>
        </div>
        {expanded ? (
          <ul className="flex flex-col pb-1">
            {group.entries.map((entry) => (
              <li
                key={entry.key}
                className={`flex items-center gap-2.5 py-1 pl-9 pr-3 ${seen && !seen.has(entry.index) ? "opacity-60" : ""}`}
              >
                <Tick
                  checked={chosen.has(entry.key)}
                  some={false}
                  onChange={() => flip([entry.key], !chosen.has(entry.key))}
                  label={`Include ${entry.key}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground-subtle">
                    {entry.key}
                  </span>
                  <span className="block truncate text-nav text-foreground-muted">
                    {entry.value}
                  </span>
                </span>
                {seen && !seen.has(entry.index) ? (
                  <span className="shrink-0 text-xs text-foreground-subtle">
                    Not on the page
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  return (
    <DialogForm
      title={
        kind === "claude" ? "Create Claude copy doc" : "Create Notion copy doc"
      }
      description={
        kind === "notion"
          ? "Adds the copy to the end of the page you paste."
          : undefined
      }
      submitLabel="Start"
      busyLabel="Starting…"
      disabled={!sections || !chosen.size}
      onClose={onClose}
      onSubmit={async () => {
        const result = await createCopyDoc(
          slug,
          name,
          kind,
          kind === "notion" ? address : undefined,
          [...chosen],
        );
        if (!result.ok) return result.error;
        onDone();
      }}
    >
      {kind === "notion" ? (
        <input
          type="url"
          inputMode="url"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Notion page address"
          aria-label="Notion page address"
          autoFocus
          className={fieldClass}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-eyebrow">
            Lines to include{sections ? ` · ${chosen.size} of ${total}` : ""}
          </p>
          <div className="flex gap-1">
            <IconButton
              variant="ghost"
              size="sm"
              disabled={!sections || !seen}
              title={
                seen
                  ? undefined
                  : "The page can't say which lines it shows: start the prototype's dev server, with the newest studio-copy.ts."
              }
              onClick={() => setChosen(new Set(onPageKeys))}
            >
              On the page
            </IconButton>
            <IconButton
              variant="ghost"
              size="sm"
              disabled={!sections || !seen}
              title="Add the lines this page shows to the ones chosen: for putting several variations in one document."
              onClick={() => flip(onPageKeys, true)}
            >
              Add the page
            </IconButton>
            <IconButton
              variant="ghost"
              size="sm"
              disabled={!sections}
              onClick={() =>
                flip(
                  sections?.flatMap((group) =>
                    group.entries.map((entry) => entry.key),
                  ) ?? [],
                  true,
                )
              }
            >
              All
            </IconButton>
            <IconButton
              variant="ghost"
              size="sm"
              disabled={!sections}
              onClick={() => setChosen(new Set())}
            >
              None
            </IconButton>
          </div>
        </div>
        <div className="-mx-1 flex max-h-72 flex-col overflow-y-auto rounded-[var(--r-control)] border border-border [scrollbar-width:thin]">
          {sections === null && !problem ? (
            <p className="pulse-soft px-3 py-2 text-nav text-foreground-muted">
              Reading the copy…
            </p>
          ) : null}
          {problem ? (
            <p className="px-3 py-2 text-nav text-destructive">{problem}</p>
          ) : null}
          {sections && variants.length > 1
            ? variants.map((variant) => {
                const keys = variant.groups.flatMap((group) =>
                  group.entries.map((entry) => entry.key),
                );
                const count = keys.filter((key) => chosen.has(key)).length;
                return (
                  <div key={variant.id}>
                    <div className="sticky top-0 z-[1] flex items-center gap-2.5 border-b border-divider bg-surface-elevated px-3 py-2">
                      <Tick
                        checked={count === keys.length}
                        some={count > 0}
                        onChange={() => flip(keys, count !== keys.length)}
                        label={`Include the ${variant.label.toLowerCase()}`}
                      />
                      <span className="flex-1 text-eyebrow">
                        {variant.label}
                      </span>
                      <span className="text-xs text-foreground-subtle">
                        {count} of {keys.length}
                      </span>
                    </div>
                    {variant.groups.map((group) =>
                      renderGroup(
                        group,
                        group.name.startsWith(`${variant.label} `)
                          ? group.name
                              .slice(variant.label.length + 1)
                              .replace(/^./, (c) => c.toUpperCase())
                          : group.name,
                      ),
                    )}
                  </div>
                );
              })
            : sections?.map((group) => renderGroup(group, group.name))}
        </div>
      </div>
    </DialogForm>
  );
}
