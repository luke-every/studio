import { getSession } from "@/lib/auth/session";
import { getPeople } from "@/lib/registry";
import { checkAccess } from "@/lib/registry/github";
import { avatarUrl } from "@/lib/registry/people";
import { getSettings } from "@/lib/registry/settings";

import { ConnectForm, RepositoryForm } from "./settings-forms";

/**
 * Settings.
 *
 * Everything the studio needs is set here — there is no file to edit and no
 * environment variable to add. It is also the place that says plainly what
 * is connected and what is not, so "why can't I save?" is never a mystery.
 */
export default async function SettingsPage() {
  const session = await getSession();
  const settings = await getSettings();
  const people = await getPeople();

  const access = session && settings.repo ? await checkAccess(session).catch(() => null) : null;

  const sourceNote = {
    cookie: "Set by you, on this device. Connect GitHub to save it for everyone.",
    registry: "Saved in the registry, so it applies to everyone.",
    vercel: "Detected from this deployment. Nothing to set.",
    unset: "Not set yet.",
  }[settings.source];

  return (
    <div className="mx-auto w-full max-w-[56rem] px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
        Settings
      </h1>
      <p className="mt-3 max-w-[60ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
        Two things, both set here. Everything the studio saves is a commit on
        the repository below, made by whoever is signed in.
      </p>

      <Section
        title="You"
        state={session ? "ok" : "todo"}
        value={session ? `${session.name} · @${session.login}` : "Not connected"}
        note={
          session
            ? "Anything you create is recorded under this account, and commits are authored by you."
            : "Connect a GitHub account so changes can be attributed. Browsing works without it."
        }
      >
        <ConnectForm connected={Boolean(session)} />
      </Section>

      <Section
        title="Repository"
        state={settings.repo ? "ok" : "todo"}
        value={settings.repo ? `${settings.repo} · ${settings.branch}` : "Not set"}
        note={sourceNote}
      >
        <RepositoryForm
          repo={settings.repo}
          branch={settings.branch}
          source={settings.source}
        />
      </Section>

      <Section
        title="Write access"
        state={!session ? "todo" : access?.ok ? "ok" : "warn"}
        value={
          !session
            ? "Connect GitHub to check"
            : !settings.repo
              ? "Set a repository to check"
              : !access
                ? "Could not check"
                : access.ok
                  ? "You can save changes"
                  : access.reason
        }
        note="Saving commits to the repository, so it needs the same access you would need to push. If this is red, the token is missing Contents: read and write, or your account cannot push."
      />

      <section className="mt-10">
        <h2 className="text-eyebrow">People</h2>
        <p className="mt-3 max-w-[60ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          There are no accounts to manage. Whoever connects a GitHub account is
          who they are, and their name is recorded on whatever they create.
          These are the people in the registry today.
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
          There is no database. A change is committed to the registry in the
          repository above, by you, and is in GitHub immediately — everyone
          else sees it once the deploy finishes, about a minute later. The
          history of the studio is the history of the repository.
        </p>
      </section>
    </div>
  );
}

function Section({
  title,
  state,
  value,
  note,
  children,
}: {
  title: string;
  state: "ok" | "todo" | "warn";
  value: string;
  note?: string;
  children?: React.ReactNode;
}) {
  const tone = state === "ok" ? "bg-success" : state === "warn" ? "bg-review" : "bg-border-strong";

  return (
    <section className="mt-9 border-t border-divider pt-7">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone}`} />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <p className="mt-1.5 pl-3.5 text-sm text-foreground-muted">{value}</p>
      {note ? (
        <p className="mt-1.5 max-w-[64ch] pl-3.5 text-xs leading-[var(--leading-relaxed)] text-foreground-subtle">
          {note}
        </p>
      ) : null}
      {children ? <div className="mt-4 pl-3.5">{children}</div> : null}
    </section>
  );
}
