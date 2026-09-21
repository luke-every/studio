import "server-only";

import { createFileStore } from "./file-store";
import { createSupabaseStore, isSupabaseConfigured } from "./supabase-store";
import type { Store } from "./store";

/**
 * Which store the studio is running on.
 *
 * Configured means Supabase, and changes are saved for everyone. Not
 * configured means the registry files, read-only — which is a working
 * studio, just a private one. The interface says which it is rather than
 * letting someone assume their work was saved.
 */
let store: Store | null = null;

export function getStore(): Store {
  store ??= isSupabaseConfigured() ? createSupabaseStore() : createFileStore();
  return store;
}
