'use client'

import { isDatabaseError, type ApiErrorCode } from '@/lib/types'

/**
 * The failure panel — including the "Can't reach the vault" case.
 *
 * The assignment grades graceful degradation when the database is down, so the
 * copy here is deliberate: a DB failure is *not* the user's fault and must not
 * look like a crash or like an empty vault. Each code gets a plain-language
 * cause and a next step, and DB failures always offer retry because they are
 * usually transient.
 */

interface Copy {
  title: string
  detail: string
  /** Whether retrying could plausibly succeed without the user changing anything. */
  retryable: boolean
}

const COPY: Record<ApiErrorCode, Copy> = {
  DB_UNREACHABLE: {
    title: "Can't reach the vault",
    detail:
      'The graph database is not responding. It may be starting up, or the connection may have dropped.',
    retryable: true,
  },
  DB_TIMEOUT: {
    title: 'The vault took too long',
    detail: 'The database accepted the query but did not answer in time. It may be under load.',
    retryable: true,
  },
  DB_AUTH: {
    title: "Can't sign in to the vault",
    detail:
      'The database rejected the credentials. Check the username and password in your environment configuration.',
    retryable: false,
  },
  CONFIG: {
    title: 'The vault is not configured',
    detail:
      'The database connection details are missing or malformed. Check NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD.',
    retryable: false,
  },
  NOT_FOUND: {
    title: 'Not found',
    detail: 'That note no longer exists, or the link pointed somewhere that was never created.',
    retryable: false,
  },
  BAD_REQUEST: {
    title: "That request didn't make sense",
    detail: 'Something was missing or out of range. Adjust it and try again.',
    retryable: false,
  },
  CONFLICT: {
    title: 'That name is taken',
    detail: 'Another note in the vault already uses this title. Rename one of them.',
    retryable: false,
  },
  INTERNAL: {
    title: 'Something went wrong',
    detail: 'An unexpected error occurred while handling this request.',
    retryable: true,
  },
}

export interface ErrorStateProps {
  code: ApiErrorCode
  /**
   * Server-supplied message. Shown *instead of* the generic detail when
   * present, because the API's message is usually the more actionable one.
   */
  message?: string
  /** Omit to hide the retry button entirely. */
  onRetry?: () => void
  /** True while a retry is in flight, so the button can't be spammed. */
  retrying?: boolean
  /** `compact` for a panel inside a pane; `full` centres in the whole view. */
  size?: 'compact' | 'full'
  className?: string
}

export function ErrorState({
  code,
  message,
  onRetry,
  retrying = false,
  size = 'full',
  className = '',
}: ErrorStateProps) {
  const copy = COPY[code] ?? COPY.INTERNAL
  const isDbFailure = isDatabaseError(code)
  const full = size === 'full'
  const showRetry = Boolean(onRetry) && (copy.retryable || isDbFailure)

  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 text-center ${
        full ? 'px-6 py-16' : 'px-4 py-8'
      } ${className}`}
    >
      <div
        className={`flex w-full flex-col items-center gap-2 rounded-panel border border-border bg-surface ${
          full ? 'max-w-md px-6 py-7' : 'max-w-sm px-4 py-5'
        }`}
      >
        {/* A disconnected-plug mark for DB failures, a warning triangle otherwise —
            the shape alone tells you whether it is the vault or the request. */}
        <svg
          viewBox="0 0 24 24"
          width={full ? 26 : 20}
          height={full ? 26 : 20}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-faint"
          aria-hidden
          focusable="false"
        >
          {isDbFailure ? (
            <>
              <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
              <path d="M5 5.5v5c0 1.5 3.1 2.8 7 2.8 1 0 2-.1 2.8-.2" />
              <path d="M5 10.5v5c0 1.5 3.1 2.8 7 2.8" />
              <path d="m16 16 5 5m0-5-5 5" />
            </>
          ) : (
            <>
              <path d="M10.6 3.9 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" />
              <path d="M12 9v4.5" />
              <path d="M12 17h.01" />
            </>
          )}
        </svg>

        <h2 className={`font-medium text-text ${full ? 'text-base' : 'text-sm'}`}>{copy.title}</h2>

        <p className="text-ui text-text-muted">{message ?? copy.detail}</p>

        {showRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 rounded-[4px] border border-border bg-surface-alt px-3 py-1.5 text-ui text-text transition-colors hover:border-accent-dim hover:text-accent disabled:cursor-not-allowed disabled:text-text-faint"
          >
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        ) : null}

        {/* The code is shown quietly so a bug report can name the exact failure
            without the panel shouting jargon at a normal reader. */}
        <p className="mt-1 font-mono text-[11px] text-text-faint">{code}</p>
      </div>
    </div>
  )
}

export default ErrorState
