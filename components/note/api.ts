'use client'

/**
 * Client-side fetching for the note pane.
 *
 * Every failure the browser can see is funnelled into one shape — a typed
 * `{ code, message }` the UI can switch on with `isDatabaseError()` — so no
 * component ever touches a Response, a thrown TypeError or a stack trace. A
 * dead network and a 503 from the driver are the same story to the reader
 * ("can't reach the vault"), and they read the same here.
 */

import { useCallback, useEffect, useState } from 'react'

import { isApiError, type ApiErrorCode, type Note, type NoteInput, type NoteSummary } from '@/lib/types'

export interface Problem {
  code: ApiErrorCode
  message: string
}

/** The only error type this module throws. */
export class RequestFailed extends Error implements Problem {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RequestFailed'
  }
}

/** Anything unexpected becomes a Problem rather than reaching a render. */
export function toProblem(error: unknown): Problem {
  if (error instanceof RequestFailed) return { code: error.code, message: error.message }
  return {
    code: 'INTERNAL',
    message: 'Something went wrong while loading this note.',
  }
}

/**
 * Fetch JSON, or throw a `RequestFailed`.
 *
 * `fetch` only rejects when the request never completed, which from the
 * reader's seat is indistinguishable from the vault being down — so it maps to
 * DB_UNREACHABLE and gets the retry button, not a generic "internal error".
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { cache: 'no-store', ...init })
  } catch {
    throw new RequestFailed(
      'DB_UNREACHABLE',
      'The vault did not respond. It may be starting up, or the connection dropped.',
    )
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (isApiError(payload)) {
    throw new RequestFailed(payload.error.code, payload.error.message)
  }
  if (!response.ok) {
    throw new RequestFailed('INTERNAL', 'The vault returned an unexpected response.')
  }
  return payload as T
}

/* ------------------------------------------------------------------ hooks */

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; problem: Problem }

/**
 * Load a URL, re-loading whenever `version` changes.
 *
 * `version` is how a save tells the backlinks and suggestion panels that the
 * graph moved under them — bumping it is the whole live-feedback mechanism.
 * Retry bumps a private counter, so a component can offer "try again" without
 * the parent knowing.
 */
export function useResource<T>(url: string, version = 0): {
  resource: Resource<T>
  retry: () => void
  retrying: boolean
} {
  const [attempt, setAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [resource, setResource] = useState<Resource<T>>({ status: 'loading' })

  useEffect(() => {
    // Responses that arrive after the slug changed must not overwrite the note
    // the reader is now looking at.
    let live = true
    setResource({ status: 'loading' })

    request<T>(url)
      .then((data) => {
        if (live) setResource({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (live) setResource({ status: 'failed', problem: toProblem(error) })
      })
      .finally(() => {
        if (live) setRetrying(false)
      })

    return () => {
      live = false
    }
  }, [url, version, attempt])

  const retry = useCallback(() => {
    setRetrying(true)
    setAttempt((n) => n + 1)
  }, [])

  return { resource, retry, retrying }
}

/**
 * The set of slugs that resolve to a real note.
 *
 * Stubs are excluded deliberately: a stub exists only because something linked
 * to it, so a link *to* a stub is still an unresolved link and must render
 * greyed out. `null` while loading or after a failure means "assume resolved",
 * which keeps the body from flashing entirely grey on first paint.
 */
export function useVaultSlugs(version = 0): ReadonlySet<string> | null {
  const [slugs, setSlugs] = useState<ReadonlySet<string> | null>(null)

  useEffect(() => {
    let live = true

    request<NoteSummary[]>('/api/notes')
      .then((notes) => {
        if (!live) return
        setSlugs(new Set(notes.filter((note) => !note.stub).map((note) => note.slug)))
      })
      .catch(() => {
        // Silent: the note itself already reports a vault failure, and two
        // panels shouting the same thing helps nobody.
        if (live) setSlugs(null)
      })

    return () => {
      live = false
    }
  }, [version])

  return slugs
}

/* ----------------------------------------------------------------- writes */

/** PUT a note. Creates it when the slug does not exist yet. */
export function saveNote(slug: string, input: NoteInput): Promise<Note> {
  return request<Note>(`/api/notes/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
