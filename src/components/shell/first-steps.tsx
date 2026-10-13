"use client";

import { useFlag } from "@/lib/use-flag";
import { usePush } from "@/lib/use-push";

import { BellIcon, SparkleIcon } from "./nav-icons";

/**
 * Two things to do once, offered at the top of the user menu until they are
 * done: getting set up, and turning on notifications. Each goes away when
 * used and from then on lives in Settings.
 */
export function FirstSteps({ className, onSetup }: { className: string; onSetup: () => void }) {
  const [setupSeen, markSetupSeen] = useFlag("proto.setup-dismissed");
  const [pushAsked, markPushAsked] = useFlag("proto.push-asked");
  const { state, enable } = usePush();

  const showSetup = !setupSeen;
  const showPush = !pushAsked && state === "off";
  if (!showSetup && !showPush) return null;

  const chip = "grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground";

  return (
    <div className="flex flex-col border-b border-divider py-1">
      {showSetup ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            markSetupSeen();
            onSetup();
          }}
          className={className}
        >
          <span className={chip}>
            <SparkleIcon className="size-3.5" />
          </span>
          Get set up
        </button>
      ) : null}
      {showPush ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            markPushAsked();
            void enable();
          }}
          className={className}
        >
          <span className={chip}>
            <BellIcon className="size-3.5" />
          </span>
          Turn on notifications
        </button>
      ) : null}
    </div>
  );
}
