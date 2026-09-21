"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  connectGitHub,
  disconnectGitHub,
  resetStudioSettings,
  saveStudioSettings,
  type ActionResult,
} from "@/lib/auth/actions";

/**
 * Setup, in the app.
 *
 * Two forms and nothing else: who you are, and where the studio writes.
 * Both save immediately and say what happened, because the whole point of
 * moving this out of environment variables is that a person can fix their
 * own problem without redeploying anything.
 */

const inputClass =
  "w-full rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";
const buttonClass =
  "rounded-[var(--r-sm)] bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-40";
const quietButtonClass =
  "rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover";

/** A fine-grained token, scoped to one repository, is all the studio needs. */
const NEW_TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new";

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  const text = result.ok ? result.message : result.error;
  if (!text) return null;

  return (
    <p
      className={`rounded-[var(--r-sm)] border px-3 py-2 text-xs leading-[var(--leading-relaxed)] ${
        result.ok
          ? "border-border bg-surface-hover text-foreground"
          : "border-destructive/40 bg-surface text-foreground"
      }`}
    >
      {text}
    </p>
  );
}

export function ConnectForm({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  if (connected) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={async () => {
            await disconnectGitHub();
            router.refresh();
          }}
          className={quietButtonClass}
        >
          Disconnect
        </button>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const outcome = await connectGitHub(new FormData(event.target as HTMLFormElement));
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) {
      setToken("");
      router.refresh();
    }
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-[26rem] flex-col gap-3">
      <input
        name="token"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        type="password"
        autoComplete="off"
        placeholder="github_pat_…"
        className={inputClass}
      />

      <div className="flex items-center gap-2">
        <button type="submit" disabled={!token.trim() || busy} className={buttonClass}>
          {busy ? "Checking…" : "Connect"}
        </button>
        <a
          href={NEW_TOKEN_URL}
          target="_blank"
          rel="noreferrer"
          className={quietButtonClass}
        >
          Create a token on GitHub
        </a>
      </div>

      <p className="text-xs leading-[var(--leading-relaxed)] text-foreground-subtle">
        Choose the repository this studio lives in, and give it{" "}
        <span className="text-foreground-muted">Contents: read and write</span>. Nothing
        else is needed. The token is stored in a cookie on this device only and is used to
        commit as you — nobody else can see it, and there is no shared token anywhere.
      </p>

      <Feedback result={result} />
    </form>
  );
}

export function RepositoryForm({
  repo,
  branch,
  source,
}: {
  repo: string | null;
  branch: string;
  source: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const outcome = await saveStudioSettings(new FormData(event.target as HTMLFormElement));
    setBusy(false);
    setResult(outcome);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-[26rem] flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <input
          name="repo"
          defaultValue={repo ?? ""}
          placeholder="owner/name"
          className={inputClass}
        />
        <input name="branch" defaultValue={branch} placeholder="main" className={inputClass} />
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Saving…" : "Save"}
        </button>
        {source === "cookie" ? (
          <button
            type="button"
            onClick={async () => {
              const outcome = await resetStudioSettings();
              setResult(outcome);
              router.refresh();
            }}
            className={quietButtonClass}
          >
            Use the default
          </button>
        ) : null}
      </div>

      <Feedback result={result} />
    </form>
  );
}
