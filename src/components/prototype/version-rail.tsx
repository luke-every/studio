"use client";

import { avatarUrl } from "@/lib/registry/people";
import { formatUpdated } from "@/lib/format";
import type { PrototypeVersion } from "@/lib/registry/types";

/**
 * The history.
 *
 * A prototype is the sum of the times someone changed it, so the versions
 * are a list you read down rather than a control you operate. Selecting one
 * swaps the frame above to that version's own files — which still exist,
 * because every version keeps its own copy.
 */
export function VersionRail({
  versions,
  selectedId,
  currentId,
  onSelect,
}: {
  versions: PrototypeVersion[];
  selectedId: string;
  currentId: string;
  onSelect: (version: PrototypeVersion) => void;
}) {
  return (
    <ol className="flex flex-col">
      {versions.map((version) => {
        const selected = version.id === selectedId;

        return (
          <li key={version.id}>
            <button
              type="button"
              onClick={() => onSelect(version)}
              aria-current={selected ? "true" : undefined}
              className={`w-full border-l-2 py-4 pl-4 pr-2 text-left transition-colors duration-[var(--dur-fast)] ${
                selected
                  ? "border-accent bg-surface-hover"
                  : "border-transparent hover:border-border-strong hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{version.version}</span>
                <span className="shrink-0 text-xs text-foreground-subtle">
                  {formatUpdated(version.createdAt)}
                </span>
              </div>

              <p className="mt-1 text-sm text-foreground-muted">{version.title}</p>

              {version.changes ? (
                <p className="mt-2 whitespace-pre-line text-xs leading-[var(--leading-relaxed)] text-foreground-subtle">
                  {version.changes}
                </p>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(version.author)}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 rounded-full bg-surface-inset"
                />
                <span className="text-xs text-foreground-subtle">{version.author.name}</span>
                {version.id === currentId ? (
                  <span className="ml-auto text-2xs uppercase tracking-[var(--tracking-caps)] text-foreground-subtle">
                    Current
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
