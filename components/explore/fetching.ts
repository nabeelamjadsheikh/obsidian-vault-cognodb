'use client'

/**
 * The pane's data layer: one fetch helper, one hook, one rule.
 *
 * The rule is that nothing raw ever reaches the screen. Every failure —
 * a dropped socket, an HTML error page, malformed JSON, a real API error —
 * is funnelled into an `ExploreError` carrying an `ApiErrorCode`, which is the
 * only thing `ErrorState` needs. A stack trace, a `TypeError: Failed to fetch`
 * or a 500-page body can never be rendered, because they are never carried.
 */

import { useCallback, useEffect, useState } from 'react'
import { isApiError, type ApiErrorCode } from '@/lib/types'

/** A failure the UI knows how to talk about. */
export class ExploreError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ExploreError'
    this.code = code
  }
}

/** True for the abort we cause ourselves when a pane unmounts or re-queries. */
export function isAbort(cause: unknown): boolean {
  return (
    cause instanceof DOMException &&
    (cause.name === 'AbortError' || cause.name === 'TimeoutError')
  )
}

/**
 * Anything that is not already an `ExploreError` becomes a generic internal
 * one. The original is deliberately dropped rather than stringified into the
 * message — an exception's text is written for a developer, not a reader.
 */
export function asExploreError(cause: unknown): ExploreError {
  if (cause instanceof ExploreError) return cause
  return new ExploreError('INTERNAL', 'Something went wrong while loading this panel.')
}

/**
 * `fetch` + JSON, with every unhappy path mapped to a code.
 *
 * A network-level throw becomes DB_UNREACHABLE rather than INTERNAL: from the
 * browser's side, "the request never completed" is indistinguishable from the
 * vault being down, and that is the panel a reader can act on.
 */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { accept: 'application/json' } })
  } catch (cause) {
    if (isAbort(cause)) throw cause
    throw new ExploreError(
      'DB_UNREACHABLE',
      'The vault did not answer. Check that the app is still running, then try again.',
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    if (isAbort(cause)) throw cause
    body = null
  }

  // The API's own error envelope is the best source of truth when present.
  if (isApiError(body)) throw new ExploreError(body.error.code, body.error.message)

  if (!response.ok) {
    throw new ExploreError(
      response.status === 404 ? 'NOT_FOUND' : 'INTERNAL',
      'The vault responded, but not with anything this panel could read.',
    )
  }

  return body as T
}

/* ------------------------------------------------------------------- state */

export type Async<T> =
  | { phase: 'loading' }
  | { phase: 'ready'; data: T }
  | { phase: 'error'; error: ExploreError }

/**
 * Load a URL, expose a `reload`.
 *
 * Deliberately not SWR/React Query: this pane makes four requests, and a cache
 * library would be more code than the thing it caches. The in-flight request is
 * aborted on unmount and on reload so a slow response can never overwrite a
 * newer one.
 */
export function useResource<T>(url: string): { state: Async<T>; reload: () => void } {
  const [state, setState] = useState<Async<T>>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })

    getJson<T>(url, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ phase: 'ready', data })
      })
      .catch((cause: unknown) => {
        if (isAbort(cause) || controller.signal.aborted) return
        setState({ phase: 'error', error: asExploreError(cause) })
      })

    return () => controller.abort()
  }, [url, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { state, reload }
}
