import { AlertIcon, CheckIcon, ClockIcon, EyeIcon } from "@/components/shell/nav-icons";
import { Chip } from "@/components/ui/chip";
import type { Review } from "@/lib/reviews";

/** Where one person has got to, as a tag: waiting, being looked at, or answered, with the colour that goes with it. */
export function ReviewState({ person }: { person: Review["reviewers"][number] }) {
  const icon = "!size-3";
  if (person.doneAt && person.verdict === "approved") return <Chip tone="match" icon={<CheckIcon className={icon} />}>Approved</Chip>;
  if (person.doneAt && person.verdict === "changes") return <Chip tone="exception" icon={<AlertIcon className={icon} />}>Changes needed</Chip>;
  // Reviews are sent without a verdict now: done is done.
  if (person.doneAt) return <Chip tone="match" icon={<CheckIcon className={icon} />}>Submitted</Chip>;
  if (person.openedAt) return <Chip tone="near" icon={<EyeIcon className={icon} />}>Opened</Chip>;
  return <Chip tone="quiet" icon={<ClockIcon className={icon} />}>Sent</Chip>;
}
