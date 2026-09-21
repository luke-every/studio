import Link from "next/link";

import { GitHubMark } from "@/components/shell/viewer-badge";
import { isAuthConfigured, readRepoConfig } from "@/lib/auth/config";
import { getSession } from "@/lib/auth/session";
import { checkAccess } from "@/lib/registry/github";
import { getPeople } from "@/lib/registry";
import { avatarUrl } from "@/lib/registry/people";

/**
 * Settings.
 *
 * Mostly a status page, deliberately. Almost nothing here is a preference —
 * it is the studio telling you what is connected, what is missing, and
 * exactly what to do about it, so that "why can't I save?" is never a
 * mystery. The two GitHub OAuth values are the only things that cannot be
 * set from in here, for the obvious reason that the app cannot sign you in
 * before it knows how to sign anyone in.
 */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { problem } = await searchParams;
  const configured = isAuthConfigured();
  const session = await getSession();
  const repo = readRepoConfig();
  const people = await getPeople();

  const access = session && repo.repo ? await checkAccess(session).catch(() => null) : null;

  return (
    <div className="mx-auto w-full max-w-[56rem] px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
        Settings
      </h1>

      {problem ? (
        <p className="mt-5 rounded-[var(--r-md)] border border-border bg-surface px-4 py-3 text-sm text-foreground">
          Signing in did not complete: <span className="text-foreground-muted">{String(problem)}</span>
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-eyebrow">Your account</h2>
        <Row
          label="GitHub"
          value={session ? `${session.name} (@${session.login})` : "Not signed in"}
          state={session ? "ok" : "todo"}
          action={
            session ? (
              <Link href="/api/auth/signout" className={buttonClass}>
                Sign out
              </Link>
            ) : configured ? (
              <Link href="/api/auth/signin?next=/settings" className={buttonClass}>
                <GitHubMark />
                Sign in with GitHub
              </Link>
            ) : null
          }
          note="Everything you create is attributed to this account, and changes are committed to the repository as you."
        />
      </section>

      <section className="mt-10">
        <h2 className="text-eyebrow">Connection</h2>

        <Row
          label="GitHub sign-in"
          value={configured ? "Configured" : "Not configured"}
          state={configured ? "ok" : "todo"}
          note={
            configured
              ? undefined
              : "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Vercel → Project Settings → Environment Variables. Create the OAuth app at github.com/settings/developers, with the callback URL https://your-studio.vercel.app/api/auth/callback"
          }
        />

        <Row
          label="Registry repository"
          value={repo.repo ?? "Not set"}
          state={repo.repo ? "ok" : "todo"}
          note={
            repo.source === "vercel"
              ? "Detected from this Vercel deployment."
              : repo.source === "environment"
                ? "Set by REGISTRY_REPO."
                : "Set REGISTRY_REPO to owner/name, or deploy on Vercel where it is detected automatically."
          }
        />

        <Row
          label="Branch"
          value={repo.branch}
          state="ok"
          note="Changes are committed here. Set REGISTRY_BRANCH to write somewhere other than the deployed branch."
        />

        <Row
          label="Write access"
          value={
            !session
              ? "Sign in to check"
              : !access
                ? "Could not check"
                : access.ok
                  ? "You can save changes"
                  : access.reason
          }
          state={!session ? "todo" : access?.ok ? "ok" : "warn"}
          note="Saving a change commits to the repository, so it needs the same access you would need to push."
        />
      </section>

      <section className="mt-10">
        <h2 className="text-eyebrow">People</h2>
        <p className="mt-3 max-w-[60ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          There is no list of users to manage. Whoever signs in with GitHub is
          who they are, and their name is recorded on whatever they create.
          These are the people who appear in the registry today.
        </p>
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
          {people.map((person) => (
            <li key={person.login} className="flex items-center gap-2 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl(person)}
                alt=""
                width={20}
                height={20}
                className="size-5 rounded-full bg-surface-inset"
              />
              <span className="text-foreground">{person.name}</span>
              <span className="text-foreground-subtle">@{person.login}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 border-t border-divider pt-7">
        <h2 className="text-eyebrow">How saving works</h2>
        <p className="mt-3 max-w-[64ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          Changes are committed to the registry in your repository, by you.
          They are in GitHub immediately and visible to everyone once Vercel
          has finished deploying — about a minute. There is no database: the
          history of the studio is the history of the repository.
        </p>
      </section>
    </div>
  );
}

const buttonClass =
  "flex items-center gap-1.5 rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover";

function Row({
  label,
  value,
  state,
  note,
  action,
}: {
  label: string;
  value: string;
  state: "ok" | "todo" | "warn";
  note?: string;
  action?: React.ReactNode;
}) {
  const tone =
    state === "ok" ? "bg-success" : state === "warn" ? "bg-review" : "bg-border-strong";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-divider py-4">
      <div className="min-w-0 max-w-[48ch]">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone}`} />
          <span className="text-sm text-foreground">{label}</span>
        </div>
        <p className="mt-1 pl-3.5 text-sm text-foreground-muted">{value}</p>
        {note ? (
          <p className="mt-1.5 pl-3.5 text-xs leading-[var(--leading-relaxed)] text-foreground-subtle">
            {note}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
