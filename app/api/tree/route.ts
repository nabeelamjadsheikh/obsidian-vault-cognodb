/**
 * GET /api/tree — the sidebar's two navigation structures in one request:
 * the folder hierarchy and the tag cloud.
 *
 * They are fetched together because they are rendered together; splitting them
 * would make the sidebar wait on two round trips to show one pane. The two
 * queries are independent, so they run concurrently — the request is two
 * queries wide, not two deep.
 */

import { handle } from '@/lib/api'
import { getFolderTree, getTags } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return handle(async () => {
    const [folders, tags] = await Promise.all([getFolderTree(), getTags()])
    return { folders, tags }
  })
}
