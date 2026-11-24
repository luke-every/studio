"use client";

import { useCallback, useEffect, useState } from "react";

import { ModalStep, MotionStepModal } from "@/components/motion";
import { Button, IconButton } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/dialog-form";
import { Toggle } from "@/components/ui/toggle";
import { saveSlackId, slackState, testSlack } from "@/lib/registry/actions";
import { blockedMessage, usePush } from "@/lib/use-push";
import { useUser } from "@/lib/use-user";

import { ChevronRightIcon } from "./nav-icons";
import { ThemeRow } from "./theme-row";

const row = "flex items-center justify-between gap-3 px-2.5 py-1.5";

/** Whether this device hears about new comments. */
function NotificationsRow() {
  const { state, enable, disable, test } = usePush();
  const [problem, setProblem] = useState<string | null>(null);
  const message =
    state === "unsupported"
      ? "This browser can't. On an iPhone, add the studio to your home screen first."
      : state === "blocked"
        ? problem ?? blockedMessage()
        : problem;

  return (
    <div className="flex flex-col gap-1">
      <div className={row}>
        <span className="text-sm text-foreground">Notifications</span>
        {state === "unsupported" || state === "checking" ? null : (
          <Toggle
            label="Notifications"
            // A blocked browser shows as off; switching it on explains how to unblock.
            value={state === "on" ? "on" : "off"}
            onChange={async (next) => {
              setProblem(null);
              if (next === "on") setProblem(await enable());
              else await disable();
            }}
            options={[
              { id: "off", label: "Off" },
              { id: "on", label: "On" },
            ]}
          />
        )}
      </div>
      {message ? <p className="px-2.5 text-xs text-foreground-muted">{message}</p> : null}
      {state === "on" ? (
        <div className="px-2.5 pt-1">
          <Button onClick={async () => setProblem((await test()) ?? "Sent. It should arrive in a moment.")}>Send a test notification</Button>
        </div>
      ) : null}
      {state === "blocked" ? (
        <div className="px-2.5 pt-1">
          <Button onClick={() => window.location.reload()}>Reload and try again</Button>
        </div>
      ) : null}
    </div>
  );
}

