"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  createProject as createProjectAction,
  createTeam as createTeamAction,
  filePrototype as filePrototypeAction,
  renameVersion as renameVersionAction,
  updatePrototype as updatePrototypeAction,
  type WriteResult,
} from "@/lib/registry/actions";
import { Toast, useToast } from "@/components/ui/toast";
import { summariseTeam, type OpenTimes, type TeamSummary } from "@/lib/registry/select";
import type { Project, Prototype, RegistrySnapshot } from "@/lib/registry/types";

/**
 * The studio's working set.
 *
 * Reads come from the registry, as a snapshot taken when the pages were made.
 * A write goes to the registry and refreshes the pages, so it is live for
 * everyone within seconds — and it never holds anyone up: a screen starts a
 * save, carries on, and gets a toast when it lands.
 *
 * Nobody signs in. What you opened, and when, never leaves your browser.
 */
type StudioContextValue = {
  teams: TeamSummary[];
  projects: Project[];
  prototypes: Prototype[];
  repoUrl: string | null;
  addTeam: (input: { name: string; remit: string; description: string }) => Promise<boolean>;
  addProject: (input: { teamSlug: string; name: string }) => Promise<boolean>;
  filePrototype: (prototypeSlug: string, projectSlug: string | null) => void;
  /**
   * Rename, move, set links or hide a prototype. Returns at once; the save
   * carries on, marking `keys` as saving until it lands, then says so in a toast.
   */
  updatePrototype: (input: Parameters<typeof updatePrototypeAction>[0], keys: string[], message?: string) => void;
  /** Rename a version, as people see it. Same way. */
  renameVersion: (input: Parameters<typeof renameVersionAction>[0], keys: string[], message?: string) => void;
  /** Which saves are in flight, by the keys they were started with. */
  isSaving: (key: string) => boolean;
  /** Say something short at the top of the screen. */
  notify: (message: string) => void;
  markOpened: (prototypeSlug: string) => void;
  opened: OpenTimes;
  saving: boolean;
  error: string | null;
  dismissError: () => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function StudioProvider({
  snapshot,
  children,
}: {
  snapshot: RegistrySnapshot;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<string[]>([]);
  // Saved, but the screen hasn't caught up yet: still showing as working, so
  // the button doesn't flick back to how it was before the new data lands.
  const [settling, setSettling] = useState<{ keys: string[]; before: RegistrySnapshot } | null>(null);
  // The snapshot on screen, readable from callbacks that outlive a render.
  const shown = useRef(snapshot);
  useEffect(() => {
    shown.current = snapshot;
  }, [snapshot]);
  const toast = useToast();
  const [toastText, setToastText] = useState("");
  const [opened, setOpened] = useState<OpenTimes>({});

  // A save is live for everyone as soon as it lands, so all that is left is
  // to fetch the new snapshot for this screen.
  const after = useCallback(() => startTransition(() => router.refresh()), [router]);

  const addTeam = useCallback<StudioContextValue["addTeam"]>(
    async (input) => {
      setSaving(true);
      const result = await createTeamAction(input);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      after();
      return true;
    },
    [after],
  );

  const addProject = useCallback<StudioContextValue["addProject"]>(
    async (input) => {
      setSaving(true);
      const result = await createProjectAction(input);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      after();
      return true;
    },
    [after],
  );

  const filePrototype = useCallback<StudioContextValue["filePrototype"]>(
    (prototypeSlug, projectSlug) => {
      void (async () => {
        const result = await filePrototypeAction({ prototypeSlug, projectSlug });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        after();
      })();
    },
    [after],
  );

  const notify = useCallback(
    (message: string) => {
      setToastText(message);
      toast.show();
    },
    [toast],
  );

  // A save that runs in the background: nothing waits for it. Its keys are
  // marked while it runs so the buttons that caused it can show it, and the
  // toast says when it is done. A failure goes to the banner.
  const background = useCallback(
    (work: () => Promise<WriteResult>, keys: string[], message: string) => {
      setInFlight((current) => [...current, ...keys]);
      void work().then((result) => {
        setInFlight((current) => {
          const next = [...current];
          keys.forEach((key) => next.splice(next.indexOf(key), 1));
          return next;
        });
        if (!result.ok) return setError(result.error);
        setSettling({ keys, before: shown.current });
        after();
        notify(message);
      });
    },
    [after, notify],
  );

  const updatePrototype = useCallback<StudioContextValue["updatePrototype"]>(
    (input, keys, message = "Saved") => background(() => updatePrototypeAction(input), keys, message),
    [background],
  );

  const renameVersion = useCallback<StudioContextValue["renameVersion"]>(
    (input, keys, message = "Saved") => background(() => renameVersionAction(input), keys, message),
    [background],
  );

  const isSaving = useCallback(
    (key: string) =>
      inFlight.includes(key) ||
      // Until the new snapshot arrives (or the refresh ends without one).
      (pending && settling?.before === snapshot && settling.keys.includes(key)),
    [inFlight, settling, pending, snapshot],
  );

  const dismissError = useCallback(() => setError(null), []);

  const markOpened = useCallback<StudioContextValue["markOpened"]>((prototypeSlug) => {
    setOpened((current) =>
      current[prototypeSlug] === today() ? current : { ...current, [prototypeSlug]: today() },
    );
  }, []);

  const value = useMemo<StudioContextValue>(
    () => ({
      teams: snapshot.teams.map((team) => summariseTeam(team, snapshot.prototypes)),
      projects: snapshot.projects,
      prototypes: snapshot.prototypes,
      repoUrl: snapshot.repoUrl,
      addTeam,
      addProject,
      filePrototype,
      updatePrototype,
      renameVersion,
      isSaving,
      notify,
      markOpened,
      opened,
      saving: saving || pending,
      error,
      dismissError,
    }),
    [snapshot, addTeam, addProject, filePrototype, updatePrototype, renameVersion, isSaving, notify, markOpened, opened, saving, pending, error, dismissError],
  );

  return (
    <StudioContext.Provider value={value}>
      {children}
      <Toast state={toast.state} onDone={toast.done}>
        {toastText}
      </Toast>
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
