/**
 * Request-body guards. They answer "is this the shape I asked for" and nothing
 * more — trimming, defaulting and slugifying belong to the query layer.
 */

import type { NoteInput } from './types'

/**
 * `body` may be empty; `title` may not, since the slug derives from it. Links,
 * tags, people and sources are never accepted from the client — they are parsed
 * out of the body, which is what keeps the graph and the prose in sync.
 */
export function isNoteInput(value: unknown): value is NoteInput {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>

  if (typeof input.title !== 'string' || input.title.trim() === '') return false
  if (typeof input.body !== 'string') return false
  if (
    input.folder !== undefined &&
    input.folder !== null &&
    typeof input.folder !== 'string'
  ) {
    return false
  }

  return true
}

/** The human-readable half of the 400 when `isNoteInput` says no. */
export const NOTE_INPUT_SHAPE =
  'an object with a non-empty "title" string, a "body" string, and an optional "folder" string'
