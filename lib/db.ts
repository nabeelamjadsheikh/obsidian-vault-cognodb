/**
 * The only place that talks to CognoDB.
 *
 * Everything above this file works with plain JavaScript values and a small
 * set of error codes; nothing else in the app imports `neo4j-driver`.
 *
 * CognoDB speaks openCypher over Bolt and is driver-compatible with Neo4j, so
 * the official driver is used unmodified — only the URI differs. The same code
 * runs against a local `neo4j:5-community` container during development.
 */

import neo4j, { Driver, Session } from 'neo4j-driver'
import type { ApiErrorCode } from './types'

/* ----------------------------------------------------------------- config */

export interface DbConfig {
  uri: string
  user: string
  password: string
}

/**
 * Credentials come from the environment and are never committed. Missing
 * config is a startup-class mistake, so it fails loudly with the variable
 * names rather than surfacing later as a confusing auth error.
 */
function readConfig(): DbConfig {
  const uri = process.env.COGNODB_URI
  const user = process.env.COGNODB_USER
  const password = process.env.COGNODB_PASSWORD

  const missing = [
    !uri && 'COGNODB_URI',
    !user && 'COGNODB_USER',
    !password && 'COGNODB_PASSWORD',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new DbError(
      'CONFIG',
      `Missing environment ${
        missing.length === 1 ? 'variable' : 'variables'
      }: ${missing.join(', ')}. Copy .env.example to .env.local and fill in your CognoDB connection details.`,
    )
  }

  return { uri: uri!, user: user!, password: password! }
}

/* ----------------------------------------------------------------- errors */

/** A database failure already translated into something the UI can switch on. */
export class DbError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DbError'
  }
}

/**
 * Recognise a driver error without `instanceof`.
 *
 * `err instanceof Neo4jError` looks correct and works in a plain script, but it
 * silently fails inside the Next.js production bundle: the class the route
 * imports and the class the driver throws can come from two different module
 * instances, and `instanceof` compares identity, not shape. The symptom is
 * nasty — a database outage reports as a generic 500 INTERNAL instead of
 * DB_UNREACHABLE, so the UI shows "something went wrong" rather than the
 * "can't reach the vault" panel with a retry button. Matching on the shape the
 * driver actually produces survives bundling.
 */
function asDriverError(err: unknown): { code: string; message: string } | null {
  if (typeof err !== 'object' || err === null) return null
  const candidate = err as { name?: unknown; code?: unknown; message?: unknown }
  if (typeof candidate.code !== 'string') return null
  const isNeo4j =
    candidate.name === 'Neo4jError' ||
    candidate.code.startsWith('Neo.') ||
    candidate.code === 'ServiceUnavailable' ||
    candidate.code === 'SessionExpired'
  if (!isNeo4j) return null
  return {
    code: candidate.code,
    message: typeof candidate.message === 'string' ? candidate.message : 'Database error.',
  }
}

/**
 * Map driver failures onto our error codes.
 *
 * The distinction that matters to the user is "the vault is unreachable"
 * versus "your request was wrong" — the first gets a retry panel, the second
 * gets an inline message.
 */
export function toDbError(err: unknown): DbError {
  if (err instanceof DbError) return err

  const driverError = asDriverError(err)
  if (driverError) {
    const { code, message } = driverError

    if (code.includes('Security.Unauthorized') || code.includes('AuthenticationRateLimit')) {
      return new DbError(
        'DB_AUTH',
        'The vault database rejected these credentials. Check COGNODB_USER and COGNODB_PASSWORD.',
        err,
      )
    }

    // ServiceUnavailable and SessionExpired both mean "no usable connection".
    if (code === 'ServiceUnavailable' || code === 'SessionExpired') {
      return new DbError(
        'DB_UNREACHABLE',
        'Cannot reach the vault database. Check COGNODB_URI and that the instance is running.',
        err,
      )
    }

    if (code.includes('TransactionTimedOut') || /timed? ?out/i.test(message)) {
      return new DbError('DB_TIMEOUT', 'The vault database took too long to respond.', err)
    }

    return new DbError('INTERNAL', message, err)
  }

  // Connection refused / DNS failure before the driver wraps it.
  if (err instanceof Error && /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/.test(err.message)) {
    return new DbError(
      'DB_UNREACHABLE',
      'Cannot reach the vault database. Check COGNODB_URI and that the instance is running.',
      err,
    )
  }

  return new DbError(
    'INTERNAL',
    err instanceof Error ? err.message : 'Unexpected database error.',
    err,
  )
}

/* ----------------------------------------------------------------- driver */

