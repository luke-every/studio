"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
import { summariseTeam, type OpenTimes, type TeamSummary } from "@/lib/registry/select";
import type { Project, Prototype, RegistrySnapshot } from "@/lib/registry/types";

/**
 * The studio's working set.
 *
 * Reads come from the registry files in this deployment. Writes are commits
 * on the studio's repository, so a change lands in GitHub straight away and
 * reaches everyone else when Vercel has finished redeploying. Anything saved
 * but not yet deployed is listed in `publishing`, so whoever made it can
 * keep working and the interface can say plainly what is happening.
 *
 * Nobody signs in. What you opened, and when, never leaves your browser.
 */
type StudioContextValue = {
  teams: TeamSummary[];
  projects: Project[];
  prototypes: Prototype[];
  addTeam: (input: { name: string; remit: string; description: string }) => Promise<boolean>;
  addProject: (input: { teamSlug: string; name: string }) => Promise<boolean>;
  filePrototype: (prototypeSlug: string, projectSlug: string | null) => void;
  /** Rename, move, set links or hide a prototype. Resolves true once it is saved. */
  updatePrototype: (input: Parameters<typeof updatePrototypeAction>[0]) => Promise<boolean>;
  /** Rename a version, as people see it. Resolves true once it is saved. */
  renameVersion: (input: Parameters<typeof renameVersionAction>[0]) => Promise<boolean>;
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
  const [opened, setOpened] = useState<OpenTimes>({});

  // A save is live for everyone as soon as it lands, so all that is left is
  // to fetch the new snapshot for this screen.
  const after = useCallback(() => startTransition(() => router.refresh()), [router]);

  const write = useCallback(
    async (work: () => Promise<WriteResult>) => {
      setSaving(true);
      const result = await work();
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

  const updatePrototype = useCallback<StudioContextValue["updatePrototype"]>(
    (input) => write(() => updatePrototypeAction(input)),
    [write],
  );

  const renameVersion = useCallback<StudioContextValue["renameVersion"]>(
    (input) => write(() => renameVersionAction(input)),
    [write],
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
      addTeam,
      addProject,
      filePrototype,
      updatePrototype,
      renameVersion,
      markOpened,
      opened,
      saving: saving || pending,
      error,
      dismissError,
    }),
    [snapshot, addTeam, addProject, filePrototype, updatePrototype, renameVersion, markOpened, opened, saving, pending, error, dismissError],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
