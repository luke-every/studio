import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { studioPassword } from "@/lib/config";
import { getPeople, getPrototypes } from "@/lib/registry";
import { isBlobConfigured } from "@/lib/registry/blob";
import { isContentRepoConfigured } from "@/lib/registry/github";
import { avatarUrl } from "@/lib/registry/people";

/**
 * Settings.
 *
 * The theme, then a status page: what has to be true for the studio to
 * work, and whether it is.
 *
 * Prerendered like every other page, so it opens at once instead of
 * waiting on a server round trip. Nothing here is lost by that: the
 * environment variables it reports only change with a redeploy, which
 * rebuilds it, and the people and the prototype count come from the
 * registry, which regenerates this page on every save the same as the rest.
 */
export default async function SettingsPage() {
  const store = isBlobConfigured();
  const contentRepo = isContentRepoConfigured();
  const locked = Boolean(studioPassword());
  const people = await getPeople();
  const prototypes = await getPrototypes();

  return (
    <div className="mx-auto w-full max-w-[56rem] px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">
        Settings
      </h1>
      <p className="mt-3 max-w-[62ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
        Nobody signs in. Prototypes are stored separately from the app, so
        adding one never rebuilds or redeploys anything.
      </p>

      <section className="mt-8 border-t border-divider pt-6">
        <h2 className="text-sm font-medium text-foreground">Appearance</h2>
        <p className="mt-1.5 text-xs text-foreground-subtle">
          Kept in this browser, so it&rsquo;s yours alone.
        </p>
        <div className="mt-3">
          <ThemeSwitcher />
        </div>
      </section>

      <Row
        title="Storage"
        state={store ? "ok" : "todo"}
        value={store ? `Connected · ${prototypes.length} prototypes` : "Not connected"}
        note="A Vercel Blob store holds the registry — the teams, prototypes and versions. Connect one under Storage in Vercel and it sets BLOB_READ_WRITE_TOKEN for you. Until then the studio shows the teams it ships with and nothing can be saved."
      />

      <Row
        title="Prototype files"
        state={contentRepo ? "ok" : "todo"}
        value={contentRepo ? "Connected to the content repository" : "Not connected"}
        note="Every version's files are one commit in a separate GitHub repository, which is never deployed. STUDIO_GITHUB_TOKEN and STUDIO_CONTENT_REPO, set in Vercel."
      />

      <Row
        title="Door"
        state={locked ? "ok" : "warn"}
        value={locked ? "A password is required" : "Anyone with the link can get in"}
        note="STUDIO_PASSWORD. One shared word for the whole team — no accounts, no sign-out. It also authorises /push from Claude Code. Leaving it unset is fine locally and risky in public."
      />

      <section className="mt-10">
        <h2 className="text-eyebrow">People</h2>
        <p className="mt-3 max-w-[62ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          Nobody is managed here. Work pushed from Claude Code is attributed to
          whoever pushed it; work added by hand carries the name typed on the
          form. These are the people in the registry today.
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
          /push commits a prototype&rsquo;s files straight to the content
          repository and it appears here within about a minute. Nothing about
          the studio itself is built or deployed — the app is only ever a
          reader. Each version keeps its own copy of its files, so going back
          through the history shows what was actually there at the time.
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