/**
 * The driver is expensive to construct and owns a connection pool, so exactly
 * one exists per process. It is pinned to `globalThis` because Next.js reloads
 * modules in development and reuses lambda instances in production — without
 * this, each reload would leak a pool.
 */
const globalForDriver = globalThis as unknown as { __vaultDriver?: Driver }

export function getDriver(): Driver {
  if (globalForDriver.__vaultDriver) return globalForDriver.__vaultDriver

  const { uri, user, password } = readConfig()

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    // The free c0 instance has 256 MB RAM and a 200-connection ceiling. A small
    // pool is plenty for this app and leaves headroom for concurrent lambdas.
    maxConnectionPoolSize: 10,
    connectionAcquisitionTimeout: 10_000,
    connectionTimeout: 10_000,
    maxTransactionRetryTime: 8_000,
    // Timestamps are stored as ISO strings, so the driver never needs to hand
    // back native Integer objects for dates.
    disableLosslessIntegers: false,
  })

  globalForDriver.__vaultDriver = driver
  return driver
}

/** Closes the pool. Used by scripts; the server keeps the driver for its lifetime. */
export async function closeDriver(): Promise<void> {
  if (globalForDriver.__vaultDriver) {
    await globalForDriver.__vaultDriver.close()
    globalForDriver.__vaultDriver = undefined
  }
}

/* ------------------------------------------------- value normalisation */

/**
 * The driver returns 64-bit integers as `{low, high}` objects, and temporal
 * values as its own classes. Converting once here means nothing downstream —
 * no query function, no route, no component — ever has to think about it.
 */
export function toPlain<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) return value as T

  if (neo4j.isInt(value)) {
    // Counts and degrees are always well inside the safe range; anything that
    // isn't would be silently wrong as a JS number, so surface it as a string.
    return (value.inSafeRange() ? value.toNumber() : value.toString()) as T
  }

  if (
    neo4j.isDateTime(value) ||
    neo4j.isLocalDateTime(value) ||
    neo4j.isDate(value) ||
    neo4j.isTime(value) ||
    neo4j.isLocalTime(value) ||
    neo4j.isDuration(value)
  ) {
    return value.toString() as T
  }

  if (Array.isArray(value)) {
    return value.map((v) => toPlain(v)) as T
  }

  // Nodes and relationships: hand back their properties, which is all the app
  // ever wants. Labels and types are returned explicitly by the queries.
  if (value instanceof neo4j.types.Node || value instanceof neo4j.types.Relationship) {
    return toPlain(value.properties) as T
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toPlain(v)
    }
    return out as T
  }

  return value as T
}

/* ------------------------------------------------------------- execution */

/**
 * Run a read query and return normalised rows.
 *
 * `params` is not optional by accident: every query in this app is
 * parameterised, and there is no code path that interpolates user input into
 * Cypher. Pass `{}` for queries that genuinely take no arguments.
 */
export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session: Session = getDriver().session({ defaultAccessMode: neo4j.session.READ })
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, params))
    return result.records.map((record) => toPlain<T>(record.toObject()))
  } catch (err) {
    throw toDbError(err)
  } finally {
    await session.close()
  }
}

/** Run a write query. Same contract as `runQuery`, routed as a write. */
export async function runWrite<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session: Session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE })
  try {
    const result = await session.executeWrite((tx) => tx.run(cypher, params))
    return result.records.map((record) => toPlain<T>(record.toObject()))
  } catch (err) {
    throw toDbError(err)
  } finally {
    await session.close()
  }
}

/**
 * Run several statements inside one transaction.
 *
 * Saving a note rewrites all of its outgoing relationships; doing that across
 * separate transactions would leave the graph briefly wrong, so the whole
 * rewrite commits or none of it does.
 */
export async function runTransaction<T = unknown>(
  work: (run: (cypher: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>[]>) => Promise<T>,
): Promise<T> {
  const session: Session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE })
  try {
    return await session.executeWrite(async (tx) => {
      const run = async (cypher: string, params: Record<string, unknown> = {}) => {
        const result = await tx.run(cypher, params)
        return result.records.map((r) => toPlain<Record<string, unknown>>(r.toObject()))
      }
      return work(run)
    })
  } catch (err) {
    throw toDbError(err)
  } finally {
    await session.close()
  }
}

/**
 * Cheapest possible round trip. Used by /api/health and by the seed script to
 * fail fast with a clear message instead of a stack trace.
 */
export async function ping(): Promise<boolean> {
  await runQuery('RETURN 1 AS ok', {})
  return true
}
