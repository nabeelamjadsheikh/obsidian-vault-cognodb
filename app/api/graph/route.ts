/**
 * GET /api/graph — the vault as nodes and edges, globally or around one note.
 *
 * The only real work here is validation, and it matters more than it looks:
 *
 *   - `depth` is clamped to 1..3 by `intParam`, because the Cypher carries a
 *     literal 3-hop ceiling. An unclamped 12 would return three hops while
 *     looking like it had obeyed.
 *   - `scope=local` without a slug is a 400, not an empty graph. Silently
 *     rendering nothing would look like a broken vault rather than a broken
 *     request.
 *   - `types` is checked against the known relationship types, so a typo comes
 *     back as a readable message instead of an empty canvas.
 */

import { badRequest, handle, intParam } from '@/lib/api'
import { ALL_REL_TYPES, getGlobalGraph, getLocalGraph } from '@/lib/queries'
import type { RelType } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `types=LINKS_TO,TAGGED` → the parsed list, or undefined for "all of them". */
function parseTypes(raw: string | null): RelType[] | undefined {
  if (raw === null || raw.trim() === '') return undefined

  const requested = raw
    .split(',')
    .map((type) => type.trim().toUpperCase())
    .filter(Boolean)

  const unknown = requested.filter((type) => !(ALL_REL_TYPES as readonly string[]).includes(type))
  if (unknown.length > 0) {
    throw badRequest(
      `Unknown relationship ${unknown.length === 1 ? 'type' : 'types'}: ${unknown.join(', ')}. ` +
        `Valid types are ${ALL_REL_TYPES.join(', ')}.`,
    )
  }

  return requested.length > 0 ? (requested as RelType[]) : undefined
}

export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)

    const scope = (url.searchParams.get('scope') ?? 'global').trim().toLowerCase()
    if (scope !== 'global' && scope !== 'local') {
      throw badRequest('Query parameter "scope" must be either "global" or "local".')
    }

    // Validated for both scopes so a typo is always reported, but only the
    // global graph can act on it: the local traversal is fixed to the four
    // semantic types (LINKS_TO, TAGGED, MENTIONS, CITES), since walking
    // IN_FOLDER would connect every note in a folder to every other one and
    // turn a neighbourhood into a hairball.
    const types = parseTypes(url.searchParams.get('types'))

    if (scope === 'local') {
      const slug = (url.searchParams.get('slug') ?? '').trim()
      if (slug === '') {
        throw badRequest('A local graph needs a "slug" — which note should it be centred on?')
      }
      const depth = intParam(url, 'depth', 1, 1, 3)
      return getLocalGraph(slug, depth)
    }

    return getGlobalGraph(types)
  })
}
