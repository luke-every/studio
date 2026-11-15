"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";

import { duration, easing } from "@/lib/motion/tokens";
import type { InApp } from "@/lib/phone";

/**
 * The bars of the app a phone preview is opened inside, drawn as they are on a phone (`public/inapp`, from the design
 * files' frames) so the page reads as it does to someone arriving from an ad. Drawn at the width the design was (`app.width`)
 * and scaled to the phone; they take no taps and sit over the page's top and bottom edges.
 */
export function InAppChrome({
  app,
  k,
  edge,
  height,
  compact,
  minimized,
}: {
  app: InApp;
  /** Screen pixels per pixel of the drawing. */ k: number;
  edge: "top" | "bottom";
  /** How tall this bar is, in the drawing. */ height: number;
  /** A phone with a home button: a short status bar, no home-indicator strip. */ compact: boolean;
  /** Safari's bar shrunk to a pill, as it is once the page is scrolled down. */ minimized: boolean;
}) {
  if (app.id === "none") return null;
  return (
    <div
      aria-hidden
      style={{ width: app.width, height, transform: `scale(${k})` }}
      className={`pointer-events-none absolute inset-x-0 z-[var(--z-raised)] font-sans transition-[height] duration-[var(--dur-standard)] ease-[var(--curve-standard)] motion-reduce:transition-none ${edge === "top" ? "top-0 origin-top-left" : "bottom-0 origin-bottom-left"}`}
    >
      {app.id === "instagram" ? (
        <Instagram edge={edge} compact={compact} />
      ) : (
        <Safari edge={edge} compact={compact} minimized={minimized} />
      )}
    </div>
  );
}

const fade =
  "transition-[opacity,transform] duration-[var(--dur-standard)] ease-[var(--curve-standard)] motion-reduce:transition-none";
const sprite = "/inapp/instagram-chrome.png";

