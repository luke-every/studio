"use client";

import { useState } from "react";

import { MotionModal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { blockedMessage, usePush } from "@/lib/use-push";

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

/** What can be changed about how the studio looks and behaves. Opened from the user menu. */
export function SettingsDialog({ open, onClose, onSetup }: { open: boolean; onClose: () => void; onSetup: () => void }) {
  return (
    <MotionModal open={open} onClose={onClose} label="Settings">
      <div className="flex flex-col gap-5">
        <h2 className="text-md font-medium tracking-[var(--tracking-tight)]">Settings</h2>
        <ThemeRow />
        <NotificationsRow />
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
        <VersionRow />
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </MotionModal>
  );
}