/** Which Slack member this person is, so the studio can message them. Not there until Slack is connected and somebody has said who they are. */
function SlackRow() {
  const { name } = useUser();
  const [state, setState] = useState<{ connected: boolean; mine: string } | null>(null);
  const [id, setId] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  useEffect(() => {
    if (!name) return;
    let current = true;
    void slackState(name).then((result) => {
      if (!current || !result.ok) return;
      setState(result.value);
      setId(result.value.mine);
    });
    return () => {
      current = false;
    };
  }, [name]);

  if (!name || !state?.connected) return null;

  const run = async (kind: "save" | "test") => {
    setBusy(kind);
    setNote(null);
    const result = kind === "save" ? await saveSlackId(name, id) : await testSlack(name);
    setBusy(null);
    if (!result.ok) return setNote({ text: result.error, bad: true });
    if (kind === "save") setState({ connected: true, mine: id.trim() });
    setNote({ text: kind === "save" ? "Saved." : "Sent. It should arrive in a moment.", bad: false });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className={row}>
        <span className="text-sm text-foreground">Slack</span>
        <span className="flex items-center gap-2">
          <input value={id} onChange={(event) => setId(event.target.value)} aria-label="Slack member ID" placeholder="Member ID" maxLength={20} className={`${fieldClass} w-36 !py-1 text-sm`} />
          <Button onClick={() => void run("save")} loading={busy === "save"} disabled={busy !== null || id.trim() === state.mine}>
            Save
          </Button>
        </span>
      </div>
      <p className="px-2.5 text-xs text-foreground-muted">In Slack, open your profile, then the ⋮ menu, then Copy member ID.</p>
      {note ? <p className={`px-2.5 text-xs ${note.bad ? "text-destructive" : "text-foreground-muted"}`}>{note.text}</p> : null}
      {state.mine ? (
        <div className="px-2.5 pt-1">
          <Button onClick={() => void run("test")} loading={busy === "test"} disabled={busy !== null}>
            Send a test message
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Which build of the studio this is, and a way to read what changed. Empty when running locally. */
function VersionRow() {
  const commit = process.env.NEXT_PUBLIC_STUDIO_COMMIT;
  const change = process.env.NEXT_PUBLIC_STUDIO_CHANGE;
  const repo = process.env.NEXT_PUBLIC_STUDIO_REPO;
  const built = process.env.NEXT_PUBLIC_STUDIO_BUILT;
  const date = built ? new Date(built).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div className="flex flex-col gap-1">
      <div className={row}>
        <span className="text-sm text-foreground">Version</span>
        <span className="text-sm text-foreground-muted">{commit ? `${commit.slice(0, 7)} · ${date}` : "Running locally"}</span>
      </div>
      {change ? <p className="px-2.5 text-xs text-foreground-muted">{change}</p> : null}
      {repo ? (
        <div className="px-2.5 pt-1">
          <a href={`https://github.com/${repo}/commits/main`} target="_blank" rel="noreferrer" className="text-sm text-foreground underline">
            See changes
          </a>
        </div>
      ) : null}
    </div>
  );
}

type ServiceAction = "start" | "stop" | "restart";
type ServiceRow = { id: string; name: string; port: number | null; running: boolean; actions: ServiceAction[] };

const actionLabel: Record<ServiceAction, string> = { start: "Start", stop: "Stop", restart: "Restart" };

/** What runs on this machine, with a way to start, stop or restart each. */
function ServicesList({ open }: { open: boolean }) {
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      if (!response.ok) return false;
      setServices(((await response.json()) as { services: ServiceRow[] }).services);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first look, then a look every few seconds while it is open
    void load();
    const timer = setInterval(() => !busy && void load(), 3000);
    return () => clearInterval(timer);
  }, [open, load, busy]);

  async function act(service: ServiceRow, action: ServiceAction) {
    const key = `${service.id}:${action}`;
    setBusy(key);
    setProblem(null);
    try {
      const response = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: service.id, action }) });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) setProblem({ id: service.id, message: result.error ?? "That didn't work." });
      // The studio restarting itself goes away for a moment: wait for it to answer again.
      if (service.id === "studio" && result.ok) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        for (let tries = 0; tries < 40 && !(await load()); tries++) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch {
      setProblem({ id: service.id, message: "It didn't answer." });
    }
    await load();
    setBusy(null);
  }

  if (!services) return null;

  return (
    <ul className="flex flex-col">
        {services.map((service) => (
          <li key={service.id} className="flex flex-col">
            <div className={row}>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${service.running ? "bg-success" : "bg-border-strong/40"}`} />
                <span className="truncate text-sm text-foreground">{service.name}</span>
                <span className="shrink-0 text-xs text-foreground-muted">{service.running ? (service.port ? `:${service.port}` : "") : "Stopped"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {service.actions.map((action) => (
                  <IconButton key={action} size="sm" label={`${actionLabel[action]} ${service.name}`} tooltip={false} loading={busy === `${service.id}:${action}`} disabled={busy !== null} onClick={() => void act(service, action)}>
                    {actionLabel[action]}
                  </IconButton>
                ))}
              </span>
            </div>
            {problem?.id === service.id ? <p className="px-2.5 pb-1 text-xs text-destructive">{problem.message}</p> : null}
          </li>
        ))}
    </ul>
  );
}

/** What can be changed about how the studio looks and behaves, and, a step in, what runs on this machine. Opened from the user menu. */
export function SettingsDialog({ open, onClose, onSetup }: { open: boolean; onClose: () => void; onSetup: () => void }) {
  const [step, setStep] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  // Each time it opens it starts on the first page.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(0);
  }
  // Only the studio running on this machine has services; a deployed one doesn't (the endpoint says the same).
  const hasServices = process.env.NODE_ENV !== "production";

  return (
    <MotionStepModal open={open} onClose={onClose} label="Settings" step={step} tallSteps={[0, 1]}>
      {[
        <ModalStep key="settings" title="Settings" footer={<Button onClick={onClose}>Done</Button>}>
          <div className="flex flex-col gap-5">
            <ThemeRow />
            <NotificationsRow />
            <SlackRow />
            <div className={row}>
              <span className="text-sm text-foreground">Setup</span>
              <Button
                onClick={() => {
                  onClose();
                  onSetup();
                }}
              >
                Open
              </Button>
            </div>
            {hasServices ? (
              <button type="button" onClick={() => setStep(1)} className={`${row} w-full rounded-[var(--r-control)] text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover`}>
                <span className="text-sm text-foreground">Services</span>
                <ChevronRightIcon className="size-4 text-foreground-muted" />
              </button>
            ) : null}
            <VersionRow />
          </div>
        </ModalStep>,
        <ModalStep key="services" title="Services" footer={<Button onClick={() => setStep(0)}>Back</Button>}>
          <ServicesList open={open && step === 1} />
        </ModalStep>,
      ]}
    </MotionStepModal>
  );
}
