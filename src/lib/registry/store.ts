import type { RegistrySnapshot } from "./types";

/**
 * The store boundary.
 *
 * Everything above this line talks in view models; everything below decides
 * where they come from. Two implementations exist: the registry files in the
 * repository, and Supabase. The files are the bootstrap and the local
 * fallback; Supabase is what makes a change one person makes visible to
 * everyone else, which is the entire reason the Hub is hosted.
 */
export type Store = {
  /** Which implementation answered — surfaced in the UI, honestly. */
  readonly kind: "files" | "supabase";
  /** Whether changes made in the interface will outlive the session. */
  readonly writable: boolean;

  read(): Promise<RegistrySnapshot>;

  createTeam(input: {
    slug: string;
    name: string;
    remit: string;
    description: string;
    by: string;
  }): Promise<void>;

  createProject(input: {
    slug: string;
    teamSlug: string;
    name: string;
    by: string;
  }): Promise<void>;

  filePrototype(input: {
    prototypeSlug: string;
    projectSlug: string | null;
  }): Promise<void>;

  /** Change the team's current direction. Records who chose it, and when. */
  selectDirection(input: {
    prototypeSlug: string;
    explorationId: string;
    versionId: string;
    by: string;
  }): Promise<void>;
};

export class ReadOnlyStoreError extends Error {
  constructor() {
    super(
      "This studio is running from the registry files, which cannot be written to. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to save changes for everyone.",
    );
    this.name = "ReadOnlyStoreError";
  }
}
