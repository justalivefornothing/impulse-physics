import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const CircleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 12h7" opacity="0.5" />
  </svg>
)

export const BoxIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
  </svg>
)

export const PolygonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5 19.5 9l-2.9 9H7.4L4.5 9z" />
  </svg>
)

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 5.5v13l10-6.5z" fill="currentColor" stroke="none" />
  </svg>
)

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
)

export const StepIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 5.5v13l8-6.5z" fill="currentColor" stroke="none" />
    <path d="M17.5 5.5v13" />
  </svg>
)

export const ResetIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v5h5" />
  </svg>
)

export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </svg>
)

export const WakeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
)

export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

/** The brand mark: an impulse arrow hitting a block, also used as the favicon. */
export const Logo = (p: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden {...p}>
    <rect x="17" y="8" width="11" height="16" rx="2" fill="#7dd3fc" />
    <path d="M3 16h11" stroke="#e879f9" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M10 11l5 5-5 5" stroke="#e879f9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="16.5" cy="16" r="2" fill="#22d3ee" />
  </svg>
)

export const SaveIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 4.5h11l3 3v12H5z" />
    <path d="M8 4.5v5h7v-5" />
    <rect x="8" y="13" width="8" height="6.5" rx="0.5" />
  </svg>
)

export const LoadIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 7.5h5l2 2h8v9.5h-15z" />
    <path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" />
  </svg>
)

export const LinkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 1 0-5.66-5.66L11.5 6.85" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 1 0 5.66 5.66l1.33-1.34" />
  </svg>
)

export const SvgIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 4.5h8l4 4v11H6z" />
    <path d="M14 4.5v4h4" />
    <path d="M9 16.5c0-1 .7-1.5 1.5-1.5s1.5.5 1.5 1.5-.7 1.5-1.5 1.5S9 17.5 9 16.5zM13 12.5l2 5.5" opacity="0.7" />
  </svg>
)

export const RewindIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 6.5 4.5 12l6.5 5.5zM19 6.5 12.5 12l6.5 5.5z" fill="currentColor" stroke="none" />
  </svg>
)
