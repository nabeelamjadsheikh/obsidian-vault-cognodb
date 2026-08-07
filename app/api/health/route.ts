/**
 * GET /api/health — is the database reachable?
 *
 * Does a real `RETURN 1` rather than returning a constant. A check that only
 * proves Next.js is up would report "ok" while every other endpoint fails,
 * which is the exact situation it exists to catch.
 */

import { handle } from '@/lib/api'
import { ping } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return handle(async () => {
    await ping()
    return { ok: true as const }
  })
}
