/**
 * GET /api/path?from=&to=  — how are these two notes connected?
 *
 * `null` is a real answer with a 200 status, not an error: two unrelated
 * corners of a vault genuinely have no path between them, and the pane says
 * "no connection found within 8 hops" rather than showing a failure. Only a
 * missing parameter is a 400.
 */

import { handle, requireParam } from '@/lib/api'
import { findPath } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const from = requireParam(url, 'from')
    const to = requireParam(url, 'to')

    return findPath(from, to)
  })
}
