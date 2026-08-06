'use client'

import Link from 'next/link'

/**
 * A `#tag` chip.
 *
 * Renders as a Link when `href` is given, a button when `onSelect` is, and a
 * plain span otherwise — so the same chip works in the note header (navigates),
 * the tag pane (filters) and a read-only list, without three near-identical
 * components drifting apart.
 */

export interface TagPillProps {
  name: string
  /** Optional occurrence count, shown muted on the right. */
  count?: number
  /** Filled accent treatment for the currently-selected tag. */
  active?: boolean
  /** Navigate on click. */
  href?: string
  /** Handle the click in place. Ignored when `href` is set. */
  onSelect?: (name: string) => void
  size?: 'sm' | 'md'
  className?: string
}

export function TagPill({
  name,
  count,
  active = false,
  href,
  onSelect,
  size = 'sm',
  className = '',
}: TagPillProps) {
  const interactive = Boolean(href || onSelect)

  const classes = [
    'inline-flex max-w-full items-center gap-1 rounded-full border align-middle',
    size === 'sm' ? 'px-2 py-[1px] text-[11px]' : 'px-2.5 py-0.5 text-ui',
    active
      ? 'border-accent-dim bg-accent-dim/25 text-accent'
      : 'border-border bg-surface-alt text-text-muted',
    interactive
      ? 'cursor-pointer transition-colors hover:border-accent-dim hover:text-accent'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      <span aria-hidden className="text-text-faint">
        #
      </span>
      <span className="truncate">{name}</span>
      {count === undefined ? null : (
        <span className="ml-0.5 tabular-nums text-text-faint">{count}</span>
      )}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classes} title={`#${name}`}>
        {body}
      </Link>
    )
  }

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(name)}
        aria-pressed={active}
        className={classes}
        title={`#${name}`}
      >
        {body}
      </button>
    )
  }

  return (
    <span className={classes} title={`#${name}`}>
      {body}
    </span>
  )
}

export default TagPill
