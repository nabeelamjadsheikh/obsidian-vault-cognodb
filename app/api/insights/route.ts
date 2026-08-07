/** GET /api/insights — orphans, hubs and headline counts in one round trip. */

import { handle } from '@/lib/api'
import { getInsights } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return handle(() => getInsights())
}
