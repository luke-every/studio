"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { LivePreview } from "@/components/home/live-preview";
import { ModalStep, MotionStepModal } from "@/components/motion";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { CheckMark } from "@/components/ui/check-mark";
import { fieldClass } from "@/components/ui/dialog-form";
import { Toggle } from "@/components/ui/toggle";
import { requestReview, slackMembers, slackState } from "@/lib/registry/actions";
import { dueOptions, type DueBy } from "@/lib/reviews";
import type { Prototype } from "@/lib/registry/types";
import { useUser } from "@/lib/use-user";

import { useReviewChoices } from "./use-review-choices";

const rowClass = "flex cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 py-1.5 text-nav hover:bg-surface-hover";

/**
 * Asking people to review a version, in two steps. First what they should look at: every variation the version has, each as
 * the running prototype with its name, to pick from. Then who, a message if there is something to say, and by when. They are
 * told on Slack; the request is kept either way.
 */
export function RequestReviewDialog({ prototype, version, onClose }: { prototype: Prototype; version: string; onClose: () => void }) {
  const router = useRouter();
  const { name, people } = useUser();
  const versions = prototype.versions.filter((one) => !one.live && !one.blank);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(versions.some((one) => one.version === version) ? version : (versions[0]?.version ?? ""));
  // The setups chosen to look at, by their query (empty is the baseline).
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  // Who is being asked: from the Slack workspace when it can be read (they are told by who they are there), else from the names the studio knows.
  const [reviewers, setReviewers] = useState<{ name: string; slackId?: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; image?: string }[] | null>(null);
  const [membersProblem, setMembersProblem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Everyone who has said who they are on Slack, on any browser. Those are reachable; the rest only see the request in the studio.
  const [onSlack, setOnSlack] = useState<{ connected: boolean; names: string[] } | null>(null);

  const url = versions.find((one) => one.version === picked)?.url;
  const { ready, choices } = useReviewChoices(url, prototype.name);
  const several = choices.length > 1;
  // With one thing to look at there is nothing to choose: the dialog opens on who.
  const skipped = ready && !several;

  // When an answer is wanted: the end of the next working day, of the one after, or a day of their own, by lunch or the end of it.
  const [quick] = useState(() => dueOptions());
  const [dueChoice, setDueChoice] = useState<"first" | "second" | "custom" | null>("first");
  const [customDay, setCustomDay] = useState(quick[0].date);
  const [customBy, setCustomBy] = useState<DueBy>("eod");
  const due = dueChoice === "first" ? quick[0].date : dueChoice === "second" ? quick[1].date : dueChoice === "custom" ? customDay : "";
  const dueBy: DueBy = dueChoice === "custom" ? customBy : "eod";

  useEffect(() => {
    let current = true;
    void slackMembers().then((result) => {
      if (!current) return;
      if (result.ok) setMembers(result.value);
      // Slack not being connected is not a problem to report; the permission missing is.
      else if (!/isn't connected/.test(result.error)) setMembersProblem(result.error);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    void slackState(name ?? "").then((result) => {
      if (current && result.ok) setOnSlack({ connected: result.value.connected, names: result.value.people });
    });
    return () => {
      current = false;
    };
  }, [name]);

  // The workspace's people when it can be read; else this browser's people, then anybody else the studio knows from Slack.
  type Row = { key: string; name: string; slackId?: string; image?: string; profile?: (typeof people)[number] };
  const known = new Set(people.map((person) => person.name.toLowerCase()));
  const fallback: Row[] = [
    ...people.map((person) => ({ key: person.name, name: person.name, profile: person })),
    ...(onSlack?.names.filter((who) => !known.has(who.toLowerCase())).map((who) => ({ key: who, name: who })) ?? []),
  ];
  const rows: Row[] = members ? members.map((member) => ({ key: member.id, name: member.name, slackId: member.id, image: member.image })) : fallback;
  const reachable = !members && onSlack?.connected ? onSlack.names.map((who) => who.toLowerCase()) : null;
  const shown = search.trim() ? rows.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase())) : rows;
  const isChosen = (row: Row) => reviewers.some((one) => (row.slackId ? one.slackId === row.slackId : one.name === row.name));
  const toggle = (row: Row) => setReviewers((now) => (isChosen(row) ? now.filter((one) => !(row.slackId ? one.slackId === row.slackId : one.name === row.name)) : [...now, { name: row.name, slackId: row.slackId }]));
  // The person asking, among the rows: their full name, or the first name they use here.
  const mine = (name ?? "").trim().toLowerCase();
  const isYou = (row: Row) => !!mine && (row.name.toLowerCase() === mine || row.name.toLowerCase().split(/\s+/)[0] === mine);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !picked || !reviewers.length) return;
    if (!name) return setProblem("Choose who you are first, from the menu at the top right.");
    setBusy(true);
    setProblem(null);
    const variants = several ? choices.filter((one) => chosen.includes(one.setup)) : [];
    const result = await requestReview({ slug: prototype.slug, version: picked, message, due: due || undefined, dueBy, reviewers, by: name, variants });
    setBusy(false);
    if (!result.ok) return setProblem(result.error);
    router.push(`/prototypes/${prototype.slug}/reviews`);
    onClose();
  };

  const which = (
    <ModalStep
      title="What should they look at?"
      subtitle={prototype.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="min-w-40" disabled={!ready || !picked || (several && !chosen.length)} onClick={() => setStep(1)}>
            Continue
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {versions.length > 1 ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Version
            <select value={picked} onChange={(event) => (setPicked(event.target.value), setChosen([]))} className={`${fieldClass} font-normal`}>
              {versions.map((one) => (
                <option key={one.id} value={one.version}>
                  {one.version}
                  {one.title ? ` · ${one.title}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!ready ? (
          <div aria-label="Loading variations" className="grid grid-cols-2 gap-3">
            {[0, 1].map((index) => (
              <div key={index} className="pulse-soft aspect-[3/4] rounded-[var(--r-md)] border border-border bg-surface-inset" />
            ))}
          </div>
        ) : (
        <div role="group" aria-label="Variations" className="grid grid-cols-2 gap-3">
          {choices.map((one) => {
            const on = several ? chosen.includes(one.setup) : true;
            return (
              <button
                key={`${picked}:${one.setup || "baseline"}`}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!several}
                onClick={() => setChosen((now) => (now.includes(one.setup) ? now.filter((was) => was !== one.setup) : [...now, one.setup]))}
                className={`group flex flex-col overflow-hidden rounded-[var(--r-md)] border text-left transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] focus-visible:border-border-strong focus-visible:outline-none ${on && several ? "border-border-strong" : "border-border"} ${several ? "hover:bg-[var(--control-hover)]" : "col-span-2 mx-auto w-1/2"}`}
              >
                <span className="relative block aspect-[3/4] w-full overflow-hidden border-b border-border bg-surface-inset">
                  {url ? <LivePreview src={`${url}${one.setup ? `?${one.setup}` : ""}`} title={one.label} /> : null}
                  {several ? <CheckMark on={on} solid className="absolute right-2 top-2 size-5" /> : null}
                </span>
                <span className="truncate px-2.5 py-2 text-nav">{one.label}</span>
              </button>
            );
          })}
        </div>
        )}
      </div>
    </ModalStep>
  );

  const who = (
    <ModalStep
      title="Who should review it?"
      subtitle={`${prototype.name} · ${picked}`}
      problem={problem}
      onSubmit={send}
      footer={
        <>
          <Button onClick={skipped ? onClose : () => setStep(0)} disabled={busy}>
            {skipped ? "Cancel" : "Back"}
          </Button>
          <Button type="submit" variant="primary" className="min-w-40" disabled={!reviewers.length || (dueChoice === "custom" && !customDay)} loading={busy}>
            {busy ? "Requesting" : "Request review"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Reviewers</legend>
          {rows.length > 8 ? <input type="search" aria-label="Search people" placeholder="Search people" value={search} onChange={(event) => setSearch(event.target.value)} className={`${fieldClass} font-normal`} /> : null}
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {shown.map((row) => (
              <label key={row.key} className={rowClass}>
                <input type="checkbox" checked={isChosen(row)} onChange={() => toggle(row)} className="size-4 accent-[var(--accent)]" />
                {row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image} alt="" className="size-6 shrink-0 rounded-[var(--r-full)] object-cover" />
                ) : (
                  <UserAvatar name={row.name} profile={row.profile} className="size-6" />
                )}
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                {isYou(row) ? <span className="shrink-0 text-xs text-foreground-muted">You</span> : null}
                {reachable && !reachable.includes(row.name.toLowerCase()) ? <span className="shrink-0 text-xs text-foreground-muted">Not on Slack</span> : null}
              </label>
            ))}
            {!shown.length ? <p className="px-2.5 text-sm text-foreground-muted">{rows.length ? "Nobody by that name." : "Add a teammate from the user menu to ask them."}</p> : null}
          </div>
          {membersProblem ? <p className="px-2.5 text-xs text-destructive">{membersProblem}</p> : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-0.5 text-sm font-medium">
            Due <span className="font-normal text-foreground-muted">Optional</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "first", label: quick[0].label },
                { id: "second", label: quick[1].label },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={dueChoice === option.id}
                onClick={() => setDueChoice((now) => (now === option.id ? null : option.id))}
                className={`inline-flex items-center gap-1.5 rounded-[var(--r-full)] border py-1.5 pl-2 pr-3 text-sm transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] focus-visible:border-border-strong focus-visible:outline-none ${dueChoice === option.id ? "border-transparent bg-accent text-accent-foreground hover:bg-accent-hover" : "border-border text-foreground-muted hover:bg-[var(--control-hover)]"}`}
              >
                <CheckMark on={dueChoice === option.id} />
                {option.label}
              </button>
            ))}
          </div>
          {dueChoice === "custom" ? (
            <div className="flex items-center gap-2">
              <input type="date" aria-label="Day" value={customDay} min={new Date().toLocaleDateString("en-CA")} onChange={(event) => setCustomDay(event.target.value)} className={`${fieldClass} min-w-0 flex-1 font-normal`} />
              <Toggle
                label="By"
                value={customBy}
                onChange={setCustomBy}
                options={[
                  { id: "lunch", label: "Lunch" },
                  { id: "eod", label: "EOD" },
                ]}
              />
            </div>
          ) : null}
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Message <span className="font-normal text-foreground-muted">Optional</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000} placeholder="What should they look at?" className={`${fieldClass} resize-none font-normal`} />
        </label>
      </div>
    </ModalStep>
  );

  return (
    <MotionStepModal open onClose={onClose} label="Request review" step={skipped ? 1 : step} tallSteps={[0, 1]}>
      {[which, who]}
    </MotionStepModal>
  );
}
