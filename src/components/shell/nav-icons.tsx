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
      <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.42 3.58l-1.06 1.06M4.64 11.36l-1.06 1.06M12.42 12.42l-1.06-1.06M4.64 4.64 3.58 3.58" />
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
