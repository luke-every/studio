import { redirect } from "next/navigation";

import { isUnlocked, unlock } from "@/lib/gate";

/**
 * The door.
 *
 * One shared word for the whole team. Not a login: there is no account, no
 * email, no sign-out — you say the word once on a device and the studio
 * opens from then on.
 */
export default async function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  if (await isUnlocked()) redirect("/");

  const { wrong } = await searchParams;

  async function open(formData: FormData) {
    "use server";
    const opened = await unlock(String(formData.get("password") ?? ""));
    redirect(opened ? "/" : "/unlock?wrong=1");
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-[22rem]">
        <p className="text-eyebrow">Prototype Studio</p>
        <h1 className="mt-2 text-xl font-medium tracking-[var(--tracking-tight)] text-foreground">
          What&rsquo;s the word?
        </h1>
        <p className="mt-2 text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          Ask anyone on the team. You only need it once on this device.
        </p>

        <form action={open} className="mt-6 flex flex-col gap-3">
          <input
            name="password"
            type="password"
            autoFocus
            autoComplete="off"
            className="w-full rounded-[var(--r-sm)] border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-border-strong focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-[var(--r-sm)] bg-accent px-3 py-2.5 text-sm text-accent-foreground"
          >
            Come in
          </button>
        </form>

        {wrong ? (
          <p className="mt-3 text-xs text-foreground-muted">
            That&rsquo;s not it. Try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
