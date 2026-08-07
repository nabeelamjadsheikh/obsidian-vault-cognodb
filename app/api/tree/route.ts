/**
 * GET /api/tree — folder hierarchy and tag cloud together, because the sidebar
 * renders them together and should not wait on two round trips to show one pane.
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
