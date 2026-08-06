/**
 * Request-body guards.
 *
 * `readJson` in lib/api.ts takes a predicate and turns a failed check into a
 * 400 with a readable message, so the guards themselves stay boring: they
 * answer "is this the shape I asked for", nothing more. Trimming, defaulting
 * and slugifying are the query layer's job.
 */

import type { NoteInput } from './types'

/**
 * A note as submitted by the editor.
 *
 * `body` may be empty — a note that is only a title is a legitimate thing to
 * create and then fill in. `title` may not: it is what the slug is derived
 * from, so an empty one leaves the note with no identity.
 *
 * `folder` is optional and may be null, which means the vault root. Links,
 * tags, people and sources are never accepted from the client; they are
 * derived from the body, which is what keeps the graph and the prose in sync.
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
