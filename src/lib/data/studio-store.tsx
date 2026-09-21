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
} from "@/lib/registry/actions";
import { summariseTeam, type OpenTimes, type TeamSummary } from "@/lib/registry/select";
import type { Project, Prototype, RegistrySnapshot } from "@/lib/registry/types";
import { useViewer } from "@/lib/viewer";

/**
 * The studio's working set.
 *
 * Reads come from the registry files in this deployment. Writes are commits
 * on the team's repository, made by the person who is signed in — so a
 * change lands in GitHub straight away and reaches everyone else when Vercel
 * has finished redeploying. Anything saved but not yet deployed is listed in
 * `publishing`, so the person who made it can keep working and the interface
 * can say plainly what is happening.
 *
 * Per-person state — what you opened, and when — never leaves the browser.
 */
type StudioContextValue = {
  teams: TeamSummary[];
  projects: Project[];
  prototypes: Prototype[];
  addTeam: (input: { name: string; remit: string; description: string }) => Promise<boolean>;
  addProject: (input: { teamSlug: string; name: string }) => Promise<boolean>;
  filePrototype: (prototypeSlug: string, projectSlug: string | null) => void;
  markOpened: (prototypeSlug: string) => void;
  opened: OpenTimes;
  /** Whether the viewer is signed in and so able to change anything. */
  canWrite: boolean;
  saving: boolean;
  /** Things saved to GitHub but not yet live for everyone. */
  publishing: string[];
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
  const viewer = useViewer();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string[]>([]);
  const [opened, setOpened] = useState<OpenTimes>({});

  const after = useCallback(
    (label: string) => {
      setPublishing((current) => [...current, label]);
      startTransition(() => router.refresh());
    },
    [router],
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
      after(`Team “${input.name}”`);
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
      after(`Project “${input.name}”`);
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
        after("Filing");
      })();
    },
    [after],
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
      canWrite: viewer !== null,
      saving: saving || pending,
      publishing,
      error,
      dismissError: () => setError(null),
    }),
    [snapshot, addTeam, addProject, filePrototype, markOpened, opened, viewer, saving, pending, publishing, error],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
