/**
 * Nav icons.
 *
 * One weight, one size, one visual language: 16px box, 1.25 stroke, round
 * caps, drawn on the same grid so they sit evenly in a column.
 */
type IconProps = { className?: string };

const base = "size-4 shrink-0";

function Frame({
  children,
  className,
}: IconProps & { children: React.ReactNode }) {
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

export function HeartIcon({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <Frame className={className}>
      <path
        d="M8 13.25S2.5 10 2.5 6.1A2.9 2.9 0 0 1 8 4.9a2.9 2.9 0 0 1 5.5 1.2C13.5 10 8 13.25 8 13.25Z"
        fill={filled ? "currentColor" : "none"}
      />
    </Frame>
  );
}

/** The devices, for choosing how a prototype is previewed. Drawn roughly to their proportions. */
export function SmallPhoneIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="4.5" y="2" width="7" height="12" rx="1.5" />
      <path d="M7 12h2" />
    </Frame>
  );
}

export function LargePhoneIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="4.25" y="1.5" width="7.5" height="13" rx="1.75" />
      <path d="M7 3.25h2" />
    </Frame>
  );
}

export function TabletIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M7 12h2" />
    </Frame>
  );
}

export function DesktopIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1" />
      <path d="M5.5 13.5h5M8 11v2.5" />
    </Frame>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M3.5 8h9" />
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
      <rect
        x="2.75"
        y="2.75"
        width="10.5"
        height="10.5"
        rx="1.25"
        strokeDasharray="2 2"
      />
      <path d="m2.75 11 3-3 2.5 2.5L10 8.5l3.25 3.25" />
    </Frame>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
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

export function ExpandIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
    </Frame>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M8 10.5V2.5M4.75 5.5 8 2.25l3.25 3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </Frame>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </Frame>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M2.5 4.25h11M6 4.25V2.75h4v1.5M4 4.25l.6 8.5a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.5M6.75 7v4M9.25 7v4" />
    </Frame>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M8 3v10M3 8h10" />
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

export function UserIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <circle cx="8" cy="8" r="6.25" />
      <circle cx="8" cy="6.5" r="2" />
      <path d="M3.9 12.6c.9-1.6 2.4-2.4 4.1-2.4s3.2.8 4.1 2.4" />
    </Frame>
  );
}

/** The GitHub mark. A filled shape, unlike the stroked icons around it. */
export function GithubIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={`${base} ${className ?? ""}`}
    >
      <path d="M8 .25a7.75 7.75 0 0 0-2.45 15.1c.39.07.53-.17.53-.37v-1.3c-2.16.47-2.62-1.04-2.62-1.04-.35-.9-.86-1.14-.86-1.14-.7-.48.05-.47.05-.47.78.05 1.19.8 1.19.8.69 1.18 1.81.84 2.25.64.07-.5.27-.84.49-1.04-1.72-.2-3.53-.86-3.53-3.83 0-.85.3-1.54.8-2.08-.08-.2-.35-.99.08-2.06 0 0 .65-.21 2.13.8a7.4 7.4 0 0 1 3.88 0c1.48-1 2.13-.8 2.13-.8.43 1.07.16 1.86.08 2.06.5.54.8 1.23.8 2.08 0 2.98-1.81 3.63-3.54 3.82.28.24.53.71.53 1.43v2.12c0 .2.14.45.54.37A7.75 7.75 0 0 0 8 .25Z" />
    </svg>
  );
}

export function CommentIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M3.5 2.75h9a1.25 1.25 0 0 1 1.25 1.25v6a1.25 1.25 0 0 1-1.25 1.25H8L5 13.75v-2.5H3.5A1.25 1.25 0 0 1 2.25 10V4A1.25 1.25 0 0 1 3.5 2.75Z" />
    </Frame>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8Z" />
      <circle cx="8" cy="8" r="1.75" />
    </Frame>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M6.4 3.95A5.7 5.7 0 0 1 8 3.75C12 3.75 14.25 8 14.25 8s-.6 1.15-1.7 2.2M4.2 5.2C2.7 6.4 1.75 8 1.75 8S4 12.25 8 12.25c1 0 1.9-.27 2.7-.65M2.5 2.5l11 11" />
    </Frame>
  );
}

export function ReplyIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M6.5 3.25 2.75 7l3.75 3.75M2.75 7h6.5a4 4 0 0 1 4 4v1.75" />
    </Frame>
  );
}
