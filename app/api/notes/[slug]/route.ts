/**
 * /api/notes/[slug] — read, save and delete one note.
 *
 * PUT is the app's only substantial write, and all of its substance is in
 * `saveNote`: one transaction that rewrites the note and the whole outgoing
 * neighbourhood its body implies. This file just unwraps the params, validates
 * the body shape, and hands over.
 *
 * DELETE is likewise a query-layer decision: a note other notes still link to
 * becomes a stub rather than vanishing, because deleting it would leave every
 * one of those links pointing at nothing.
 */

import { handle, notFound, readJson } from '@/lib/api'
import { deleteNote, getNote, saveNote } from '@/lib/queries'
import { isNoteInput, NOTE_INPUT_SHAPE } from '@/lib/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Next 15 hands route params to the handler as a promise. */
type Context = { params: Promise<{ slug: string }> }

export function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    const { slug } = await params

    const note = await getNote(slug)
    // A slug that is not in the vault is a 404, not a database failure — the
    // UI offers to create it rather than showing the "can't reach" panel.
    if (!note) throw notFound(`Note "${slug}"`)

    return note
  })
}

/**
 * Save a note, creating it if the slug does not exist yet.
 *
 * PUT is idempotent by construction here: the saved graph is a function of the
 * body alone, so sending the same body twice leaves the vault identical.
 */
export function PUT(request: Request, { params }: Context) {
  return handle(async () => {
    const { slug } = await params
    const input = await readJson(request, isNoteInput, NOTE_INPUT_SHAPE)

    return saveNote(slug, input)
  })
}

export function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const { slug } = await params

    const existed = await deleteNote(slug)
    if (!existed) throw notFound(`Note "${slug}"`)

    return { deleted: true as const }
  })
}
