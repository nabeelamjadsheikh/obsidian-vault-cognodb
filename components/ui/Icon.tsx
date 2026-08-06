/**
 * Inline SVG icons matching Obsidian's sidebar.
 *
 * Inline rather than an icon package or sprite sheet: there are seven of them,
 * they must inherit `currentColor` so hover/active states cost nothing, and the
 * app ships no image assets. Every path is drawn on a 24x24 grid with a 1.75
 * stroke, which is what gives the set a single visual weight.
 */

export type IconName =
  | 'folder'
  | 'search'
  | 'tag'
  | 'sidebar-toggle'
  | 'graph'
  | 'new-note'
  | 'chevron-right'

/** The `d` of each icon, or a fragment when one glyph needs several shapes. */
const PATHS: Record<IconName, React.ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.6.8l1 1.4H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,

  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.35-4.35" />
    </>
  ),

  tag: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4.8A2 2 0 0 1 4.8 2.8H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.8" cy="7.8" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),

  'sidebar-toggle': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
    </>
  ),

  graph: (
    <>
      <circle cx="6" cy="17.5" r="2.5" />
      <circle cx="18" cy="17.5" r="2.5" />
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M10.4 7.6 7.6 15.4M13.6 7.6l2.8 7.8M8.5 17.5h7" />
    </>
  ),

  'new-note': (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      <path d="M17.5 2.5a1.9 1.9 0 0 1 2.7 2.7L14.5 11l-3.2.8.8-3.2 5.4-6.1Z" />
    </>
  ),

  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
}

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Pixel size of the square viewport. Obsidian's sidebar uses 16. */
  size?: number
  /**
   * Accessible label. Omit it — the default — when the icon sits next to text
   * that already names the control, so screen readers do not read it twice.
   */
  title?: string
}

export function Icon({ name, size = 16, title, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  )
}

export default Icon
