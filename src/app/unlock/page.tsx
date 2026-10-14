import { redirect } from "next/navigation";

import { Welcome } from "@/components/welcome/welcome";
import { isUnlocked } from "@/lib/gate";

/**
 * The door, and the welcome that follows it.
 *
 * One shared word for the whole team. Not a login: there is no account, no
 * email, no sign-out — you say the word once on a device and the studio
 * opens from then on. Saying it, choosing who you are and arriving in the
 * studio is one continuous screen (see `Welcome`).
 */
/** Where to go once in: the page they asked for, if it is a page of this studio. */
function destination(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export default async function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  const { next } = await searchParams;
  const to = destination(next);
  if (await isUnlocked()) redirect(to);

  return <Welcome next={to} />;
}
