import type { ReactNode } from "react";

import type { Mix } from "@/lib/pulse/voice-sample";

const number = (value: number) => value.toLocaleString("en");
const percent = (part: number, whole: number) => {
  const share = part / whole;
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
};

/** A section of the page: a name, one line of reading, then its tiles. */
export function Section({
  title,
  read,
  source,
  sample = false,
  children,
}: {
  title: string;
  read: string;
  source?: string;
  sample?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mt-16 first:mt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xl font-medium tracking-[var(--tracking-tight)] text-foreground">{title}</h2>
        {sample ? (
          <span className="rounded-[var(--r-tag)] bg-tile px-2.5 py-1 text-xs text-foreground-muted">Sample numbers</span>
        ) : source ? (
          <span className="text-sm text-foreground-subtle">{source}</span>
        ) : null}
      </div>
      <p className="mb-6 mt-2 max-w-[34rem] text-md text-foreground-muted">{read}</p>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** A tile with a small title. */
export function Tile({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-[var(--r-tile)] bg-tile p-6 sm:p-8 ${className}`}>
      <h3 className="text-ui text-foreground-muted">{title}</h3>
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** A big number with its unit and one line under it. */
export function Figure({ value, unit, note }: { value: string; unit: string; note?: string }) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-medium tracking-[var(--tracking-tight)] text-foreground">{value}</span>
        <span className="text-base text-foreground-subtle">{unit}</span>
      </p>
      {note ? <p className="mt-1 text-ui text-foreground-muted">{note}</p> : null}
    </div>
  );
}

function smooth(points: [number, number][]) {
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    path += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return path;
}

/** A value over the last weeks: a soft line, this week marked. */
export function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const width = 640;
  const height = 200;
  const pad = 14;
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const floor = low - span * 0.5;
  const x = (index: number) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + (1 - (value - floor) / (Math.max(...values) - floor)) * (height - pad * 2);
  const points = values.map((value, index): [number, number] => [x(index), y(value)]);
  const line = smooth(points);
  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Last ${values.length} weeks, latest ${values[values.length - 1]}`}>
        {[0.25, 0.5, 0.75].map((step) => (
          <line key={step} x1={0} x2={width} y1={height * step} y2={height * step} className="stroke-divider" strokeWidth={1} />
        ))}
        <path d={`${line} L${last[0]},${height} L${points[0][0]},${height} Z`} className="fill-accent" fillOpacity={0.06} />
        <path d={line} className="fill-none stroke-accent" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r={9} className="fill-accent" fillOpacity={0.12} />
        <circle cx={last[0]} cy={last[1]} r={4.5} className="fill-accent" />
      </svg>
      <div className="mt-3 flex justify-between text-xs text-foreground-subtle">
        {labels.map((label, index) => (
          <span key={label} className={index === labels.length - 1 ? "text-foreground" : ""}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A funnel drawn to scale, with how many carry on at each step. */
export function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  const width = 500;
  const height = 180;
  const column = width / steps.length;
  const top = steps[0].count;
  const half = (count: number) => Math.max((count / top) * (height / 2 - 6), 1.5);
  const cx = (index: number) => column * (index + 0.5);
  const upper = steps.map((step, index): [number, number] => [cx(index), height / 2 - half(step.count)]);
  const lower = steps.map((step, index): [number, number] => [cx(index), height / 2 + half(step.count)]).reverse();
  const edge = (points: [number, number][]) =>
    points
      .slice(1)
      .map(([px, py], index) => {
        const [qx, qy] = points[index];
        const mid = (qx + px) / 2;
        return ` C${mid},${qy} ${mid},${py} ${px},${py}`;
      })
      .join("");
  const shape = `M${upper[0][0]},${upper[0][1]}${edge(upper)} L${lower[0][0]},${lower[0][1]}${edge(lower)} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Visitors at each step">
        <path d={shape} className="fill-accent" fillOpacity={0.14} />
        <path d={shape} className="fill-none stroke-accent" strokeWidth={1.5} strokeLinejoin="round" />
        {steps.slice(1).map((step, index) => (
          <line key={step.label} x1={column * (index + 1)} x2={column * (index + 1)} y1={8} y2={height - 8} className="stroke-divider" strokeDasharray="2 4" />
        ))}
      </svg>
      <ol className="mt-4 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => (
          <li key={step.label} className="px-1 text-center">
            <p className="text-sm text-foreground-muted max-sm:text-xs">{step.label}</p>
            <p className="mt-1 text-md font-medium text-foreground max-sm:text-ui">{number(step.count)}</p>
            <p className="mt-0.5 text-sm text-foreground-subtle max-sm:text-xs">
              {index === 0 ? " " : `${percent(step.count, steps[index - 1].count)} carry on`}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** This week against last, one pair of bars for each thing people did. */
export function PairedBars({ rows }: { rows: { label: string; now: number; before: number }[] }) {
  const top = Math.max(...rows.flatMap((row) => [row.now, row.before]));

  return (
    <ul>
      {rows.map((row) => {
        const change = Math.round(((row.now - row.before) / row.before) * 100);
        const words = change === 0 ? "Same as last week" : `${Math.abs(change)}% ${change > 0 ? "more" : "fewer"}`;
        return (
          <li key={row.label} className="border-t border-divider py-4 first:border-t-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-4 text-ui">
              <span className="text-foreground">{row.label}</span>
              <span className="text-foreground-muted">{words}</span>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <span className="h-2 rounded-full bg-accent" style={{ width: `${(row.now / top) * 100}%`, minWidth: "0.25rem" }} />
                <span className="text-sm text-foreground">{number(row.now)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-2 rounded-full bg-border-strong/40" style={{ width: `${(row.before / top) * 100}%`, minWidth: "0.25rem" }} />
                <span className="text-sm text-foreground-subtle">{number(row.before)} last week</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const sentimentFill = { positive: "stroke-success", mixed: "stroke-border-strong/40", negative: "stroke-destructive" } as const;

/** How it leans, as a ring with the total in the middle. */
export function Donut({ mix, total, unit }: { mix: Mix; total: number; unit: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const gap = 1.5;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-full max-w-[13rem]">
        <svg viewBox="0 0 100 100" width="100%" role="img" aria-label={`${mix.positive}% positive, ${mix.mixed}% mixed, ${mix.negative}% negative`} className="-rotate-90">
          {(["positive", "mixed", "negative"] as const).map((key) => {
            const length = (mix[key] / 100) * circumference;
            const circle = (
              <circle
                key={key}
                cx={50}
                cy={50}
                r={radius}
                fill="none"
                strokeWidth={9}
                strokeDasharray={`${Math.max(length - gap, 0)} ${circumference - Math.max(length - gap, 0)}`}
                strokeDashoffset={-offset}
                className={sentimentFill[key]}
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-medium tracking-[var(--tracking-tight)] text-foreground">{total}</span>
          <span className="text-sm text-foreground-subtle">{unit}</span>
        </div>
      </div>
      <SentimentLegend mix={mix} />
    </div>
  );
}

const sentimentDot = { positive: "bg-success", mixed: "bg-border-strong/40", negative: "bg-destructive" } as const;

export function SentimentLegend({ mix }: { mix: Mix }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-ui text-foreground-muted">
      {(["positive", "mixed", "negative"] as const).map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-full ${sentimentDot[key]}`} />
          {mix[key]}% {key}
        </li>
      ))}
    </ul>
  );
}

