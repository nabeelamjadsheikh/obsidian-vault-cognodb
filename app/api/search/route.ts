/**
 * GET /api/search?q= — title and body search across the vault.
 *
 * `q` is required rather than defaulted, because the alternative is a query
 * that matches every note in the vault and looks like the search is broken.
 * The client simply does not call this endpoint while the box is empty; the UI
 * shows its idle state instead.
 */

import { handle, requireParam } from '@/lib/api'
import { searchNotes } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const q = requireParam(url, 'q')

    return searchNotes(q)
  })
}
