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

import { useCurrentUser } from "@/lib/current-user";
import {
  createProject as createProjectAction,
  createTeam as createTeamAction,
  filePrototype as filePrototypeAction,
} from "@/lib/registry/actions";
import { summariseTeam, type OpenTimes, type TeamSummary } from "@/lib/registry/select";
import type { Project, Prototype, RegistrySnapshot } from "@/lib/registry/types";

/**
 * The studio's working set.
 *
 * Reads come from the registry snapshot the server rendered. Writes go
 * through server actions to whatever store is configured, then the route
 * revalidates and the new snapshot arrives — so a change one person makes is
 * a change everyone sees, which is the reason this is hosted at all.
 *
 * When the studio is running read-only from the registry files, writes fail
 * with a clear message rather than pretending. Per-person state — what you
 * opened, and when — never leaves the browser.
 */
type StudioContextValue = {
  teams: TeamSummary[];
  projects: Project[];
  prototypes: Prototype[];
  addTeam: (input: { name: string; remit: string; description: string }) => Promise<string | null>;
  addProject: (input: { teamSlug: string; name: string }) => Promise<string | null>;
  filePrototype: (prototypeSlug: string, projectSlug: string | null) => void;
  markOpened: (prototypeSlug: string) => void;
  opened: OpenTimes;
  /** Whether changes will be saved for everyone. */
  writable: boolean;
  /** True while a write is in flight. */
  saving: boolean;
  /** The last write failure, for the interface to show and then clear. */
  error: string | null;
  dismissError: () => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function StudioProvider({
  snapshot,
  writable,
  children,
}: {
  snapshot: RegistrySnapshot;
  writable: boolean;
  children: ReactNode;
}) {
  const { user } = useCurrentUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenTimes>({});

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const addTeam = useCallback<StudioContextValue["addTeam"]>(
    async (input) => {
      setSaving(true);
      const result = await createTeamAction({ ...input, by: user.id });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      refresh();
      return result.slug ?? null;
    },
    [user.id, refresh],
  );

  const addProject = useCallback<StudioContextValue["addProject"]>(
    async (input) => {
      setSaving(true);
      const result = await createProjectAction({ ...input, by: user.id });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      refresh();
      return result.slug ?? null;
    },
    [user.id, refresh],
  );

  const filePrototype = useCallback<StudioContextValue["filePrototype"]>(
    (prototypeSlug, projectSlug) => {
      void (async () => {
        const result = await filePrototypeAction({ prototypeSlug, projectSlug });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        refresh();
      })();
    },
    [refresh],
  );

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
      markOpened,
      opened,
      writable,
      saving: saving || pending,
      error,
      dismissError: () => setError(null),
    }),
    [snapshot, addTeam, addProject, filePrototype, markOpened, opened, writable, saving, pending, error],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
