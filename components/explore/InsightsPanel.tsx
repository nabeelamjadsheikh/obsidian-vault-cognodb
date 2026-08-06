'use client'

/**
 * What shape is this vault in?
 *
 * Three readings of the same graph, in descending order of how often you act
 * on them: how big it is, what has fallen out of it, and what holds it
 * together.
 *
 * The hub bar is the only chart here. Inbound and outbound degree are not two
 * independent series — they are a polarity, so the bar diverges from a neutral
 * centre rule: everything left of the line is links the note sends out (an
 * index, a map of contents), everything right of it is links pointing in (a
 * destination the vault keeps returning to). Both counts are printed at the
 * ends, so the colours are never carrying the meaning on their own.
 */

import type { HubNote, Insights, NoteSummary, VaultStats } from '@/lib/types'
import { EmptyState, ErrorState, Skeleton, TagPill } from '@/components/ui'
import { useResource } from './fetching'
import { HUB_IN, HUB_OUT, KIND_COLOUR } from './palette'

/* ------------------------------------------------------------- stat tiles */

interface Tile {
  key: keyof VaultStats
  label: string
  /** Plain-language gloss, so nobody has to guess what "stubs" means. */
  hint: string
  /** Identity dot. Text stays in text tokens; only the dot carries colour. */
  dot: string
}

const TILES: Tile[] = [
  { key: 'notes', label: 'Notes', hint: 'Pages you have written', dot: KIND_COLOUR.Note },
  { key: 'links', label: 'Links', hint: 'Connections between notes', dot: '#7c5cbf' },
  { key: 'tags', label: 'Tags', hint: 'Topics in use', dot: KIND_COLOUR.Tag },
  { key: 'people', label: 'People', hint: 'Named in your notes', dot: KIND_COLOUR.Person },
  { key: 'sources', label: 'Sources', hint: 'Books and papers cited', dot: KIND_COLOUR.Source },
  { key: 'stubs', label: 'Unwritten', hint: 'Linked to, not yet written', dot: '#6a6a6a' },
]

function StatTiles({ stats }: { stats: VaultStats }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {TILES.map((tile) => (
        <div
          key={tile.key}
          className="rounded-panel border border-border bg-surface px-3 py-2.5"
        >
          <dt className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: tile.dot }}
            />
            <span className="truncate text-[11px] font-medium uppercase tracking-[0.07em] text-text-muted">
              {tile.label}
            </span>
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums leading-none text-text">
            {stats[tile.key].toLocaleString()}
          </dd>
          <p className="mt-1 text-[11px] leading-tight text-text-faint">{tile.hint}</p>
        </div>
      ))}
    </dl>
  )
}

/* ---------------------------------------------------------------- orphans */

