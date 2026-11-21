"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { MotionModal } from "@/components/motion";
import { SendIcon } from "@/components/shell/nav-icons";
import { Button, IconButton } from "@/components/ui/button";
import { useStudio } from "@/lib/data/studio-store";
import { briefOf, changedForks, promptOf, type BriefContext } from "@/lib/handoff-package";
import { buildHandoffPackage } from "@/lib/registry/actions";
import type { ChangeSet, FileChange } from "@/lib/registry/change-set";

type Tab = "changes" | "todo" | "brief";

const tab = (on: boolean) =>
  `rounded-[var(--r-full)] px-3 py-1 text-sm font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${on ? "bg-accent text-accent-foreground" : "bg-surface-inset text-foreground-muted hover:text-foreground"}`;

/** A diff, one line at a time, the lines added and the lines taken out told apart. */
function Diff({ file }: { file: FileChange }) {
  return (
    <div className="overflow-x-auto rounded-[var(--r-md)] bg-surface-inset py-2 text-xs leading-5">
      {file.text.split("\n").map((line, index) => (
        <div key={index} className={`whitespace-pre px-3 ${file.status === "new" ? "text-foreground" : line.startsWith("+") && !line.startsWith("+++") ? "bg-success/10 text-foreground" : line.startsWith("-") && !line.startsWith("---") ? "bg-destructive/10 text-foreground" : line.startsWith("@@") ? "text-foreground-subtle" : "text-foreground-muted"}`}>
          {line || " "}
        </div>
      ))}
      {file.truncated ? <p className="px-3 pt-1 text-foreground-subtle">Cut short: the file itself has the rest.</p> : null}
    </div>
  );
}

/**
 * Hand off, from the canvas: what this prototype changes against production, what is left to do, and the brief an engineer or their agent works from (see
 * `registry/change-set.ts`). Worked out from the files each time it opens, so it is never out of date. On this machine only, where the files are.
 */
export function HandoffSheet({ slug, name, github, variant }: { slug: string; name: string; github?: string; variant?: "ghost" }) {
  const { notify } = useStudio();
  const [open, setOpen] = useState(false);
  const [set, setSet] = useState<ChangeSet | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [which, setWhich] = useState<Tab>("changes");
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  if (process.env.NODE_ENV !== "development") return null;

  const context = (): BriefContext => ({ origin: window.location.origin, canvas: `${window.location.origin}/prototypes/${slug}?canvas=1`, github });
  const show = () => {
    setOpen(true);
    setSet(null);
    setProblem(null);
    void buildHandoffPackage(slug, name).then((result) => (result.ok ? setSet(result.value) : setProblem(result.error)));
  };
  const copy = (text: string, done: string) => void navigator.clipboard.writeText(text).then(() => notify(done), () => notify("Couldn't copy it", true));
  const forks = set ? changedForks(set) : [];
  const brief = set ? briefOf(set, context()) : "";

  return (
    <>
      <IconButton label="Hand off" variant={variant} tooltipSide="below" tooltipAlign="start" aria-haspopup="dialog" onClick={show}>
        <SendIcon />
      </IconButton>
      {createPortal(
        <MotionModal open={open} onClose={() => setOpen(false)} label="Hand off" className="h-[44rem] !max-w-[48rem]">
          <div className="flex h-full flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">Hand off</h2>
              {set ? (
                <p className="text-sm text-foreground-muted">
                  {forks.length} {forks.length === 1 ? "change" : "changes"} · {set.lifts.length} to do · {set.checks.length} to check
                </p>
              ) : null}
            </div>

            <div role="group" aria-label="What to show" className="flex gap-1">
              {(["changes", "todo", "brief"] as const).map((one) => (
                <button key={one} type="button" aria-pressed={which === one} onClick={() => setWhich(one)} className={tab(which === one)}>
                  {one === "changes" ? "Changes" : one === "todo" ? "To do" : "Brief"}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {problem ? (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              ) : !set ? (
                <p role="status" className="pulse-soft text-sm text-foreground-muted">
                  Reading the changes…
                </p>
              ) : which === "changes" ? (
                forks.length ? (
                  <div className="flex flex-col gap-4">
                    {forks.map((fork) => (
                      <section key={fork.id} className="flex flex-col gap-2">
                        <div className="flex flex-col gap-0.5">
                          <h3 className="text-sm font-medium text-foreground">{fork.name}</h3>
                          <p className="break-words text-xs text-foreground-muted">{fork.production ?? fork.basedOn}</p>
                        </div>
                        {fork.files.map((file) => {
                          const key = `${fork.id}:${file.path}`;
                          const expanded = shown.has(key);
                          return (
                            <div key={key} className="flex flex-col gap-2">
                              <button
                                type="button"
                                aria-expanded={expanded}
                                onClick={() => setShown((now) => (expanded ? new Set([...now].filter((one) => one !== key)) : new Set([...now, key])))}
                                className="flex items-center justify-between gap-3 rounded-[var(--r-control)] px-2 py-1.5 text-left text-sm transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset"
                              >
                                <span className="min-w-0 truncate text-foreground">{file.path.replace(/^src\/components\/forks\/[^/]+\//, "")}</span>
                                <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
                                  {file.status === "new" ? "New" : `+${file.added} −${file.removed}`}
                                </span>
                              </button>
                              {expanded ? <Diff file={file} /> : null}
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">Nothing has changed against production&rsquo;s components yet. Fork one and change it, and it shows up here.</p>
                )
              ) : which === "todo" ? (
                <div className="flex flex-col gap-4">
                  <section className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium text-foreground">Left to do ({set.lifts.length})</h3>
                    {set.lifts.length ? (
                      set.lifts.map((item) => (
                        <p key={`${item.file}:${item.line}`} className="text-sm leading-[var(--leading-relaxed)] text-foreground">
                          {item.text}
                          <span className="block break-words text-xs text-foreground-muted">
                            {item.file}:{item.line}
                          </span>
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-foreground-muted">Nothing is marked as left to do.</p>
                    )}
                  </section>
                  <section className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium text-foreground">Checks ({set.checks.length})</h3>
                    {set.checks.length ? (
                      set.checks.map((item, index) => (
                        <p key={index} className="text-sm leading-[var(--leading-relaxed)] text-foreground">
                          {item.why}
                          <span className="block break-words text-xs text-foreground-muted">
                            {item.file}:{item.line}
                          </span>
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-foreground-muted">What was changed follows the colour, type and breakpoint rules.</p>
                    )}
                  </section>
                </div>
              ) : (
                <textarea readOnly value={brief} aria-label="The brief" className="h-full w-full resize-none select-text rounded-[var(--r-md)] bg-surface-inset p-3 text-xs leading-5 text-foreground focus-visible:outline-none" />
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button disabled={!set} onClick={() => copy(brief, "Copied the brief")}>
                Copy brief
              </Button>
              <Button variant="primary" disabled={!set} onClick={() => set && copy(promptOf(set, context()), "Copied the prompt for an agent")}>
                Copy agent prompt
              </Button>
            </div>
          </div>
        </MotionModal>,
        document.body,
      )}
    </>
  );
}
