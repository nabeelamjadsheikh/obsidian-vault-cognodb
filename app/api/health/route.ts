/**
 * GET /api/health — is the vault database actually reachable?
 *
 * This does a real round trip rather than returning a constant. A health check
 * that only proves Next.js is running is worse than none: it says "ok" while
 * every other endpoint is failing, which is exactly the situation the check
 * exists to catch. `ping()` runs `RETURN 1`, so the cost is one cheap query.
 *
 * A dead database therefore surfaces here as a 503 with a DB_* code, which is
 * what the UI's "can't reach the vault" panel switches on.
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
