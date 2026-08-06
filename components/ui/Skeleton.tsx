/**
 * Shimmer placeholder.
 *
 * Used instead of a spinner so a loading sidebar or note keeps its shape and
 * the layout does not jump when data lands. The shimmer keyframes live in
 * globals.css (`.vault-shimmer`) and collapse to a static block under
 * `prefers-reduced-motion`.
 */

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Any CSS length. Defaults to filling the parent. */
  width?: string | number
  /** Any CSS length. Defaults to one line of chrome text. */
  height?: string | number
  /** Pill shape, for avatars and tag placeholders. */
  rounded?: 'sm' | 'md' | 'full'
}

const RADIUS = { sm: '3px', md: '6px', full: '9999px' } as const

export function Skeleton({
  width,
  height = '0.85rem',
  rounded = 'sm',
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`vault-shimmer ${className}`}
      style={{
        width: width ?? '100%',
        height,
        borderRadius: RADIUS[rounded],
        ...style,
      }}
      {...rest}
    />
  )
}

export interface SkeletonTextProps {
  /** How many lines to draw. */
  lines?: number
  className?: string
}

/**
 * A paragraph-shaped stack. The last line is short, which is what makes it
 * read as text rather than as a grey box.
 */
export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}

export default Skeleton