function Instagram({
  edge,
  compact,
}: {
  edge: "top" | "bottom";
  compact: boolean;
}) {
  const bar = "absolute left-0 w-[420px] overflow-hidden";
  return (
    <div className="absolute inset-0 bg-inapp-chrome">
      {edge === "top" ? (
        <>
          <div
            className={`${bar} h-[57px] ${compact ? "top-[20px]" : "top-[60px]"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src={sprite}
              className="absolute left-0 top-[-64.5px] h-[911px] w-[420px] max-w-none"
            />
          </div>
          <div
            className={`absolute left-1/2 flex ${compact ? "top-[27px]" : "top-[67px]"} h-[21px] w-[161px] -translate-x-1/2 items-center justify-center bg-inapp-chrome text-[13px] font-medium tracking-[-0.35px] text-inapp-chrome-foreground`}
          >
            every-foods.com
          </div>
          <Status
            clock="text-inapp-chrome-foreground"
            icons="/inapp/status.svg"
            compact={compact}
          />
        </>
      ) : (
        <div className={`${bar} bottom-0 ${compact ? "h-[55px]" : "h-[89px]"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={sprite}
            className={`absolute left-0 h-[911px] w-[420px] max-w-none ${compact ? "top-[-833px]" : "top-[-819px]"}`}
          />
        </div>
      )}
    </div>
  );
}

/** The clock and the signal, wifi and battery, in a 60px bar. */
function Status({
  clock,
  icons,
  compact,
}: {
  clock: string;
  icons: string;
  compact: boolean;
}) {
  // With a home button the clock is centred in a 20px bar and the icons are smaller, at its end.
  return (
    <>
      <span
        className={`absolute text-center font-bold ${compact ? "left-1/2 top-[3px] w-[60px] -translate-x-1/2 text-[12px] leading-[14px] tracking-[-0.2px]" : "left-[74.7px] top-[21px] w-[118px] -translate-x-1/2 text-[16.5px] tracking-[-0.39px]"} ${clock}`}
      >
        9:41
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        src={icons}
        className={`absolute ${compact ? "right-[8px] top-[4px] h-[9px] w-[54px]" : "right-[34px] top-[24.5px] h-[12.6px] w-[75.7px]"}`}
      />
    </>
  );
}

/** One of Safari's round glass buttons, or its address pill. */
function Glass({
  className,
  children,
  ...motionProps
}: { className: string; children: ReactNode } & Omit<
  ComponentProps<typeof motion.div>,
  "className" | "children"
>) {
  return (
    <motion.div
      {...motionProps}
      className={`absolute bottom-0 flex items-center justify-center rounded-[24px] border-[0.5px] border-[color-mix(in_oklab,var(--inapp-light-foreground)_10%,transparent)] bg-[color-mix(in_oklab,var(--inapp-light)_88%,transparent)] text-inapp-light-foreground shadow-[0_2px_40px_color-mix(in_oklab,var(--inapp-light-foreground)_10%,transparent)] backdrop-blur-[12px] ${className}`}
    >
      {children}
    </motion.div>
  );
}

function Safari({
  edge,
  compact,
  minimized,
}: {
  edge: "top" | "bottom";
  compact: boolean;
  minimized: boolean;
}) {
  if (edge === "top") {
    return (
      <div className="absolute inset-0 bg-inapp-light">
        <Status
          clock="text-inapp-light-foreground"
          icons="/inapp/status-dark.svg"
          compact={compact}
        />
      </div>
    );
  }
  return <SafariBar compact={compact} minimized={minimized} />;
}

/**
 * Safari's bar at the foot, under the page. Two states of the same things, not two bars: the address pill is one pill
 * that narrows and shortens into the small one (its text and icons following), and the back and tabs buttons
 * slide in beneath it and away. It runs on the same time and curve as the page area growing around it.
 */
function SafariBar({
  compact,
  minimized,
}: {
  compact: boolean;
  minimized: boolean;
}) {
  const reduced = useReducedMotion();
  const transition = reduced
    ? { duration: 0 }
    : {
        duration: duration.standard,
        ease: [...easing.standard] as [number, number, number, number],
      };
  const full = compact ? 10 : 34;
  const small = compact ? 10 : 18;
  return (
    <div className="absolute inset-0 bg-inapp-light">
      <Glass
        className="left-[40px] h-12 w-12"
        style={{ bottom: full }}
        animate={
          minimized
            ? { opacity: 0, scale: 0.5, x: 72 }
            : { opacity: 1, scale: 1, x: 0 }
        }
        transition={transition}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6"
        >
          <path d="M14.5 5.5 8 12l6.5 6.5" />
        </svg>
      </Glass>
      <Glass
        className="w-[218px]"
        animate={
          minimized
            ? { left: 148.5, width: 96, height: 28, bottom: small }
            : { left: 98, width: 218, height: 48, bottom: full }
        }
        initial={false}
        transition={transition}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img
          alt=""
          src="/inapp/safari-menu.svg"
          animate={{ opacity: minimized ? 0 : 1 }}
          transition={transition}
          className="absolute left-[14px] top-1/2 h-[11.8px] w-[16.3px] -translate-y-1/2"
        />
        <motion.span
          animate={
            minimized
              ? { fontSize: 12, letterSpacing: 0.12 }
              : { fontSize: 17, letterSpacing: -0.45 }
          }
          transition={transition}
          className="whitespace-nowrap font-medium"
        >
          every-foods.com
        </motion.span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img
          alt=""
          src="/inapp/safari-reload.svg"
          animate={{ opacity: minimized ? 0 : 1 }}
          transition={transition}
          className="absolute right-[12.7px] top-1/2 h-[18px] w-[14.8px] -translate-y-1/2"
        />
      </Glass>
      <Glass
        className="left-[326px] h-12 w-12"
        style={{ bottom: full }}
        animate={
          minimized
            ? { opacity: 0, scale: 0.5, x: -72 }
            : { opacity: 1, scale: 1, x: 0 }
        }
        transition={transition}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          className="size-6"
        >
          <rect x="8" y="8" width="11" height="11" rx="2.5" />
          <path d="M16 5.5H7.5a2 2 0 0 0-2 2V16" strokeLinecap="round" />
        </svg>
      </Glass>
    </div>
  );
}
