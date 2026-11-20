"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ModalStep, MotionStepModal } from "@/components/motion";
import { CheckIcon, CloseIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import { openTerminalOnArrival, TERMINAL_HOST, type Starts } from "@/lib/terminal";

/** What the helper goes through, in order. The last is this page: it opens the new prototype once the helper is done. */
const STEPS = ["Updating conventions", "Copying the template", "Installing", "Starting the preview", "Opening"];

/**
 * Starts a prototype in ~/Claude/prototypes, in three steps: what to start from (choosing one moves on), its name and the
 * team it belongs to, then the making of it. The local helper (`scripts/terminal-server.mjs`) runs the /newprototype
 * script and tells this which step it is on, which the third step lists: a spinner on the one in hand, a check on those
 * done. When it is done the page for the new prototype opens with Claude already running in its folder.
 */
export function NewPrototypeDialog({ starts, onClose }: { starts: Starts; onClose: () => void }) {
  const { teams } = useStudio();
  const pathname = usePathname();
  const onTeam = /^\/teams\/([a-z0-9-]+)/.exec(pathname)?.[1];
  // The step showing (0 the templates, 1 the name and team, 2 the making of it), and what was chosen: going back keeps it.
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState(starts.default);
  const [name, setName] = useState("");
  const [team, setTeam] = useState(teams.some((item) => item.slug === onTeam) ? (onTeam ?? "") : (teams[0]?.slug ?? ""));
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Settles only with a problem: on success the page is replaced, and the dialog stays as it is until then.
  const create = (chosen: string) =>
    new Promise<string>((resolve) => {
      const socket = new WebSocket(`ws://${TERMINAL_HOST}/new?${new URLSearchParams({ name: name.trim(), template: chosen, team })}`);
      let settled = false;
      const fail = (reason: string) => {
        settled = true;
        socket.close();
        resolve(reason);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { step?: string; error?: string; done?: { slug: string } };
        if (message.step) setProgress(message.step);
        if (message.error) fail(message.error);
        if (message.done) {
          settled = true;
          setProgress("Opening");
          openTerminalOnArrival(message.done.slug);
          window.location.assign(`/prototypes/${message.done.slug}`);
        }
      };
      socket.onclose = () => {
        if (!settled) fail("Lost the connection to the helper on this machine. Check that it is running, then try again.");
      };
    });

  const nameField = useRef<HTMLInputElement>(null);
  // The name is where to type once its step has arrived; without scrolling, since the step is still moving in.
  useEffect(() => {
    if (step === 1) nameField.current?.focus({ preventScroll: true });
  }, [step]);
  const choose = (name: string) => {
    setTemplate(name);
    setStep(1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setProblem(null);
    setProgress("");
    setStep(2);
    setProblem(await create(template));
    setBusy(false);
  };

  const first = (
    <ModalStep title="Start from" footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="flex flex-col gap-1.5">
        {starts.templates.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => choose(item.name)}
            className={`flex flex-col gap-0.5 rounded-[var(--r-md)] border px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-[var(--control-hover)] focus-visible:border-border-strong focus-visible:outline-none ${
              item.name === template ? "border-border-strong" : "border-border"
            }`}
          >
            <span className="text-base">{item.name}</span>
            {item.about ? <span className="text-sm text-foreground-muted">{item.about}</span> : null}
          </button>
        ))}
      </div>
    </ModalStep>
  );

  const second = (
    <ModalStep
      title="New prototype"
      subtitle={template}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={() => setStep(0)}>Back</Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input ref={nameField} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className={`${fieldClass} font-normal`} />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Team
          <select value={team} onChange={(event) => setTeam(event.target.value)} className={`${fieldClass} font-normal`}>
            {teams.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </ModalStep>
  );

  // The step in hand; those before it are done. Until the helper says anything, the first is in hand.
  const at = Math.max(0, STEPS.indexOf(progress));
  const third = (
    <ModalStep title={name.trim()} subtitle={template} problem={problem} footer={problem ? <Button onClick={() => setStep(1)}>Back</Button> : null}>
      <ol aria-live="polite" className="flex flex-col gap-3">
        {STEPS.map((label, index) => {
          const state = index < at ? "done" : index > at ? "waiting" : problem ? "failed" : "active";
          return (
            <li key={label} className={`flex items-center gap-3 text-base ${state === "waiting" ? "text-foreground-subtle" : state === "done" ? "text-foreground-muted" : "text-foreground"}`}>
              {state === "done" ? (
                <CheckIcon />
              ) : state === "failed" ? (
                <CloseIcon className="size-4 shrink-0 text-destructive" />
              ) : state === "active" ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden className="spin size-4 shrink-0">
                  <path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5" />
                </svg>
              ) : (
                <span aria-hidden className="grid size-4 shrink-0 place-items-center">
                  <span className="size-1 rounded-[var(--r-full)] bg-current" />
                </span>
              )}
              {label}
            </li>
          );
        })}
      </ol>
    </ModalStep>
  );

  return (
    <MotionStepModal open onClose={onClose} label="New prototype" step={step}>
      {[first, second, third]}
    </MotionStepModal>
  );
}
