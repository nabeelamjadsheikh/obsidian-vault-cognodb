'use client'

/**
 * Full-text search over the vault.
 *
 * Debounced rather than submitted: search is how you navigate a vault you half
 * remember, and waiting for Enter breaks that. The snippet the API returns is
 * already elided around the match, so the row shows the sentence that matched
 * instead of just the filename.
 */

import { useEffect, useRef, useState } from 'react'
import { EmptyState, ErrorState, Icon, Skeleton } from '@/components/ui'
import type { SearchResult } from '@/lib/types'
import { useVault } from '@/components/shell/VaultProvider'
import { useApi, useDebounced } from '@/components/shell/useApi'

export function SearchPane() {
  const { open, activeTab } = useVault()
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim(), 200)
  const inputRef = useRef<HTMLInputElement>(null)

  // Opening the pane and then having to click the box would be a wasted step.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data, error, loading, reload } = useApi<SearchResult[]>(
    debounced.length > 0 ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  )

  const results = data ?? []
  const activeSlug = activeTab?.kind === 'note' ? activeTab.slug : null

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 bg-surface px-2 pb-2 pt-2">
        <div className="flex items-center gap-2 rounded-[5px] border border-border bg-bg px-2 py-1.5 focus-within:border-accent-dim">
          <Icon name="search" size={14} className="shrink-0 text-text-faint" />
          <input
            ref={inputRef}
            // Deliberately not type="search": Chrome adds its own cancel
            // button, which would sit next to ours and look like a bug.
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search all notes…"
            aria-label="Search all notes"
            className="min-w-0 flex-1 bg-transparent text-ui text-text outline-none placeholder:text-text-faint"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="shrink-0 text-text-faint transition-colors hover:text-text"
            >
              <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </div>

        {debounced && !loading && !error ? (
          <p className="px-1 pt-2 text-[11px] text-text-faint">
            {results.length} {results.length === 1 ? 'match' : 'matches'}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-6">
        {error ? (
          <ErrorState code={error.code} message={error.message} size="compact" onRetry={reload} />
        ) : loading ? (
          <div className="flex flex-col gap-3 px-2 pt-2" role="status" aria-label="Searching">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton width="55%" height={12} />
                <Skeleton width="92%" height={10} />
                <Skeleton width="70%" height={10} />
              </div>
            ))}
          </div>
        ) : !debounced ? (
          <EmptyState
            size="compact"
            icon="search"
            message="Search the whole vault"
            hint="Type a word or phrase. Titles and note bodies are both searched."
          />
        ) : results.length === 0 ? (
          <EmptyState
            size="compact"
            icon="search"
            message={`Nothing matches “${debounced}”`}
            hint="Try a shorter word, or check the spelling."
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {results.map((result) => (
              <li key={result.slug}>
                <button
                  type="button"
                  onClick={(event) =>
                    open(
                      { kind: 'note', slug: result.slug, title: result.title },
                      { newTab: event.metaKey || event.ctrlKey },
                    )
                  }
                  className={`flex w-full flex-col items-start gap-1 rounded-[4px] px-2 py-2 text-left transition-colors ${
                    result.slug === activeSlug ? 'bg-surface-alt' : 'hover:bg-surface-alt/60'
                  }`}
                >
                  <span className="w-full truncate text-ui font-medium text-text">
                    {result.title}
                  </span>
                  <span className="line-clamp-3 text-[11.5px] leading-relaxed text-text-muted">
                    {result.snippet}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default SearchPane
