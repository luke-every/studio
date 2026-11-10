"use client";

import { useState } from "react";

import { SetupDialog } from "@/components/onboarding/setup-dialog";
import { FirstSteps } from "@/components/shell/first-steps";
import { EditProfileModal } from "@/components/shell/profile-modal";
import { SettingsDialog } from "@/components/shell/settings-dialog";
import { UserAvatar } from "@/components/shell/user-avatar";
import { menuItem } from "@/components/ui/menu-item";
import { useUser } from "@/lib/use-user";

const item = `${menuItem} text-foreground`;

/** The Me tab: who you are, and the ways to change it. */
export default function MePage() {
  const { ready, name, leave } = useUser();
  const [setupOpen, setSetupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!ready) return null;

  return (
    <div className="flex w-full flex-col gap-5 px-5 pb-8 pt-2">
      <div className="flex items-center gap-3">
        <UserAvatar name={name} className="size-14" />
        <div className="min-w-0">
          <p className="truncate text-lg font-medium tracking-[var(--tracking-tight)] text-foreground">{name || "Guest"}</p>
          {name ? null : <p className="text-xs text-foreground-muted">Browsing as a guest</p>}
        </div>
      </div>

      <FirstSteps className={item} onSetup={() => setSetupOpen(true)} />

      <div className="flex flex-col border-t border-divider pt-1">
        {name ? (
          <button type="button" onClick={() => setProfileOpen(true)} className={item}>
            Edit profile
          </button>
        ) : null}
        <button type="button" onClick={() => setSettingsOpen(true)} className={item}>
          Settings
        </button>
        <button type="button" onClick={leave} className={`${menuItem} text-destructive`}>
          Log out
        </button>
      </div>

      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSetup={() => setSetupOpen(true)} />
      <EditProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
