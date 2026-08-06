/**
 * Full-text search, with a fallback that works everywhere.
 *
 * CognoDB advertises BM25 full-text search but does not document the syntax or
 * guarantee the procedure is installed, and the seed script's
 * `CREATE FULLTEXT INDEX` is best-effort for the same reason. So this module
 * does not assume: it probes once, remembers which path works, and logs the
 * decision so it is visible in the server output rather than a mystery.
 *
 * The fallback is `toLower(...) CONTAINS toLower($q)` over title and body —
 * slower and dumber than BM25, but correct on any openCypher engine, and on a
 * personal vault of a few hundred notes the difference is imperceptible.
 *
 * Both paths return the same `SearchResult` shape, so nothing downstream can
 * tell which one ran.
 */

import { DbError, runQuery } from '../db'
import { isDatabaseError } from '../types'
import type { SearchResult } from '../types'

/* ------------------------------------------------------------ mode probe */

type SearchMode = 'fulltext' | 'contains'

/** Decided once per process, then reused for every subsequent search. */
let searchMode: SearchMode | null = null
/** In-flight probe, so concurrent first searches share one round trip. */
let probe: Promise<SearchMode> | null = null

/** Rows returned by whichever path ran. */
interface SearchRow {
  slug: string
  title: string | null
  body: string | null
  score: number | null
}

/**
 * Ask the database once whether the full-text index is usable.
 *
 * A *database* failure (unreachable, auth, timeout) is not evidence that
 * full-text is missing, so it is rethrown and nothing is cached — otherwise a
 * single blip during startup would permanently downgrade search for the life
 * of the process. Only a genuine query error (no such procedure, no such
 * index) settles the decision.
 */
async function resolveSearchMode(): Promise<SearchMode> {
  if (searchMode !== null) return searchMode
  if (probe !== null) return probe

  probe = (async (): Promise<SearchMode> => {
    try {
      await runQuery(
        `CALL db.index.fulltext.queryNodes('note_search', $q) YIELD node
         RETURN count(node) AS hits`,
        { q: 'probe' },
      )
      searchMode = 'fulltext'
      console.log('[search] full-text index "note_search" is available — using BM25 ranking')
    } catch (err) {
      if (err instanceof DbError && isDatabaseError(err.code)) {
        probe = null
        throw err
      }
      searchMode = 'contains'
      console.log(
        '[search] full-text index unavailable (' +
          (err instanceof Error ? err.message.split('\n')[0] : String(err)) +
          ') — falling back to CONTAINS matching',
      )
    }
    return searchMode
  })()

  return probe
}

/* ------------------------------------------------------------- formatting */

/**
 * Turn a user's words into a Lucene query.
 *
 * The index syntax is undocumented, so this stays inside the safest possible
 * subset: alphanumeric tokens joined with AND, with a trailing wildcard on the
 * last token so search-as-you-type matches a half-finished word. Punctuation
 * is dropped rather than escaped, which sidesteps every Lucene metacharacter
 * at once. The result is still passed as a `$parameter`, never concatenated
 * into the Cypher.
 */
function toLuceneQuery(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length > 0)

  if (tokens.length === 0) return ''
  const last = tokens.length - 1
  return tokens.map((token, i) => (i === last ? token + '*' : token)).join(' AND ')
}

const SNIPPET_RADIUS = 90

/**
 * A readable excerpt centred on the match.
 *
 * The snippet is built here rather than in Cypher because it is presentation,
 * not data: the database should not be doing string surgery, and the
 * full-text path may match a stemmed form that never appears verbatim — in
 * which case this degrades to the opening of the note, which is still a useful
 * preview.
 */
function buildSnippet(body: string, term: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return ''

  const haystack = flat.toLowerCase()
  const words = term.toLowerCase().split(/\s+/).filter(Boolean)

  let at = -1
  let matched = ''
  for (const candidate of [term.toLowerCase(), ...words]) {
    if (candidate.length === 0) continue
    const found = haystack.indexOf(candidate)
    if (found !== -1) {
      at = found
      matched = candidate
      break
    }
  }

  if (at === -1) {
    const head = flat.slice(0, SNIPPET_RADIUS * 2)
    return head.length < flat.length ? head.trimEnd() + '…' : head
  }

  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(flat.length, at + matched.length + SNIPPET_RADIUS)
  const core = flat.slice(start, end).trim()

  return (start > 0 ? '…' : '') + core + (end < flat.length ? '…' : '')
}

function toResults(rows: SearchRow[], term: string): SearchResult[] {
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title ?? row.slug,
    snippet: buildSnippet(row.body ?? '', term),
    score: row.score ?? 0,
  }))
}

/* ------------------------------------------------------------------ query */

/**
 * 8. Search the vault by title and body.
 *
 * Why a graph fits: less than the traversal queries, honestly — text search is
 * the one job a graph database is not uniquely good at, which is exactly why
 * it gets a documented fallback instead of a clever query. What the graph
 * *does* give is that a result is a node, so every hit arrives ready to be
 * expanded into its neighbourhood, backlinks and suggested links with no
 * second lookup by id.
 *
 * An empty or whitespace-only query returns `[]` immediately — the UI shows
 * its idle state, and the database is never asked to match everything.
 */
export async function searchNotes(q: string): Promise<SearchResult[]> {
  const term = q.trim()
  if (term.length === 0) return []

  const mode = await resolveSearchMode()
  const lucene = toLuceneQuery(term)

  if (mode === 'fulltext' && lucene.length > 0) {
    try {
      const rows = await runQuery<SearchRow>(
        `CALL db.index.fulltext.queryNodes('note_search', $q) YIELD node, score
         WITH node, score
         WHERE node:Note
         RETURN node.slug  AS slug,
                node.title AS title,
                node.body  AS body,
                score
         ORDER BY score DESC
         LIMIT 25`,
        { q: lucene },
      )
      return toResults(rows, term)
    } catch (err) {
      // A malformed Lucene expression or a dropped index should degrade the
      // search, not fail the request. Database-level failures still propagate.
      if (err instanceof DbError && isDatabaseError(err.code)) throw err
      searchMode = 'contains'
      console.log('[search] full-text query failed — switching to CONTAINS matching for this process')
    }
  }

  const rows = await runQuery<SearchRow>(
    `MATCH (n:Note)
     WITH n, toLower($q) AS needle
     WHERE toLower(coalesce(n.title, '')) CONTAINS needle
        OR toLower(coalesce(n.body, ''))  CONTAINS needle
     RETURN n.slug  AS slug,
            n.title AS title,
            n.body  AS body,
            CASE WHEN toLower(coalesce(n.title, '')) CONTAINS needle
                 THEN 2.0 ELSE 1.0 END AS score
     ORDER BY score DESC, coalesce(n.updatedAt, '') DESC
     LIMIT 25`,
    { q: term },
  )

  return toResults(rows, term)
}

/**
 * Forget the cached decision. Only used by tests and scripts that create the
 * index after this module has already probed.
 */
export function resetSearchMode(): void {
  searchMode = null
  probe = null
}
