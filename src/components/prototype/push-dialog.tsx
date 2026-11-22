"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { ModalStep, MotionStepModal } from "@/components/motion";
import { CheckIcon, CloseIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import type { PrototypeVersion } from "@/lib/registry/types";
import { TERMINAL_HOST } from "@/lib/terminal";

const VERSION = /^v\d+\.\d+(\.\d+)?$/;

/** The number after the highest one, as the studio would pick it: v0.9 then v1.0. A version named some other way is skipped. */
function nextVersion(versions: PrototypeVersion[]) {
  const highest = versions.reduce((top, one) => {
    const value = Number((one.version ?? one.key).replace(/^v/, ""));
    return Number.isNaN(value) ? top : Math.max(top, value);
  }, 0);
  return `v${(highest + 0.1).toFixed(1)}`;
}

/**
 * Saves the prototype's folder into the studio as a new version. The first step is the version number (the next one, to
 * change), a title (the prototype's name, to change) and what changed, which is written by hand. The second is the push itself, run by the local helper
 * (`scripts/terminal-server.mjs`, `/push`) with the /push skill's script, which says which step it is on.
 */
export function PushDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { prototypes } = useStudio();
  const prototype = prototypes.find((item) => item.slug === slug);
  const taken = prototype?.versions.flatMap((one) => [one.version, one.key]) ?? [];

  const [step, setStep] = useState(0);
  const [version, setVersion] = useState(() => nextVersion(prototype?.versions ?? []));
  const [title, setTitle] = useState(prototype?.name ?? "");
  const [changes, setChanges] = useState("");
  const [progress, setProgress] = useState("Preparing");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [checks, setChecks] = useState<string | null>(null);
  const titleField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 0) titleField.current?.focus({ preventScroll: true });
  }, [step]);

  const wanted = version.trim();
  const versionProblem = !VERSION.test(wanted) ? "Versions look like v0.8." : taken.includes(wanted) ? `${wanted} is already in the studio. Pick another number.` : null;
  const ready = !!prototype && !versionProblem;

  // Settles only with a problem: on success `done` is set and the second step shows it.
  const push = () =>
    new Promise<string>((resolve) => {
      const socket = new WebSocket(`ws://${TERMINAL_HOST}/push?slug=${slug}`);
      let settled = false;
      const fail = (reason: string) => {
        settled = true;
        socket.close();
        resolve(reason);
      };
      socket.onopen = () => socket.send(JSON.stringify({ name: prototype?.name, team: prototype?.teamSlug, version: wanted, title, changes }));
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { step?: string; error?: string; done?: { version: string; checks?: string } };
        if (message.step) setProgress(message.step);
        if (message.error) fail(message.error);
        if (message.done) {
          settled = true;
          setChecks(message.done.checks ?? null);
          setDone(message.done.version);
        }
      };
      socket.onclose = () => {
        if (!settled) fail("Lost the connection to the helper on this machine. Check that it is running, then try again.");
      };
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || step !== 0) return;
    setProblem(null);
    setProgress("Preparing");
    setStep(1);
    const failed = await push();
    setProblem(failed);
  };

  const first = (
    <ModalStep
      title="Push a version"
      subtitle={prototype?.name}
      problem={versionProblem}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready}>
            Push
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Version
          <input value={version} onChange={(event) => setVersion(event.target.value)} maxLength={16} spellCheck={false} className={`${fieldClass} font-normal`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Title
          <input
            ref={titleField}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            className={`${fieldClass} font-normal`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          What changed
          <textarea
            value={changes}
            onChange={(event) => setChanges(event.target.value)}
            maxLength={2000}
            rows={5}
            className={`${fieldClass} resize-none font-normal`}
          />
        </label>
      </div>
    </ModalStep>
  );

  const second = (
    <ModalStep
      title={wanted}
      subtitle={prototype?.name}
      problem={problem}
      footer={
        problem ? (
          <Button onClick={() => setStep(0)}>Back</Button>
        ) : done ? (
          <>
            <Button onClick={onClose}>Close</Button>
            {/* A full page load, as the New prototype dialog does: the page reads the version when it loads. */}
            {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
            <Button variant="primary" onClick={() => window.location.assign(`/prototypes/${slug}?v=${done}`)}>
              Open {done}
            </Button>
          </>
        ) : null
      }
    >
      <p aria-live="polite" className={`flex items-center gap-3 text-base ${done ? "text-foreground-muted" : "text-foreground"}`}>
        {done ? (
          <CheckIcon />
        ) : problem ? (
          <CloseIcon className="size-4 shrink-0 text-destructive" />
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden className="spin size-4 shrink-0">
            <path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5" />
          </svg>
        )}
        {done ? "Pushed" : problem ? "Not pushed" : progress}
      </p>
      {done && checks ? <p className="text-sm text-foreground-muted">Left in the code: {checks}.</p> : null}
    </ModalStep>
  );

  return (
    <MotionStepModal open onClose={onClose} label="Push" step={step} tallSteps={[0]}>
      {[first, second]}
    </MotionStepModal>
  );
}
