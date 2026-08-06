'use client'

/**
 * Small shared pieces of the note pane: a link to another note, a metadata
 * chip, and a keyboard-shortcut hint.
 *
 * They live together because each is a handful of lines and they must stay
 * visually identical everywhere they appear — a note title in the backlinks
 * panel has to look exactly like a wikilink in the body, or the reader learns
 * two different things mean the same thing.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'

/** A link to another note, styled like an inline wikilink. */
export function NoteLink({
  slug,
  title,
  className = '',
}: {
  slug: string
  title: string
  className?: string
}) {
  return (
    <Link href={`/note/${encodeURIComponent(slug)}`} className={`internal-link ${className}`}>
      {title}
    </Link>
  )
}

/**
 * A person or source attached to the note.
 *
 * Deliberately not a TagPill: tags are the note's own vocabulary, while people
 * and sources are entities the vault shares between notes, and the small icon
 * plus square-ish shape keeps that distinction visible at a glance.
 */
export function MetaChip({ kind, label }: { kind: 'person' | 'source'; label: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-border bg-surface px-2 py-[3px] text-[11px] text-text-muted"
      title={kind === 'person' ? `Mentions ${label}` : `Cites ${label}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={11}
        height={11}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-text-faint"
        aria-hidden
        focusable="false"
      >
        {kind === 'person' ? (
          <>
            <circle cx="12" cy="8" r="3.6" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          </>
        ) : (
          <>
            <path d="M4 4.8A1.8 1.8 0 0 1 5.8 3H18a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 18 21H5.8A1.8 1.8 0 0 1 4 19.2Z" />
            <path d="M7.5 7.5h8M7.5 11h8" />
          </>
        )}
      </svg>
      <span className="truncate">{label}</span>
    </span>
  )
}

/** A keyboard shortcut, rendered the way the platform writes it. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-border bg-surface-alt px-1 py-px font-sans text-[10px] leading-[1.4] text-text-faint">
      {children}
    </kbd>
  )
}

/**
 * ⌘ on Apple hardware, Ctrl everywhere else.
 *
 * Resolved in an effect rather than during render: the server has no navigator,
 * so branching on it while rendering would hydrate a `Ctrl` into a `⌘` and
 * React would (rightly) complain. Everyone starts at `Ctrl` for one frame.
 */
export function useModifierKey(): string {
  const [label, setLabel] = useState('Ctrl')

  useEffect(() => {
    const ua = navigator.userAgent
    if (/Mac|iPhone|iPad|iPod/.test(ua)) setLabel('⌘')
  }, [])

  return label
}
