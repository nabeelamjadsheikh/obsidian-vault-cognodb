'use client'

/**
 * The block above the note body: where it is filed, what it is called, when it
 * changed, and every entity it touches.
 *
 * The metadata is stacked in decreasing importance — folder, title, dates,
 * tags, people and sources — so a reader who stops after the first line still
 * knows where they are. In edit mode the title becomes an input in the same
 * place, at the same size, so switching modes never moves the text.
 */

import { TagPill } from '@/components/ui'
import type { Note } from '@/lib/types'

import { MetaChip } from './parts'

/**
 * Fixed locale and UTC, deliberately: the vault's dates are plain days, and
 * letting the browser's timezone shift them would show yesterday's date to
 * anyone west of Greenwich.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDate(iso: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return DATE_FORMAT.format(date)
}

/** `Ideas/Learning` → a breadcrumb that reads like a path without the slashes shouting. */
function Breadcrumb({ folder }: { folder: string }) {
  const segments = folder.split('/').filter(Boolean)

  return (
    <nav aria-label="Folder" className="flex flex-wrap items-center gap-1 text-[11px] text-text-faint">
      {segments.map((segment, i) => (
        <span key={`${segment}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden>/</span> : null}
          <span>{segment}</span>
        </span>
      ))}
    </nav>
  )
}

export interface NoteHeaderProps {
  note: Note
  editing: boolean
  /** The working title while editing; ignored in reading mode. */
  draftTitle: string
  onTitleChange: (title: string) => void
  /** Live count while editing, the stored count while reading. */
  wordCount: number
}

export function NoteHeader({
  note,
  editing,
  draftTitle,
  onTitleChange,
  wordCount,
}: NoteHeaderProps) {
  const updated = formatDate(note.updatedAt)
  const created = formatDate(note.createdAt)

  return (
    <header className="mb-7 flex flex-col gap-3">
      {note.folder ? <Breadcrumb folder={note.folder} /> : null}

      {editing ? (
        <input
          value={draftTitle}
          onChange={(event) => onTitleChange(event.target.value)}
          aria-label="Note title"
          placeholder="Untitled"
          spellCheck
          className="w-full rounded-[4px] border border-transparent bg-transparent font-serif text-[1.95rem] font-semibold leading-tight tracking-[-0.01em] text-text outline-none transition-colors hover:border-border focus:border-accent-dim"
        />
      ) : (
        <h1 className="font-serif text-[1.95rem] font-semibold leading-tight tracking-[-0.01em] text-text">
          {note.title}
        </h1>
      )}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-faint">
        {updated ? <span>Updated {updated}</span> : null}
        {created && created !== updated ? (
          <>
            <span aria-hidden>·</span>
            <span>Created {created}</span>
          </>
        ) : null}
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {wordCount.toLocaleString('en-GB')} {wordCount === 1 ? 'word' : 'words'}
        </span>
      </p>

      {note.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <TagPill key={tag} name={tag} />
          ))}
        </div>
      ) : null}

      {note.people.length > 0 || note.sources.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {note.people.map((person) => (
            <MetaChip key={`person-${person}`} kind="person" label={person} />
          ))}
          {note.sources.map((source) => (
            <MetaChip key={`source-${source}`} kind="source" label={source} />
          ))}
        </div>
      ) : null}
    </header>
  )
}

export default NoteHeader
