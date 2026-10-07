/**
 * Nav icons.
 *
 * One weight, one size, one visual language: 16px box, 1.25 stroke, round
 * caps, drawn on the same grid so they sit evenly in a column.
 */
type IconProps = { className?: string };

const base = "size-4 shrink-0";

function Frame({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`${base} ${className ?? ""}`}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.75 6.75 8 2.5l5.25 4.25v6a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75v-6Z" />
      <path d="M6.25 13.5v-4h3.5v4" />
    </Frame>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="8" cy="8" r="2" />
      <path d="M6.6 1.75h2.8l.35 1.7c.4.15.77.36 1.1.62l1.65-.55 1.4 2.42-1.3 1.14c.05.21.07.43.07.65s-.02.44-.07.65l1.3 1.14-1.4 2.42-1.65-.55c-.33.26-.7.47-1.1.62l-.35 1.7H6.6l-.35-1.7a4.6 4.6 0 0 1-1.1-.62l-1.65.55-1.4-2.42 1.3-1.14A4.6 4.6 0 0 1 3.33 8c0-.22.02-.44.07-.65l-1.3-1.14 1.4-2.42 1.65.55c.33-.26.7-.47 1.1-.62l.35-1.7Z" />
    </Frame>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M6.5 2.5c.35 2.6 1.4 3.65 4 4-2.6.35-3.65 1.4-4 4-.35-2.6-1.4-3.65-4-4 2.6-.35 3.65-1.4 4-4Z" />
      <path d="M12 9.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z" />
    </Frame>
  );
}

export function TeamDot({ tint }: { tint: string }) {
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: tint }}
    />
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M4 11V7.25a4 4 0 0 1 8 0V11l1 1.5H3L4 11Z" />
      <path d="M6.75 14a1.5 1.5 0 0 0 2.5 0" />
    </Frame>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.5v1.25M8 13.25v1.25M14.5 8h-1.25M2.75 8H1.5M12.6 3.4l-.9.9M4.3 11.7l-.9.9M12.6 12.6l-.9-.9M4.3 4.3l-.9-.9" />
    </Frame>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M13.25 9.5A5.5 5.5 0 0 1 6.5 2.75a5.5 5.5 0 1 0 6.75 6.75Z" />
    </Frame>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M5.5 13.5h5M8 11v2.5" />
    </Frame>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="m4 6 4 4 4-4" />
    </Frame>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M9 2.75h4.25V7M13 3 7.5 8.5M11.25 9.5v2.75a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1H6.5" />
    </Frame>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M6.75 9.25a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5l-.75.75M9.25 6.75a2.5 2.5 0 0 0-3.5 0l-2.5 2.5a2.5 2.5 0 0 0 3.5 3.5l.75-.75" />
    </Frame>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Frame>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6" />
      <circle cx="10" cy="5" r="1.5" />
      <circle cx="6" cy="11" r="1.5" />
    </Frame>
  );
}

export function EllipsisIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="3.5" cy="8" r="0.75" fill="currentColor" />
      <circle cx="8" cy="8" r="0.75" fill="currentColor" />
      <circle cx="12.5" cy="8" r="0.75" fill="currentColor" />
    </Frame>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="m10.5 3.25 2.25 2.25M2.75 13.25l.5-2.5 7.25-7.25 2 2L5.25 12.75l-2.5.5Z" />
    </Frame>
  );
}

export function FitIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.75 6V3.5a.75.75 0 0 1 .75-.75H6M10 2.75h2.5a.75.75 0 0 1 .75.75V6M13.25 10v2.5a.75.75 0 0 1-.75.75H10M6 13.25H3.5a.75.75 0 0 1-.75-.75V10" />
    </Frame>
  );
}

export function WireframeIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1.25" strokeDasharray="2 2" />
      <path d="m2.75 11 3-3 2.5 2.5L10 8.5l3.25 3.25" />
    </Frame>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M5.5 3.5 2.75 6.25 5.5 9M3 6.25h5.5a4 4 0 0 1 0 8H6" />
    </Frame>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="m10.5 3.5 2.75 2.75L10.5 9M13 6.25H7.5a4 4 0 0 0 0 8H10" />
    </Frame>
  );
}

export function ShuffleIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.5 4.5h2c3.2 0 4 7 7.2 7h1.8M2.5 11.5h2c1 0 1.7-.8 2.4-1.9M9.1 6.4c.7-1 1.4-1.9 2.6-1.9h1.8M11.5 2.75l2 1.75-2 1.75M11.5 9.75l2 1.75-2 1.75" />
    </Frame>
  );
}

export function FlowIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="1.75" y="2.75" width="4.5" height="4.5" rx="1" />
      <rect x="9.75" y="8.75" width="4.5" height="4.5" rx="1" />
      <path d="M6.25 5h2.5a1.5 1.5 0 0 1 1.5 1.5v2.25" />
    </Frame>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.75 4.5h10.5M2.75 8h10.5M2.75 11.5h10.5" />
    </Frame>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="7.25" cy="7.25" r="4.25" />
      <path d="m10.5 10.5 2.75 2.75" />
    </Frame>
  );
}