function Orphans({
  orphans,
  onOpenNote,
}: {
  orphans: NoteSummary[]
  onOpenNote?: (slug: string) => void
}) {
  if (orphans.length === 0) {
    return (
      <EmptyState
        icon="graph"
        message="Every note is connected to something"
        hint="Nothing has fallen out of the graph. This is the good outcome."
        size="compact"
      />
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {orphans.map((note) => {
        const openable = Boolean(onOpenNote)
        const inner = (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className={`min-w-0 flex-1 truncate text-ui font-medium ${
                  openable ? 'text-text group-hover:text-accent' : 'text-text'
                }`}
              >
                {note.title}
              </span>
              <span className="shrink-0 text-[11px] text-text-faint">{note.folder ?? '—'}</span>
            </div>
            {note.tags.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {note.tags.slice(0, 4).map((tag) => (
                  <TagPill key={tag} name={tag} />
                ))}
              </div>
            ) : null}
          </>
        )

        const shell =
          'group block w-full rounded-[4px] border border-border bg-surface px-3 py-2 text-left transition-colors'

        return (
          <li key={note.slug}>
            {openable ? (
              <button
                type="button"
                onClick={() => onOpenNote?.(note.slug)}
                className={`${shell} hover:border-accent-dim`}
              >
                {inner}
              </button>
            ) : (
              <div className={shell}>{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------- hubs */

function HubBar({ hub, scale }: { hub: HubNote; scale: number }) {
  const out = scale > 0 ? (hub.outbound / scale) * 100 : 0
  const inn = scale > 0 ? (hub.inbound / scale) * 100 : 0

  return (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-text-muted">
        {hub.outbound}
      </span>

      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex flex-1 justify-end">
          <span
            className="h-2 rounded-l-[4px]"
            style={{ width: `${out}%`, backgroundColor: HUB_OUT }}
          />
        </div>
        {/* Neutral midpoint, with a 2px surface gap on each side so the two
            fills never touch and read as one bar. */}
        <span aria-hidden className="mx-[2px] h-3.5 w-px shrink-0 bg-border" />
        <div className="flex-1">
          <span
            className="block h-2 rounded-r-[4px]"
            style={{ width: `${inn}%`, backgroundColor: HUB_IN }}
          />
        </div>
      </div>

      <span className="w-5 shrink-0 text-[11px] tabular-nums text-text-muted">{hub.inbound}</span>
    </div>
  )
}

function Hubs({ hubs, onOpenNote }: { hubs: HubNote[]; onOpenNote?: (slug: string) => void }) {
  if (hubs.length === 0) {
    return (
      <EmptyState
        icon="graph"
        message="No hubs yet"
        hint="Once notes start linking to each other, the busiest ones show up here."
        size="compact"
      />
    )
  }

  const scale = Math.max(1, ...hubs.map((h) => Math.max(h.inbound, h.outbound)))

  return (
    <div className="rounded-panel border border-border bg-surface p-3">
      {/* Legend: two series always get one, and it doubles as the reading key. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-4 rounded-[2px]"
            style={{ backgroundColor: HUB_OUT }}
          />
          Links out — this note points elsewhere
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-4 rounded-[2px]"
            style={{ backgroundColor: HUB_IN }}
          />
          Links in — other notes point here
        </span>
      </div>

      <ol className="flex flex-col gap-2.5">
        {hubs.map((hub, index) => (
          <li key={hub.slug} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="w-4 shrink-0 text-[11px] tabular-nums text-text-faint">
                {index + 1}
              </span>
              {onOpenNote ? (
                <button
                  type="button"
                  onClick={() => onOpenNote(hub.slug)}
                  className="min-w-0 flex-1 truncate text-left text-ui text-text transition-colors hover:text-accent"
                >
                  {hub.title}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-ui text-text">{hub.title}</span>
              )}
              <span className="shrink-0 text-[11px] tabular-nums text-text-faint">
                {hub.inbound + hub.outbound} total
              </span>
            </div>
            <div className="pl-6">
              <HubBar hub={hub} scale={scale} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ---------------------------------------------------------------- loading */

function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading vault insights">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-panel border border-border bg-surface px-3 py-2.5">
            <Skeleton width="60%" height="0.65rem" />
            <Skeleton width="45%" height="1.5rem" className="mt-2" />
            <Skeleton width="80%" height="0.6rem" className="mt-2" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="flex flex-col gap-2">
            <Skeleton width="9rem" height="1rem" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} height="2.6rem" rounded="md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- pane */

export interface InsightsPanelProps {
  onOpenNote?: (slug: string) => void
}

export function InsightsPanel({ onOpenNote }: InsightsPanelProps) {
  const { state, reload } = useResource<Insights>('/api/insights')

  if (state.phase === 'loading') return <InsightsSkeleton />

  if (state.phase === 'error') {
    return (
      <ErrorState
        code={state.error.code}
        message={state.error.message}
        onRetry={reload}
        size="compact"
        className="rounded-panel border border-border bg-surface"
      />
    )
  }

  const { stats, orphans, hubs } = state.data

  return (
    <div className="flex flex-col gap-6">
      <StatTiles stats={stats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="explore-orphans">
          <h3 id="explore-orphans" className="text-sm font-medium text-text">
            Orphan notes
            {orphans.length > 0 ? (
              <span className="ml-2 text-ui font-normal tabular-nums text-text-faint">
                {orphans.length}
              </span>
            ) : null}
          </h3>
          <p className="mb-2.5 mt-1 text-ui text-text-muted">
            Nothing links here and nothing links out — either connect it to something, or let it
            go.
          </p>
          <Orphans orphans={orphans} onOpenNote={onOpenNote} />
        </section>

        <section aria-labelledby="explore-hubs">
          <h3 id="explore-hubs" className="text-sm font-medium text-text">
            Hub notes
          </h3>
          <p className="mb-2.5 mt-1 text-ui text-text-muted">
            The most connected notes in the vault. These are the ideas everything else hangs off.
          </p>
          <Hubs hubs={hubs} onOpenNote={onOpenNote} />
        </section>
      </div>
    </div>
  )
}

export default InsightsPanel
