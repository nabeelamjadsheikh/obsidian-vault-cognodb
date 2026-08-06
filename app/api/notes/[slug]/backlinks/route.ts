/**
 * GET /api/notes/[slug]/backlinks — every note pointing at this one, each with
 * the sentence the link appeared in.
 *
 * An empty array is a normal answer, not an error: a note nobody links to yet
 * is a perfectly good note and the panel says so. An unknown slug also returns
 * `[]` rather than 404 — this endpoint is fetched alongside the note itself,
 * which is the request that decides whether the note exists, so re-answering
 * that question here would only cost a second lookup of the same node.
 */

import { handle } from '@/lib/api'
import { getBacklinks } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ slug: string }> }

export function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    const { slug } = await params
    return getBacklinks(slug)
  })
}
