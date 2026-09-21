import { githubToken, repoConfig, studioPassword } from "@/lib/config";
import { getPeople } from "@/lib/registry";
import { checkAccess } from "@/lib/registry/github";
import { avatarUrl } from "@/lib/registry/people";

/**
 * Settings has to be rendered per request. It reports the live state of the
 * deployment — which variables are set, whether GitHub actually answers —
 * and a prerendered copy of that is worse than useless: it would report how
 * things stood when the build ran.
 */
export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * A status page, not a form. Everything is set once in Vercel; this exists
 * so that "why can't I save?" is never a mystery, and names the exact
 * variable to fix when something is missing.
 */
export default async function SettingsPage() {
  const { repo, branch, source } = repoConfig();
  const hasToken = Boolean(githubToken());
  const locked = Boolean(studioPassword());
  const people = await getPeople();

  const access = hasToken && repo ? await checkAccess().catch(() => null) : null;

  return (
    <div className="mx-auto w-full max-w-[56rem] px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
        Settings
      </h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
        Nobody signs in. Everything the studio needs is set once in Vercel,
        and reported here.
      </p>

      <Row
        title="Repository"
        state={repo ? "ok" : "todo"}
        value={repo ? `${repo} · ${branch}` : "Not set"}
        note={
          source === "vercel"
            ? "Detected from this deployment."
            : source === "environment"
              ? "Set by REGISTRY_REPO."
              : "Set REGISTRY_REPO to owner/name in Vercel. It is normally detected from the deployment, but only when Vercel is exposing its system environment variables."
        }
      />

      <Row
        title="GitHub token"
        state={hasToken ? "ok" : "todo"}
        value={hasToken ? "Set" : "Missing"}
        note="GITHUB_TOKEN, a fine-grained token scoped to this repository with Contents: read and write. Used only for changes made in the app — work pushed from Claude Code is committed by whoever made it."
      />

      <Row
        title="Write access"
        state={!hasToken || !repo ? "todo" : access?.ok ? "ok" : "warn"}
        value={
          !repo
            ? "Set a repository first"
            : !hasToken
              ? "Set a token first"
              : !access
                ? "Could not check"
                : access.ok
                  ? "The studio can save changes"
                  : access.reason
        }
        note="Checked live against GitHub."
      />

      <Row
        title="Door"
        state={locked ? "ok" : "warn"}
        value={locked ? "A password is required" : "Anyone with the link can get in"}
        note="STUDIO_PASSWORD. One shared word for the whole team — no accounts, no sign-out. Leaving it unset is fine locally and risky in public, because anyone who finds the URL could add prototypes to the repository."
      />

      <section className="mt-10">
        <h2 className="text-eyebrow">People</h2>
        <p className="mt-3 max-w-[62ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          Nobody is managed here. Work pushed from Claude Code is attributed to
          whoever committed it; work added by hand is attributed to whatever
          name was typed on the form. These are the people in the registry
          today.
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
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 border-t border-divider pt-7">
        <h2 className="text-eyebrow">How saving works</h2>
        <p className="mt-3 max-w-[64ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          There is no database. A change made in the app is committed to the
          registry in the repository above, and is live for everyone once the
          deploy finishes — about a minute. Prototypes themselves are files in
          that same repository, served from this deployment.
        </p>
      </section>
    </div>
  );
}

function Row({
  title,
  state,
  value,
  note,
}: {
  title: string;
  state: "ok" | "todo" | "warn";
  value: string;
  note?: string;
}) {
  const tone = state === "ok" ? "bg-success" : state === "warn" ? "bg-review" : "bg-border-strong";

  return (
    <section className="mt-8 border-t border-divider pt-6">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone}`} />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <p className="mt-1.5 pl-3.5 text-sm text-foreground-muted">{value}</p>
      {note ? (
        <p className="mt-1.5 max-w-[66ch] pl-3.5 text-xs leading-[var(--leading-relaxed)] text-foreground-subtle">
          {note}
        </p>
      ) : null}
    </section>
  );
}
