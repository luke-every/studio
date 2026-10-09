"use client";

import { IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import type { MotionSeen, Picked } from "@/lib/inspect";

const section = "flex flex-col gap-2 border-t border-divider pt-4";
const heading = "text-sm font-medium text-foreground";

/**
 * Dev mode's side panel: what the engineer picked in the prototype, as code
 * they can take, and what has moved since they started looking.

 */
export function DevPanel({
  picked,
  motion,
}: {
  picked: Picked | null;
  motion: MotionSeen[];
}) {
  const { notify } = useStudio();

  const copy = async (text: string, said: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(said);
    } catch {
      // Clipboard blocked: say nothing rather than claim a copy that didn't happen.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {picked ? (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-base font-medium text-foreground">{picked.component ?? `<${picked.tag}>`}</p>
            <p className="text-sm text-foreground-muted">
              {picked.component ? `<${picked.tag}> · ` : ""}
              {picked.width} × {picked.height}
            </p>
          </div>

          <div className={section}>
            <div className="flex items-center justify-between gap-3">
              <p className={heading}>Code</p>
              <IconButton onClick={() => copy(picked.html, "Code copied")}>Copy</IconButton>
            </div>
            <pre className="max-h-64 overflow-auto font-sans rounded-[var(--r-md)] bg-surface-inset p-3 text-xs leading-[var(--leading-relaxed)] text-foreground-muted [scrollbar-width:thin]">
              {picked.html}
            </pre>
          </div>

          {picked.classes.length ? (
            <div className={section}>
              <div className="flex items-center justify-between gap-3">
                <p className={heading}>Classes</p>
                <IconButton onClick={() => copy(picked.classes.join(" "), "Classes copied")}>Copy</IconButton>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {picked.classes.map((name) => (
                  <span key={name} className="rounded-[var(--r-tag)] bg-tile px-2 py-1 text-xs text-foreground-muted">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {picked.styles.length ? (
            <div className={section}>
              <p className={heading}>Styles</p>
              <dl className="flex flex-col gap-1.5 text-sm">
                {picked.styles.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-foreground-subtle">{row.label}</dt>
                    <dd className="flex min-w-0 items-center gap-2 text-right text-foreground-muted">
                      {row.color ? (
                        <span aria-hidden style={{ backgroundColor: row.color }} className="size-3 shrink-0 rounded-[var(--r-full)] border border-border" />
                      ) : null}
                      <span className="min-w-0 break-words">{row.value}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
          Pick a part of the prototype to see its code, its classes and how it is styled.
        </p>
      )}

      <div className={section}>
        <p className={heading}>Motion</p>
        {motion.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {motion.map((entry) => (
              <li key={entry.id} className="flex flex-col">
                <span className="text-foreground-muted">
                  {entry.what} <span className="text-foreground-subtle">· {entry.kind}</span>
                </span>
                <span className="text-foreground-subtle">
                  {entry.duration} · {entry.easing}
                  {entry.delay ? ` · after ${entry.delay}` : ""} · on {entry.on}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
            Switch to using the prototype and move around. Anything that animates is listed here.
          </p>
        )}
      </div>
    </div>
  );
}
