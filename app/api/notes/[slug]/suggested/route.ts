/**
 * GET /api/notes/[slug]/suggested — notes that share two or more tags, people
 * or sources with this one but are not linked to it in either direction.
 *
 * This is the "you might want to connect these" panel. An empty array is the
 * common and correct answer for a well-linked note, so it is never an error;
 * like backlinks, an unknown slug simply has no suggestions.
 */

import { handle } from '@/lib/api'
import { getSuggestedLinks } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ slug: string }> }

export function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    const { slug } = await params
    return getSuggestedLinks(slug)
  })
}
