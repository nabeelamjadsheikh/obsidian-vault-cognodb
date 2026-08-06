'use client'

/**
 * Obsidian's bottom-right counter: "N backlinks · N words".
 *
 * It floats over the reading pane rather than sitting in a bar of its own,
 * which is what keeps it from stealing vertical space from the prose. The word
 * count comes from the vault index we already hold, so the only request this
 * costs is the backlink count — and if that request fails, the bar simply says
 * nothing rather than putting an error on top of a perfectly readable note.
 */

import type { Backlink, Note } from '@/lib/types'
import { useVault } from './VaultProvider'
import { useApi } from './useApi'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function StatusBar({ slug }: { slug: string }) {
  const { summaryFor } = useVault()
  const summary = summaryFor(slug)

  const backlinks = useApi<Backlink[]>(`/api/notes/${encodeURIComponent(slug)}/backlinks`)
  // Only reached for a note the index has not caught up with — one just
  // created, or one opened by deep link before the list arrived.
  const note = useApi<Note>(summary ? null : `/api/notes/${encodeURIComponent(slug)}`)

  const wordCount = summary?.wordCount ?? note.data?.wordCount ?? null
  const backlinkCount = backlinks.data?.length ?? null

  if (wordCount === null && backlinkCount === null) return null

  const parts = [
    backlinkCount === null ? null : plural(backlinkCount, 'backlink'),
    wordCount === null ? null : plural(wordCount, 'word'),
  ].filter(Boolean) as string[]

  return (
    <div
      className="pointer-events-none absolute bottom-2 right-3 z-10 select-none rounded-[4px] bg-bg/85 px-2 py-1 text-[11px] tabular-nums text-text-faint backdrop-blur-sm"
      aria-live="polite"
    >
      {parts.join(' · ')}
    </div>
  )
}

export default StatusBar
