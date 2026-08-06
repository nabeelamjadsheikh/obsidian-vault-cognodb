'use client'

import { Icon, type IconName } from './Icon'

/**
 * "There is nothing here, and that is fine."
 *
 * Distinct from ErrorState: an empty folder, a search with no hits and a vault
 * with no orphans are all correct answers, so they get a calm muted panel
 * rather than anything that reads as a failure.
 */

export interface EmptyStateProps {
  /** Sidebar icon that names the thing that is empty. */
  icon?: IconName
  /** One short line: what is missing. */
  message: string
  /** Optional second line: what the user can do about it. */
  hint?: string
  /** Optional call to action, e.g. "New note". */
  action?: {
    label: string
    onClick: () => void
  }
  /** `compact` for inline panels (backlinks, suggestions); `full` centres in the pane. */
  size?: 'compact' | 'full'
  className?: string
}

export function EmptyState({
  icon,
  message,
  hint,
  action,
  size = 'full',
  className = '',
}: EmptyStateProps) {
  const full = size === 'full'

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        full ? 'gap-3 px-6 py-14' : 'gap-2 px-3 py-8'
      } ${className}`}
    >
      {icon ? (
        <span
          className={`flex items-center justify-center rounded-full bg-surface text-text-faint ${
            full ? 'size-11' : 'size-8'
          }`}
        >
          <Icon name={icon} size={full ? 20 : 15} />
        </span>
      ) : null}

      <p className={`text-text-muted ${full ? 'text-sm' : 'text-ui'}`}>{message}</p>

      {hint ? <p className="max-w-xs text-ui text-text-faint">{hint}</p> : null}

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-[4px] border border-border bg-surface px-3 py-1.5 text-ui text-text transition-colors hover:border-accent-dim hover:text-accent"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}

export default EmptyState
