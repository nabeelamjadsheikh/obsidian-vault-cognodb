'use client'

/**
 * A type-ahead for picking one note out of the vault.
 *
 * Two sources, deliberately:
 *
 * - The full note list is already in memory, so title matching is filtered
 *   locally and lands on the very first keystroke with no network at all.
 *   A picker that stutters is a picker people stop using.
 * - `/api/search` runs underneath, debounced, and contributes the matches a
 *   title filter cannot find — the ones that live in the body of a note. They
 *   are appended below the title hits with the matching sentence, so it is
 *   obvious *why* a result with an unrelated title is on the list.
 *
 * It is a real combobox: arrow keys move, Enter picks, Escape reverts to
 * whatever was already selected rather than clearing the field, which is the
 * behaviour that makes an accidental keystroke harmless.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { NoteSummary, SearchResult } from '@/lib/types'
import { Icon, Skeleton } from '@/components/ui'
import { getJson, isAbort } from './fetching'

/** How many options the list renders before it asks the reader to keep typing. */
const MAX_OPTIONS = 40

/** Long enough to swallow a burst of typing, short enough to feel immediate. */
const DEBOUNCE_MS = 180

export interface NotePickerProps {
  /** Visible label — "From" or "To". */
  label: string
  /** The whole vault, already loaded by the parent. */
  notes: NoteSummary[]
  value: NoteSummary | null
  onChange: (note: NoteSummary) => void
  placeholder?: string
  disabled?: boolean
}

interface Option {
  note: NoteSummary
  /** The sentence the match came from — only ever set for full-text hits. */
  snippet?: string
}

/** Title matches first, prefix before substring, then alphabetical. */
function rankTitles(notes: NoteSummary[], query: string): NoteSummary[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return notes

  const starts: NoteSummary[] = []
  const contains: NoteSummary[] = []

  for (const note of notes) {
    const title = note.title.toLowerCase()
    if (title.startsWith(needle)) starts.push(note)
    else if (title.includes(needle) || note.slug.includes(needle)) contains.push(note)
  }

  return [...starts, ...contains]
}

export function NotePicker({
  label,
  notes,
  value,
  onChange,
  placeholder = 'Search your notes…',
  disabled = false,
}: NotePickerProps) {
  const listId = useId()
  const inputId = useId()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [matches, setMatches] = useState<SearchResult[]>([])

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const bySlug = useMemo(() => {
    const map = new Map<string, NoteSummary>()
    for (const note of notes) map.set(note.slug, note)
    return map
  }, [notes])

  /* -- full-text pass, debounced and abortable -------------------------- */

  useEffect(() => {
    const needle = query.trim()
    if (!open || needle.length < 2) {
      setMatches([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      getJson<SearchResult[]>(`/api/search?q=${encodeURIComponent(needle)}`, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) setMatches(found)
        })
        .catch((cause: unknown) => {
          // A failed search silently degrades to title-only matching: the
          // picker still works, so this is not worth an error panel.
          if (!isAbort(cause) && !controller.signal.aborted) setMatches([])
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, open])

  /* -- the merged option list ------------------------------------------- */

  const options = useMemo<Option[]>(() => {
    const titled = rankTitles(notes, query)
    const seen = new Set(titled.map((n) => n.slug))
    const list: Option[] = titled.map((note) => ({ note }))

    for (const hit of matches) {
      if (seen.has(hit.slug)) continue
      const note = bySlug.get(hit.slug)
      if (!note) continue
      seen.add(hit.slug)
      list.push({ note, snippet: hit.snippet })
    }

    return list
  }, [notes, query, matches, bySlug])

  const visible = options.slice(0, MAX_OPTIONS)
  const hidden = options.length - visible.length

  // Keep the highlight in range whenever the list changes underneath it.
  useEffect(() => {
    setActive((current) => (current < visible.length ? current : 0))
  }, [visible.length])

  /* -- open / close ------------------------------------------------------ */

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  // Follow the highlight with the scroll container, keyboard navigation only.
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.children[active] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = useCallback(
    (option: Option | undefined) => {
      if (!option) return
      onChange(option.note)
      close()
      inputRef.current?.blur()
    },
    [onChange, close],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        if (visible.length === 0) return 0
        return (current + step + visible.length) % visible.length
      })
      return
    }

    if (event.key === 'Enter') {
      if (!open) return
      event.preventDefault()
      pick(visible[active])
      return
    }

    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      close()
      return
    }

    if (event.key === 'Tab') close()
  }

  const showing = open ? query : (value?.title ?? '')

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint"
      >
        {label}
      </label>

      <div
        className={`flex items-center gap-2 rounded-panel border bg-surface-alt px-2.5 py-2 transition-colors ${
          open ? 'border-accent-dim' : 'border-border hover:border-[#464646]'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <Icon name="search" size={14} className="shrink-0 text-text-faint" />

        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && visible.length ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={showing}
          placeholder={value ? value.title : placeholder}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        />

        {value && !open ? (
          <span className="hidden shrink-0 truncate text-[11px] text-text-faint sm:inline">
            {value.folder ?? 'No folder'}
          </span>
        ) : null}

        <Icon
          name="chevron-right"
          size={14}
          className={`shrink-0 text-text-faint transition-transform ${open ? 'rotate-90' : 'rotate-90 opacity-60'}`}
        />
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-panel border border-border bg-surface-alt shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={`${label} note`}
            className="max-h-64 overflow-y-auto py-1"
          >
            {visible.length === 0 ? (
              <li className="px-3 py-4 text-center text-ui text-text-muted">
                No note matches “{query.trim()}”.
              </li>
            ) : (
              visible.map((option, index) => {
                const selected = option.note.slug === value?.slug
                return (
                  <li
                    key={option.note.slug}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={selected}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => pick(option)}
                    className={`cursor-pointer px-3 py-1.5 ${
                      index === active ? 'bg-accent-dim/20' : ''
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`min-w-0 flex-1 truncate text-ui ${
                          index === active ? 'text-accent' : 'text-text'
                        }`}
                      >
                        {option.note.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-text-faint">
                        {option.note.folder ?? '—'}
                      </span>
                    </div>
                    {option.snippet ? (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-text-faint">
                        {option.snippet}
                      </p>
                    ) : null}
                  </li>
                )
              })
            )}
          </ul>

          {hidden > 0 ? (
            <p className="border-t border-border px-3 py-1.5 text-[11px] text-text-faint">
              {hidden} more — keep typing to narrow it down.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Same footprint as the real picker, so nothing shifts when the vault lands. */
export function NotePickerSkeleton({ label }: { label: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        {label}
      </p>
      <div className="rounded-panel border border-border bg-surface px-2.5 py-2">
        <Skeleton height="1.15rem" width="70%" />
      </div>
    </div>
  )
}

export default NotePicker
