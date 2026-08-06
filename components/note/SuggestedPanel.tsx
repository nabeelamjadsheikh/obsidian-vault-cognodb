'use client'

/**
 * Connections the graph thinks are missing.
 *
 * Every row has to answer "why is this here?" before the reader will trust it,
 * so the shared entities are the loudest thing in the row — `shares Herbert
 * Simon, The Sciences of the Artificial` is a reason; `85% match` is a number
 * nobody can check. One button turns the reason into a real `[[link]]`, and the
 * row disappears on the next refresh because the suggestion query excludes
 * notes that are already linked. That loop is the feature.
 */

import { useState } from 'react'

import { EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { isDatabaseError, type Suggestion } from '@/lib/types'

import { Panel } from './Panel'
import { NoteLink } from './parts'
import { useResource } from './api'

function SuggestionRow({
  suggestion,
  onLink,
  busy,
  disabled,
}: {
  suggestion: Suggestion
  onLink: (suggestion: Suggestion) => Promise<void>
  busy: boolean
  disabled: boolean
}) {
  return (
    <li className="rounded-panel border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent-dim">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <NoteLink
            slug={suggestion.slug}
            title={suggestion.title}
            className="text-ui font-medium"
          />

          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ui text-text-faint">
            <span>shares</span>
            {suggestion.via.map((entity) => (
              <span
                key={entity}
                className="rounded-[4px] bg-surface-alt px-1.5 py-px text-text-muted"
              >
                {entity}
              </span>
            ))}
            <span className="text-text-faint">
              · {suggestion.strength} in common
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onLink(suggestion)}
          disabled={busy || disabled}
          title={`Add [[${suggestion.title}]] to the end of this note`}
          className="shrink-0 rounded-[4px] border border-border bg-surface-alt px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:border-accent-dim hover:text-accent disabled:cursor-not-allowed disabled:border-border disabled:text-text-faint"
        >
          {busy ? 'Linking…' : 'Link'}
        </button>
      </div>
    </li>
  )
}

export interface SuggestedPanelProps {
  slug: string
  /** Bumped after a save so accepted suggestions drop off the list. */
  version: number
  /** Append `[[title]]` to the note and save. Rejects if the save fails. */
  onLink: (suggestion: Suggestion) => Promise<void>
  /** True while some other write is in flight — one save at a time. */
  disabled: boolean
}

export function SuggestedPanel({ slug, version, onLink, disabled }: SuggestedPanelProps) {
  const { resource, retry, retrying } = useResource<Suggestion[]>(
    `/api/notes/${encodeURIComponent(slug)}/suggested`,
    version,
  )
  const [pending, setPending] = useState<string | null>(null)

  async function handleLink(suggestion: Suggestion) {
    setPending(suggestion.slug)
    try {
      await onLink(suggestion)
    } finally {
      setPending(null)
    }
  }

  const count = resource.status === 'ready' ? resource.data.length : null

  return (
    <Panel
      title="Suggested connections"
      subtitle={
        count === null
          ? 'notes that share tags, people or sources'
          : count === 0
            ? 'nothing unlinked'
            : `${count} not linked yet`
      }
      loading={resource.status === 'loading'}
    >
      {resource.status === 'loading' ? (
        <ul className="flex flex-col gap-2" aria-label="Loading suggestions">
          {[0, 1].map((i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-panel border border-border bg-surface px-3 py-3"
            >
              <Skeleton width="45%" />
              <Skeleton width="75%" />
            </li>
          ))}
        </ul>
      ) : resource.status === 'failed' ? (
        <ErrorState
          code={resource.problem.code}
          message={resource.problem.message}
          onRetry={retry}
          retrying={retrying}
          size={isDatabaseError(resource.problem.code) ? 'full' : 'compact'}
        />
      ) : resource.data.length === 0 ? (
        <EmptyState
          icon="tag"
          size="compact"
          message="Nothing to suggest right now."
          hint="Suggestions appear when another note shares two or more tags, people or sources with this one and isn't linked to it yet."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {resource.data.map((suggestion) => (
            <SuggestionRow
              key={suggestion.slug}
              suggestion={suggestion}
              onLink={handleLink}
              busy={pending === suggestion.slug}
              disabled={disabled && pending !== suggestion.slug}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default SuggestedPanel
