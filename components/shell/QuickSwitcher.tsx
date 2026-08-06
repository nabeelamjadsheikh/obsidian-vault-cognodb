'use client'

/**
 * ⌘P / Ctrl-P — jump to any note without touching the sidebar.
 *
 * With an empty box it lists the most recently edited notes, so the shortcut
 * is useful before you have typed anything and teaches itself on first press.
 * Typing runs the same `/api/search` the sidebar uses, debounced.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState, ErrorState, Icon, Skeleton } from '@/components/ui'
import type { SearchResult } from '@/lib/types'
import { useVault } from './VaultProvider'
import { useApi, useDebounced } from './useApi'

interface Row {
  slug: string
  title: string
  detail: string
}

export function QuickSwitcher() {
  const { quickOpen, setQuickOpen, open, vault } = useVault()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const debounced = useDebounced(query.trim(), 180)
  const listRef = useRef<HTMLUListElement>(null)

  const search = useApi<SearchResult[]>(
    quickOpen && debounced.length > 0 ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  )

  // Reset on every open: a switcher that remembers last time's query is a
  // switcher you have to clear before you can use it.
  useEffect(() => {
    if (quickOpen) {
      setQuery('')
      setCursor(0)
    }
  }, [quickOpen])

  const rows: Row[] = useMemo(() => {
    if (!debounced) {
      return vault.notes.slice(0, 12).map((note) => ({
        slug: note.slug,
        title: note.title,
        detail: note.folder ?? 'Vault root',
      }))
    }
    return (search.data ?? []).map((result) => ({
      slug: result.slug,
      title: result.title,
      detail: result.snippet,
    }))
  }, [debounced, search.data, vault.notes])

  useEffect(() => {
    setCursor(0)
  }, [debounced])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
      block: 'nearest',
    })
  }, [cursor, rows])

  if (!quickOpen) return null

  const choose = (row: Row) => {
    open({ kind: 'note', slug: row.slug, title: row.title })
    setQuickOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuickOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((index) => (rows.length === 0 ? 0 : (index + 1) % rows.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((index) => (rows.length === 0 ? 0 : (index - 1 + rows.length) % rows.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[cursor]
      if (row) choose(row)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Quick switcher"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setQuickOpen(false)
      }}
    >
      <div
        className="flex max-h-[62vh] w-full max-w-xl flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Icon name="search" size={16} className="shrink-0 text-text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a note by name or content…"
            aria-label="Find a note"
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
          />
          <kbd className="shrink-0 rounded-[3px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
            esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {search.error ? (
            <ErrorState
              code={search.error.code}
              message={search.error.message}
              size="compact"
              onRetry={search.reload}
            />
          ) : search.loading ? (
            <div className="flex flex-col gap-3 p-4" role="status" aria-label="Searching">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton width="40%" height={12} />
                  <Skeleton width="85%" height={10} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              size="compact"
              icon="search"
              message={debounced ? `Nothing matches “${debounced}”` : 'No notes yet'}
              hint={debounced ? 'Try fewer words.' : 'Create a note to get started.'}
            />
          ) : (
            <ul ref={listRef} className="py-1">
              {rows.map((row, index) => {
                const active = index === cursor
                return (
                  <li key={row.slug}>
                    <button
                      type="button"
                      data-active={active}
                      onPointerEnter={() => setCursor(index)}
                      onClick={() => choose(row)}
                      className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors ${
                        active ? 'bg-surface-alt' : ''
                      }`}
                    >
                      <span
                        className={`w-full truncate text-ui ${active ? 'text-accent' : 'text-text'}`}
                      >
                        {row.title}
                      </span>
                      <span className="line-clamp-2 w-full text-[11px] text-text-faint">
                        {row.detail}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3.5 py-2 text-[11px] text-text-faint">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span className="ml-auto">
            {debounced ? 'Searching every note' : 'Recently edited'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default QuickSwitcher
