/**
 * GET /api/insights — what the vault looks like from above: orphaned notes,
 * hub notes, and the headline counts.
 *
 * `getInsights` runs its three queries concurrently, so this is one round trip
 * from the client's point of view. Every field has an honest zero-or-empty
 * form, which means the panel renders an empty state on a brand-new vault
 * instead of failing.
 */

import { handle } from '@/lib/api'
import { getInsights } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return handle(() => getInsights())
}