/** How it leaned each week, as full columns split by sentiment. */
export function StackedColumns({ weeks }: { weeks: { label: string; mix: Mix }[] }) {
  return (
    <div>
      <div className="flex h-44 gap-2">
        {weeks.map((week) => (
          <div
            key={week.label}
            role="img"
            aria-label={`${week.label}: ${week.mix.positive}% positive, ${week.mix.mixed}% mixed, ${week.mix.negative}% negative`}
            className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden rounded-[var(--r-md)]"
          >
            <span className={sentimentDot.positive} style={{ height: `${week.mix.positive}%` }} />
            <span className={sentimentDot.mixed} style={{ height: `${week.mix.mixed}%` }} />
            <span className={sentimentDot.negative} style={{ height: `${week.mix.negative}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2 text-xs text-foreground-subtle">
        {weeks.map((week, index) => (
          <span key={week.label} className={`min-w-0 flex-1 text-center ${index === weeks.length - 1 ? "text-foreground" : ""}`}>
            {week.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Each theme as one bar: its length is its share of the talk, its colours how it leans. */
export function ThemeBars({ themes }: { themes: { name: string; share: number; mix: Mix; trend: string }[] }) {
  const top = Math.max(...themes.map((theme) => theme.share));

  return (
    <ul className="flex flex-col gap-6">
      {themes.map((theme) => (
        <li key={theme.name}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-base font-medium text-foreground">{theme.name}</span>
            <span className="shrink-0 text-base text-foreground">{theme.share}%</span>
          </div>
          <div className="mt-2 h-3" style={{ width: `${(theme.share / top) * 100}%` }}>
            <div
              role="img"
              aria-label={`${theme.mix.positive}% positive, ${theme.mix.mixed}% mixed, ${theme.mix.negative}% negative`}
              className="flex h-full gap-0.5 overflow-hidden rounded-full"
            >
              <span className={sentimentDot.positive} style={{ width: `${theme.mix.positive}%` }} />
              <span className={sentimentDot.mixed} style={{ width: `${theme.mix.mixed}%` }} />
              <span className={sentimentDot.negative} style={{ width: `${theme.mix.negative}%` }} />
            </div>
          </div>
          <p className="mt-1.5 text-sm text-foreground-subtle">{theme.trend}</p>
        </li>
      ))}
    </ul>
  );
}

const tints = ["bg-foreground", "bg-foreground/65", "bg-foreground/40", "bg-foreground/22", "bg-foreground/10"];

/** A whole split into its parts, as one bar with a key. */
export function SplitBar({ parts }: { parts: { label: string; count: number }[] }) {
  const total = parts.reduce((sum, part) => sum + part.count, 0);

  return (
    <div>
      <div role="img" aria-label={parts.map((part) => `${part.label} ${part.count}`).join(", ")} className="flex h-10 gap-0.5 overflow-hidden rounded-[var(--r-lg)]">
        {parts.map((part, index) => (
          <span key={part.label} className={tints[index] ?? tints[tints.length - 1]} style={{ width: `${(part.count / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-5 flex flex-col gap-2">
        {parts.map((part, index) => (
          <li key={part.label} className="flex items-center gap-2 text-ui">
            <span aria-hidden className={`size-2 rounded-full ${tints[index] ?? tints[tints.length - 1]}`} />
            <span className="min-w-0 flex-1 text-foreground-muted">{part.label}</span>
            <span className="text-foreground">{percent(part.count, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Their own words, large, with where they said it. */
export function QuoteCard({ text, source, theme }: { text: string; source: string; theme: string }) {
  return (
    <figure className="flex min-w-0 flex-col justify-between gap-8 rounded-[var(--r-tile)] bg-tile p-6 sm:p-8">
      <blockquote className="text-lg font-medium tracking-[var(--tracking-tight)] text-foreground">&ldquo;{text}&rdquo;</blockquote>
      <figcaption className="text-sm text-foreground-subtle">
        {source} · {theme}
      </figcaption>
    </figure>
  );
}
