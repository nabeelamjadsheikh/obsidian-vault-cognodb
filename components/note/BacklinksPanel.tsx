'use client'

/**
 * Inbound links — every note that points at this one, each with the sentence
 * the link was written in.
 *
 * The sentence is the entire point. A list of note titles is a list of
 * filenames; a list of sentences is the vault explaining, in your own prose,
 * why these notes are connected. So the context gets the room and the title
 * gets one line above it, not the other way round.
 */

import { EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { stripWikilinks } from '@/lib/markdown'
import { isDatabaseError, type Backlink } from '@/lib/types'

import { Panel } from './Panel'
import { NoteLink } from './parts'
import { useResource } from './api'

/** Escape a title before it becomes part of a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Show where in the sentence this note was named.
 *
 * Without it the reader has to re-scan the sentence hunting for the link they
 * followed; with it the connection is visible in one saccade.
 */
function Context({ text, highlight }: { text: string; highlight: string }) {
  const plain = stripWikilinks(text)
  const needle = highlight.trim()

  if (!plain) {
    return <span className="italic text-text-faint">Linked without surrounding text.</span>
  }
  if (!needle) return <>{plain}</>

  const parts = plain.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'))

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <span key={i} className="text-accent">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function BacklinkRow({ backlink, title }: { backlink: Backlink; title: string }) {
  return (
    <li className="border-l-2 border-border py-1.5 pl-3 transition-colors hover:border-accent-dim">
      <NoteLink slug={backlink.slug} title={backlink.title} className="text-ui font-medium" />
      <p className="mt-1 font-serif text-[13.5px] leading-relaxed text-text-muted">
        <Context text={backlink.context} highlight={title} />
      </p>
    </li>
  )
}

export interface BacklinksPanelProps {
  slug: string
  /** The current note's title, highlighted inside each context sentence. */
  title: string
  /** Bumped after a save so the panel reflects the graph the save just wrote. */
  version: number
}

export function BacklinksPanel({ slug, title, version }: BacklinksPanelProps) {
  const { resource, retry, retrying } = useResource<Backlink[]>(
    `/api/notes/${encodeURIComponent(slug)}/backlinks`,
    version,
  )

  const count = resource.status === 'ready' ? resource.data.length : null

  return (
    <Panel
      title={count === null ? 'Backlinks' : `${count} ${count === 1 ? 'backlink' : 'backlinks'}`}
      subtitle="notes that link here"
      loading={resource.status === 'loading'}
    >
      {resource.status === 'loading' ? (
        <ul className="flex flex-col gap-4" aria-label="Loading backlinks">
          {[0, 1].map((i) => (
            <li key={i} className="flex flex-col gap-2 pl-3">
              <Skeleton width="38%" />
              <Skeleton width="92%" />
              <Skeleton width="70%" />
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
          icon="graph"
          size="compact"
          message="No notes link here yet."
          hint={`Write [[${title}]] inside another note and it will show up here, with the sentence around it.`}
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {resource.data.map((backlink) => (
            <BacklinkRow key={backlink.slug} backlink={backlink} title={title} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default BacklinksPanel
