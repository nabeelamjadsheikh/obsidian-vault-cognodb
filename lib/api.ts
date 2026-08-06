/**
 * The single place route handlers turn results and failures into responses.
 *
 * Without this, "graceful error handling when the database is unreachable"
 * degrades into each route inventing its own error shape and one forgotten
 * try/catch leaking a stack trace to the browser. Routes stay three lines long
 * and the client always gets `{ error: { code, message } }`.
 */

import { NextResponse } from 'next/server'
import { DbError, toDbError } from './db'
import type { ApiError, ApiErrorCode } from './types'

/** An error deliberately raised by a route — bad input, missing note. */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiFailure'
  }
}

export const notFound = (what: string) => new ApiFailure('NOT_FOUND', `${what} not found.`)
export const badRequest = (message: string) => new ApiFailure('BAD_REQUEST', message)
export const conflict = (message: string) => new ApiFailure('CONFLICT', message)

/** HTTP status per error code. DB failures are 503 — the request was fine. */
const STATUS: Record<ApiErrorCode, number> = {
  DB_UNREACHABLE: 503,
  DB_TIMEOUT: 504,
  DB_AUTH: 503,
  CONFIG: 503,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  INTERNAL: 500,
}

function errorResponse(code: ApiErrorCode, message: string): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] })
}

/**
 * Wrap a route handler so every failure — thrown by us, by the driver, or by
 * something unforeseen — comes back as a typed JSON error.
 *
 * Unexpected errors are logged server-side but return a generic message: an
 * internal stack trace is not something the browser needs.
 */
export function handle<T>(
  work: () => Promise<T>,
): Promise<NextResponse<T> | NextResponse<ApiError>> {
  return work()
    .then((data) => NextResponse.json(data))
    .catch((err: unknown) => {
      if (err instanceof ApiFailure) {
        return errorResponse(err.code, err.message)
      }

      const dbErr: DbError = toDbError(err)
      if (dbErr.code === 'INTERNAL') {
        console.error('[api] unhandled error:', dbErr.cause ?? dbErr)
        return errorResponse('INTERNAL', 'Something went wrong handling this request.')
      }

      // Database failures are expected operationally, so log them plainly
      // rather than as a crash, and pass the actionable message through.
      console.warn(`[api] database error [${dbErr.code}]: ${dbErr.message}`)
      return errorResponse(dbErr.code, dbErr.message)
    })
}

/* ------------------------------------------------------- param validation */

/** Read a required string query param, or fail with a useful message. */
export function requireParam(url: URL, name: string): string {
  const value = url.searchParams.get(name)
  if (!value || value.trim() === '') {
    throw badRequest(`Missing required query parameter "${name}".`)
  }
  return value.trim()
}

/**
 * Read a bounded integer query param.
 *
 * Graph depth in particular must be clamped rather than trusted: the Cypher
 * uses a literal ceiling of 3 hops, so a larger value would silently do
 * nothing while looking like it worked.
 */
export function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name)
  if (raw === null) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw badRequest(`Query parameter "${name}" must be a number.`)
  }
  return Math.min(max, Math.max(min, parsed))
}

/** Parse and validate a JSON body against a predicate. */
export async function readJson<T>(
  request: Request,
  validate: (value: unknown) => value is T,
  expected: string,
): Promise<T> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw badRequest('Request body must be valid JSON.')
  }
  if (!validate(body)) {
    throw badRequest(`Request body must be ${expected}.`)
  }
  return body
}
