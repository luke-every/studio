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
  const { state, enable, disable } = usePush();
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
      {state === "blocked" ? (
        <div className="px-2.5 pt-1">
          <Button onClick={() => window.location.reload()}>Reload and try again</Button>
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
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </MotionModal>
  );
}
