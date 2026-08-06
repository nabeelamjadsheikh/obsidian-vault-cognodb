'use client'

/**
 * The graph pane's one data source.
 *
 * The global graph is 273 nodes and 1666 edges over a small free-tier database,
 * so the rules here are deliberate:
 *
 *   - One request per *request key*, never per render. The key is the URL, so
 *     nothing but a real change of scope, note, depth or filter can cause a
 *     fetch.
 *   - Answers are cached for the session. Flicking a filter off and back on,
 *     or stepping the depth slider 1 → 2 → 1, is instant and costs the database
 *     nothing.
 *   - In-flight requests are aborted when the key changes, so a slow global
 *     graph can never land after — and overwrite — a fast local one.
 *   - Data for the *same* note is kept on screen while a depth or filter change
 *     loads, so the picture updates rather than blinking through a skeleton.
 *     Changing note or scope does clear it: showing the old vault while the new
 *     one loads would be a lie.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isApiError, type ApiErrorCode, type GraphData, type RelType } from '@/lib/types'

export interface GraphRequest {
  scope: 'global' | 'local'
  /** Required when scope is 'local'. */
  slug?: string
  /** 1–3. Only meaningful for local scope. */
  depth?: number
  /** Only sent for global scope — the local traversal has a fixed type set. */
  types?: RelType[]
}

export interface GraphFailure {
  code: ApiErrorCode
  message?: string
}

export interface GraphDataState {
  /** Last successfully loaded graph for the current note/scope, or null. */
  data: GraphData | null
  loading: boolean
  error: GraphFailure | null
  /** True while refreshing a graph that is already on screen. */
  refreshing: boolean
  retry: () => void
}

/* -------------------------------------------------------------------- cache */

/**
 * Session cache, bounded so a long session cannot grow without limit. A Map
 * preserves insertion order, so the oldest key is always the first one.
 */
const CACHE_LIMIT = 16
const cache = new Map<string, GraphData>()

function remember(key: string, data: GraphData) {
  cache.set(key, data)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
}

/* ---------------------------------------------------------------- url + key */

function buildUrl(request: GraphRequest): string {
  const params = new URLSearchParams({ scope: request.scope })

  if (request.scope === 'local') {
    params.set('slug', request.slug ?? '')
    params.set('depth', String(request.depth ?? 1))
  } else if (request.types && request.types.length > 0) {
    params.set('types', request.types.join(','))
  }

  return `/api/graph?${params.toString()}`
}

/**
 * Which graph *subject* this is. Two requests sharing a group are the same
 * neighbourhood seen differently, so the old picture may stay up while the new
 * one loads.
 */
function groupOf(request: GraphRequest): string {
  return request.scope === 'local' ? `local:${request.slug ?? ''}` : 'global'
}

/* --------------------------------------------------------------- the reader */

/** Turn any failed response into a typed, renderable failure. Never a stack trace. */
async function readFailure(response: Response): Promise<GraphFailure> {
  try {
    const body: unknown = await response.json()
    if (isApiError(body)) return { code: body.error.code, message: body.error.message }
  } catch {
    // Fall through: a non-JSON error body is still a real failure.
  }
  return { code: response.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST' }
}

export function useGraphData(request: GraphRequest): GraphDataState {
  const url = buildUrl(request)
  const group = groupOf(request)

  // Bumping this re-runs the effect without changing the key, and skips the
  // cache — which is exactly what "Try again" should do.
  const [attempt, setAttempt] = useState(0)

  const [state, setState] = useState<{
    group: string
    url: string | null
    data: GraphData | null
    error: GraphFailure | null
  }>({ group, url: null, data: null, error: null })

  // Read during render rather than in an effect, so a cache hit paints on the
  // first frame instead of flashing a skeleton for one commit. `retry` evicts
  // the key before bumping `attempt`, so a retry always misses here.
  const cached = cache.get(url)

  const settledUrl = cached ? url : state.url
  const sameGroup = state.group === group

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const hit = cache.get(url)
    if (hit) {
      setState({ group, url, data: hit, error: null })
      return
    }

    const controller = new AbortController()

    // Drop stale data when the subject changes; keep it when only the view did.
    setState((prev) =>
      prev.group === group
        ? { ...prev, group, error: null }
        : { group, url: null, data: null, error: null },
    )

    fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw await readFailure(response)
        return (await response.json()) as GraphData
      })
      .then((data) => {
        if (controller.signal.aborted || !mountedRef.current) return
        remember(url, data)
        setState({ group, url, data, error: null })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || !mountedRef.current) return

        // A thrown GraphFailure came from readFailure above. Anything else is
        // the request never arriving — no connection, or the server is down —
        // which for the reader is the same story as an unreachable vault.
        const failure: GraphFailure =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as GraphFailure)
            : {
                code: 'DB_UNREACHABLE',
                message:
                  'The vault did not answer. Check that the app is still running, then try again.',
              }

        setState((prev) => ({ group, url: null, data: prev.group === group ? prev.data : null, error: failure }))
      })

    return () => controller.abort()
  }, [url, group, attempt])

  const retry = useCallback(() => {
    cache.delete(url)
    setAttempt((n) => n + 1)
  }, [url])

  const data = cached ?? (sameGroup ? state.data : null)
  const error = cached ? null : state.error
  const settled = settledUrl === url

  return useMemo(
    () => ({
      data,
      error,
      loading: !settled && !error && data === null,
      refreshing: !settled && !error && data !== null,
      retry,
    }),
    [data, error, settled, retry],
  )
}
