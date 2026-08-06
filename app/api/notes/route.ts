/**
 * /api/notes — the sidebar list, and creating a note.
 *
 * Both handlers are three lines of parsing around one call into lib/queries.
 * There is no Cypher here and no decisions about the graph: whether a create
 * collides, adopts a stub or succeeds is decided inside a transaction in the
 * query layer, and this route only maps that answer onto a status code.
 */

import { badRequest, conflict, handle, readJson } from '@/lib/api'
import { createNote, listNotes } from '@/lib/queries'
import { isNoteInput, NOTE_INPUT_SHAPE } from '@/lib/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Every note in the vault, newest first, without bodies. */
export function GET() {
  return handle(() => listNotes())
}

/**
 * Create a note.
 *
 * A slug that already belongs to a written note is a 409 — overwriting
 * somebody's note because they reused a title would be indefensible. A slug
 * that belongs to an unresolved stub is adopted instead, which is what makes
 * clicking a greyed-out `[[link]]` and writing it feel continuous.
 */
export function POST(request: Request) {
  return handle(async () => {
    const input = await readJson(request, isNoteInput, NOTE_INPUT_SHAPE)

    const result = await createNote(input)
    if (!result.ok) {
      if (result.reason === 'INVALID_TITLE') {
        throw badRequest('A note title needs at least one letter or number.')
      }
      throw conflict(
        `A note called "${input.title.trim()}" already exists. Open it, or choose a different title.`,
      )
    }

    return result.note
  })
}
