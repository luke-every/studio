import { studioPassword } from "@/lib/config";
import { getPeople, getPrototypes } from "@/lib/registry";
import { isBlobConfigured } from "@/lib/registry/blob";
import { avatarUrl } from "@/lib/registry/people";

/**
 * Settings has to be rendered per request: it reports the live state of the
 * deployment, and a prerendered copy of that would report how things stood
 * when the build ran.
 */
export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * A status page, not a form. Two things have to be true for the studio to
 * work, and this says whether they are.
 */
export default async function SettingsPage() {
  const store = isBlobConfigured();
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

      <Row
        title="Storage"
        state={store ? "ok" : "todo"}
        value={store ? `Connected · ${prototypes.length} prototypes` : "Not connected"}
        note="A Vercel Blob store holds the registry and every prototype's files. Connect one under Storage in Vercel and it sets BLOB_READ_WRITE_TOKEN for you."
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
          A prototype&rsquo;s files go straight to storage and appear here within
          seconds. Nothing is committed, built or deployed — the app is only
          ever a reader. Each version keeps its own copy of its files, so going
          back through the history shows what was actually there at the time.
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
