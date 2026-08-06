'use client'

/**
 * Every tag in the vault, with how many notes carry it.
 *
 * Selecting one filters the file list rather than navigating: a tag is a lens
 * on the vault you already have open, not a place you go. The selected tag
 * stays visible here and as a clearable chip above the file list, so the user
 * can always see why they are looking at 36 notes instead of 187.
 */

import { useMemo, useState } from 'react'
import { EmptyState, ErrorState, Skeleton, TagPill } from '@/components/ui'
import { useVault } from '@/components/shell/VaultProvider'

export function TagPane() {
  const { vault, tagFilter, setTagFilter, setSidebarPane } = useVault()
  const [filter, setFilter] = useState('')

  const tags = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return vault.tags
      .filter((tag) => !needle || tag.name.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [vault.tags, filter])

  const select = (name: string) => {
    // Toggling off restores the whole vault; either way the user is sent back
    // to the file list, which is where the answer to "so what?" lives.
    setTagFilter(tagFilter === name ? null : name)
    setSidebarPane('files')
  }

  if (vault.error) {
    return (
      <ErrorState
        code={vault.error.code}
        message={vault.error.message}
        size="compact"
        onRetry={vault.reload}
      />
    )
  }

  if (vault.loading && vault.tags.length === 0) {
    return (
      <div className="flex flex-wrap gap-2 px-3 pt-3" role="status" aria-label="Loading tags">
        {['58px', '74px', '46px', '90px', '62px', '52px', '80px', '68px', '48px', '86px'].map(
          (width, index) => (
            <Skeleton key={index} width={width} height={18} rounded="full" />
          ),
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-surface px-3 pb-2 pt-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
            Tags
          </h2>
          <span className="text-[11px] tabular-nums text-text-faint">{vault.tags.length}</span>
          {tagFilter ? (
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className="ml-auto rounded-[3px] px-1.5 py-0.5 text-[11px] text-text-faint transition-colors hover:bg-surface-alt hover:text-text-muted"
            >
              Clear filter
            </button>
          ) : null}
        </div>

        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter tags…"
          aria-label="Filter tags"
          className="w-full rounded-[5px] border border-border bg-bg px-2 py-1.5 text-ui text-text outline-none placeholder:text-text-faint focus:border-accent-dim"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {vault.tags.length === 0 ? (
          <EmptyState
            size="compact"
            icon="tag"
            message="No tags yet"
            hint="Write #like-this in a note and the tag will show up here."
          />
        ) : tags.length === 0 ? (
          <EmptyState size="compact" icon="tag" message={`No tag matches “${filter.trim()}”`} />
        ) : (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <li key={tag.name}>
                <TagPill
                  name={tag.name}
                  count={tag.count}
                  active={tagFilter === tag.name}
                  onSelect={select}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default TagPane
