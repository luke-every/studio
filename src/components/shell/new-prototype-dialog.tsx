"use client";

import { usePathname } from "next/navigation";
import type { DistortionWaveHandle } from "distortion-waves";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ModalStep, MotionStepModal, StatusStep, playFromBadge } from "@/components/motion";
import { FlowIcon, LargePhoneIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import { openTerminalOnArrival, TERMINAL_HOST, type Starts } from "@/lib/terminal";

/** What the helper goes through, in order. The last is this page: it opens the new prototype once the helper is done. */
const STEPS = ["Updating conventions", "Copying the template", "Installing", "Starting the preview", "Opening"];

/** If the wave never reports in (no WebGL, a failed picture), the new prototype opens after this anyway. */
const WAVE_GIVE_UP_MS = 6000;
/** How long the green tick is left on its own once the wave has passed, before the new prototype opens. */
const TICK_HOLD_MS = 600;

/**
 * Starts a project or a prototype in ~/Claude/prototypes. Step 0 asks which. A project is a name and a team and is made at
 * once: a folder with a canvas, opened on it. A prototype goes on to what to start from (choosing one moves on), its name
 * and the team it belongs to, then the making of it. The local helper (`scripts/terminal-server.mjs`) runs the /newprototype
 * script and tells this which step it is on, which the third step shows as its title, under a badge. When it is done the
 * badge turns to a green tick, a wave opens from behind it and carries the dialog away, and then the page for the new
 * prototype opens with Claude already running in its folder.
 */
export function NewPrototypeDialog({ starts, onClose }: { starts: Starts; onClose: () => void }) {
  const { teams } = useStudio();
  const pathname = usePathname();
  const onTeam = /^\/teams\/([a-z0-9-]+)/.exec(pathname)?.[1];
  // The step showing (0 project or prototype, 1 the templates, 2 the name and team, 3 the making of it), and what was chosen: going back keeps it.
  const [step, setStep] = useState(0);
  const [project, setProject] = useState(false);
  const [template, setTemplate] = useState(starts.default);
  const [name, setName] = useState("");
  const [team, setTeam] = useState(teams.some((item) => item.slug === onTeam) ? (onTeam ?? "") : (teams[0]?.slug ?? ""));
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The slug of the new prototype, once the helper is done and the wave is on its way.
  const [done, setDone] = useState<string | null>(null);
  const wave = useRef<DistortionWaveHandle>(null);
  const left = useRef(false);

  const leave = (slug: string) => {
    if (left.current) return;
    left.current = true;
    window.location.assign(`/prototypes/${slug}`);
  };

  // Coming back to this page (the back button restores it as it was left) must not bring the dialog with it.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) onClose();
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [onClose]);

  // The badge is a tick first, then the wave leaves from behind it.
  useEffect(() => {
    if (!done) return;
    playFromBadge(wave.current);
    window.setTimeout(() => leave(done), WAVE_GIVE_UP_MS);
  }, [done]);

  // Settles only with a problem: on success the wave plays and the page is replaced.
  const create = (chosen: string) =>
    new Promise<string>((resolve) => {
      const socket = new WebSocket(`ws://${TERMINAL_HOST}/new?${new URLSearchParams({ name: name.trim(), template: chosen, team, ...(project ? { kind: "project" } : {}) })}`);
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
          // A project has nothing to wave away: its canvas opens at once.
          if (project) return leave(message.done.slug);
          openTerminalOnArrival(message.done.slug);
          setDone(message.done.slug);
        }
      };
      socket.onclose = () => {
        if (!settled) fail("Lost the connection to the helper on this machine. Check that it is running, then try again.");
      };
    });

  const nameField = useRef<HTMLInputElement>(null);
  // The name is where to type once its step has arrived; without scrolling, since the step is still moving in.
  useEffect(() => {
    if (step === 2) nameField.current?.focus({ preventScroll: true });
  }, [step]);
  const choose = (name: string) => {
    setTemplate(name);
    setStep(2);
  };
  const kind = (isProject: boolean) => {
    setProject(isProject);
    setStep(isProject ? 2 : 1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setProblem(null);
    setProgress("");
    if (!project) setStep(3);
    setProblem(await create(template));
    setBusy(false);
  };

  const kinds = (
    <ModalStep title="What are you making?" footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Project", about: "A canvas to explore on", icon: <FlowIcon className="size-6" />, project: true },
          { label: "Prototype", about: "Start from a template", icon: <LargePhoneIcon className="size-6" />, project: false },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => kind(item.project)}
            className={`flex flex-col items-center gap-3 rounded-[var(--r-md)] border px-3 py-6 text-center transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-[var(--control-hover)] focus-visible:border-border-strong focus-visible:outline-none ${
              item.project === project ? "border-border-strong" : "border-border"
            }`}
          >
            {item.icon}
            <span className="flex flex-col gap-0.5">
              <span className="text-base">{item.label}</span>
              <span className="text-sm text-foreground-muted">{item.about}</span>
            </span>
          </button>
        ))}
      </div>
    </ModalStep>
  );

  const first = (
    <ModalStep title="Start from" footer={<Button onClick={() => setStep(0)}>Back</Button>}>
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
      title={project ? "Name your project" : "Name your prototype"}
      subtitle={project ? undefined : template}
      problem={project ? problem : null}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={() => setStep(project ? 0 : 1)}>Back</Button>
          <Button type="submit" variant="primary" disabled={!name.trim()} loading={busy}>
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

  const third = (
    <StatusStep
      icon={<LargePhoneIcon />}
      state={done ? "done" : problem ? "failed" : "working"}
      title={done ? "Ready" : problem ? "Not made" : progress || STEPS[0]}
      subtitle={`${name.trim()} · ${template}`}
      problem={problem}
      footer={problem ? <Button onClick={() => setStep(2)}>Back</Button> : null}
    />
  );

  return (
    <MotionStepModal open onClose={onClose} label="New" step={step} tallSteps={[1]} waveRef={wave} onWaveFinish={() => done && window.setTimeout(() => leave(done), TICK_HOLD_MS)}>
      {[kinds, first, second, third]}
    </MotionStepModal>
  );
}
