/**
 * The shell's icon set: 24px, 2px stroke, round joins — the weight X draws
 * its nav at. Inline rather than a library so the bundle carries exactly
 * seven paths and nothing else.
 *
 * All are `aria-hidden`: every usage sits beside a text label or inside a
 * control that carries its own accessible name.
 */

type IconProps = { className?: string };

function base(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className: className ?? "size-6",
  } as const;
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m21 21-5.2-5.2" />
    </svg>
  );
}

export function ResumeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9.5 8h5M9.5 12h5M9.5 16h3" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")} strokeWidth={1.75}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
    </svg>
  );
}

export function LocationIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4.5")} strokeWidth={1.75}>
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4.5")} strokeWidth={1.75}>
      <path d="M10 14a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 1 0-7.07-7.07L10.7 6.22" />
      <path d="M14 10a5 5 0 0 0-7.07 0L4.8 12.12a5 5 0 1 0 7.07 7.07l1.42-1.41" />
    </svg>
  );
}

export function SchoolIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4.5")} strokeWidth={1.75}>
      <path d="m2 8 10-5 10 5-10 5L2 8Z" />
      <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4.5")} strokeWidth={1.75}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}
