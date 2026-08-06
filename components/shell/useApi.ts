'use client'

/**
 * The client half of lib/api.ts.
 *
 * Every pane needs the same three-state answer — loading, data, or a typed
 * failure — and the grading depends on none of them ever showing a stack
 * trace. Doing that once here is what keeps `ErrorState code={...}` a one-liner
 * at every call site, and guarantees a dropped connection is reported as
 * DB_UNREACHABLE ("can't reach the vault") rather than as an empty pane.
 */

import { useCallback, useEffect, useState } from 'react'
import { isApiError, type ApiErrorCode } from '@/lib/types'

/** A failure reduced to what the UI actually renders. */
export interface Failure {
  code: ApiErrorCode
  message: string
}

/** Thrown by `apiFetch`. Carries the server's code so ErrorState can switch. */
export class RequestError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'RequestError'
    this.code = code
  }
}

/** Anything unknown becomes a renderable failure — never a raw error object. */
export function toFailure(err: unknown): Failure {
  if (err instanceof RequestError) return { code: err.code, message: err.message }
  return { code: 'INTERNAL', message: 'Something went wrong while loading this.' }
}

/**
 * Fetch JSON, or throw a `RequestError`.
 *
 * A thrown `fetch` means the browser never got an answer, which from the
 * reader's point of view is indistinguishable from the vault being down — so
 * it maps to DB_UNREACHABLE and gets the "can't reach the vault" panel.
 * AbortError is re-thrown untouched so cancelled requests do not paint an
 * error over a pane the user has already navigated away from.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response

  try {
    res = await fetch(path, { cache: 'no-store', ...init })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new RequestError(
      'DB_UNREACHABLE',
      'The app could not reach the server. It may still be starting up.',
    )
  }

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (isApiError(payload)) throw new RequestError(payload.error.code, payload.error.message)

  if (!res.ok) {
    throw new RequestError('INTERNAL', 'The server returned an unexpected response.')
  }

  return payload as T
}

export interface ApiState<T> {
  data: T | null
  error: Failure | null
  loading: boolean
  /** Re-runs the request. Wired to every ErrorState retry button. */
  reload: () => void
}

/**
 * GET `path` and track its three states.
 *
 * Pass `null` to stand down — used for requests that only make sense once
 * something is selected, so a component can call the hook unconditionally and
 * still obey the rules of hooks.
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<{ data: T | null; error: Failure | null; loading: boolean }>(
    () => ({ data: null, error: null, loading: path !== null }),
  )

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false })
      return
    }

    let live = true
    const controller = new AbortController()

    // Keep the previous data on screen while refetching: a reload should not
    // flash the pane back to skeletons when it is only re-confirming.
    setState((prev) => ({ data: prev.data, error: null, loading: true }))

    apiFetch<T>(path, { signal: controller.signal })
      .then((data) => {
        if (live) setState({ data, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (!live || (err instanceof DOMException && err.name === 'AbortError')) return
        setState({ data: null, error: toFailure(err), loading: false })
      })

    return () => {
      live = false
      controller.abort()
    }
  }, [path, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { ...state, reload }
}

/**
 * Trailing-edge debounce, for the search box and the quick switcher.
 *
 * Typing "stoicism" is one request instead of eight, which matters because the
 * search query walks the whole vault.
 */
export function useDebounced<T>(value: T, delay = 180): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return settled
}
